/* eslint-disable import/prefer-default-export */
/* eslint-disable prettier/prettier */
import { Body, Controller, Post, Response, Route, Tags } from 'tsoa';
import { OAuth2Client } from 'google-auth-library';
import InvalidParametersError from '../lib/InvalidParametersError';
import UserStore from '../lib/UserStore';
import { QuerySQL, connection } from '../api/SqlCalls';

/**
 * Authentication controller for handling OAuth and user authentication
 */
@Route('auth')
@Tags('auth')
export class AuthController extends Controller {
  private _userStore: UserStore = UserStore.getInstance();

  private _db = new QuerySQL();

  private _googleClient: OAuth2Client | null = null;

  constructor() {
    super();

    // Use environment variable
    const googleClientId = process.env.GOOGLE_CLIENT_ID;
    const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
    // Google only accepts HTTP on localhost — NOT HTTPS
    // IMPORTANT: This redirect URI MUST match exactly what's configured in Google Cloud Console
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;

    console.log('Google OAuth Configuration:', {
      clientId: googleClientId,
      hasClientId: !!googleClientId,
      hasClientSecret: !!googleClientSecret,
      redirectUri,
      clientIdSource: process.env.GOOGLE_CLIENT_ID ? 'env' : 'hardcoded',
    });

    if (googleClientId && googleClientSecret) {
      // OAuth2Client doesn't need redirectUri in constructor - it's passed to getToken()
      this._googleClient = new OAuth2Client(googleClientId, googleClientSecret);
      console.log('Google OAuth client initialized successfully');
      console.log('Using redirect URI:', redirectUri);
    } else {
      console.error('Google OAuth NOT configured. Missing Client ID or Secret.');
      console.error(
        'GOOGLE_CLIENT_SECRET environment variable:',
        googleClientSecret ? 'SET' : 'NOT SET',
      );
    }
  }

  /**
   * -------------------------
   *     USER LOGIN (LOCAL)
   * -------------------------
   */
  @Post('login')
@Response<InvalidParametersError>(400, 'Invalid username or password')
public async login(
  @Body() body: { username: string; password: string },
): Promise<{ userId: number; email: string; name: string; accountUsername: string }> { // Add accountUsername
  console.log('LOGIN REQUEST:', body);

  const { username, password } = body;

  if (!username || !password) {
    throw new InvalidParametersError('Username and password required');
  }

  const [rows] = await connection.execute<any[]>(
    'SELECT id, userName, email FROM Users WHERE userName = ?',
    [username],
  );

  if (!rows || rows.length === 0) {
    throw new InvalidParametersError('Invalid username or password');
  }

  const user = rows[0];

  const valid = await this._db.passwordChallenge(password, user.id);

  if (!valid) {
    throw new InvalidParametersError('Invalid username or password');
  }

  return {
    userId: user.id,
    email: user.email,
    name: user.userName,
    accountUsername: user.userName, // Add this line
  };
}

  /**
   * -------------------------
   *    USER REGISTRATION
   * -------------------------
   */
  @Post('register')
@Response<InvalidParametersError>(400, 'Invalid registration data')
public async register(
  @Body() body: { username: string; email: string; password: string },
): Promise<{ message: string; accountUsername: string }> { // Add accountUsername
  console.log('REGISTER REQUEST BODY:', body);

  const { username, email, password } = body;

  if (!username || !email || !password) {
    throw new InvalidParametersError('All fields required');
  }

  // Check if username exists
  const [rows] = await connection.execute<any[]>(
    'SELECT userName FROM Users WHERE userName = ?',
    [username],
  );

  if (rows.length > 0) {
    throw new InvalidParametersError('Username already exists');
  }

  try {
    console.log('Creating user in DB:', { username, email });
    await this._db.constructNewUser(username, email, password);
  } catch (err: any) {
    console.error('MYSQL INSERT ERROR:', err);
    let errorMessage = 'Database insert failed';
    if (err instanceof Error) {
      errorMessage = err.message;
    } else if (err?.code) {
      if (err.code === 'ER_DUP_ENTRY') {
        errorMessage = 'Username or email already exists';
      } else if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
        errorMessage = 'Database connection failed. Please check database configuration.';
      } else {
        errorMessage = err.message || `Database error: ${err.code}`;
      }
    }
    throw new InvalidParametersError(errorMessage);
  }

  return { 
    message: 'User registered successfully',
    accountUsername: username, // Add this line
  };
}

  /**
   * -------------------------
   *     GOOGLE LOGIN
   * -------------------------
   */
  @Post('google')
  @Response<InvalidParametersError>(400, 'Invalid token or missing configuration')
  public async verifyGoogleToken(
    @Body() requestBody: { idToken?: string; code?: string },
  ): Promise<{ userId: string; email: string; name: string }> {
    if (!this._googleClient) {
      throw new InvalidParametersError('Google OAuth not configured');
    }

    try {
      let idToken: string;

      if (requestBody.code) {
        // The redirect_uri MUST match exactly what was used in the frontend authorization request
        const redirectUri = process.env.GOOGLE_REDIRECT_URI;
        console.log('Exchanging code for tokens with redirect_uri:', redirectUri);

        const { tokens } = await this._googleClient.getToken({
          code: requestBody.code,
          redirect_uri: redirectUri,
        });

        if (!tokens.id_token) {
          throw new InvalidParametersError('Failed to retrieve ID token');
        }

        idToken = tokens.id_token;
      } else if (requestBody.idToken) {
        idToken = requestBody.idToken;
      } else {
        throw new InvalidParametersError('Either code or idToken required');
      }

      // Use the same client ID that was used to initialize the OAuth2Client
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const ticket = await this._googleClient.verifyIdToken({
        idToken,
        audience: clientId,
      });

      const payload = ticket.getPayload();

      if (!payload || !payload.email) {
        throw new InvalidParametersError('Invalid Google payload');
      }

      const googleId = payload.sub;
      const { email } = payload;
      const name = payload.name || email.split('@')[0];

      const user = this._userStore.findOrCreateByGoogleId(googleId, email, name);

      return {
        userId: user.id,
        email: user.email,
        name: user.name,
      };
    } catch (err) {
      console.error('GOOGLE OAUTH ERROR:', err);

      // Provide more detailed error messages
      let errorMessage = 'Failed to verify Google token';

      if (err instanceof Error) {
        errorMessage = err.message;
        console.error('Error details:', {
          name: err.name,
          message: err.message,
          stack: err.stack,
        });
      } else if (typeof err === 'object' && err !== null) {
        // Handle Google OAuth specific errors
        const errorObj = err as any;
        if (errorObj.code === 'invalid_grant') {
          errorMessage = 'Invalid authorization code. Please try signing in again.';
        } else if (errorObj.code === 'invalid_client') {
          errorMessage = `Google OAuth client configuration error: ${
            errorObj.message || 'Client ID and Secret may not match, or redirect URI mismatch'
          }. Please verify your Google Cloud Console settings.`;
          console.error('Invalid client details:', {
            code: errorObj.code,
            message: errorObj.message,
            clientId: process.env.GOOGLE_CLIENT_ID,
            hasSecret: !!process.env.GOOGLE_CLIENT_SECRET,
            redirectUri: process.env.GOOGLE_REDIRECT_URI,
          });
        } else if (errorObj.message) {
          errorMessage = errorObj.message;
        }
        console.error('Error object:', JSON.stringify(errorObj, null, 2));
      }

      throw new InvalidParametersError(errorMessage);
    }
  }
}

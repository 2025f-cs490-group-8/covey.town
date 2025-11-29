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

  const googleClientId = '850515244022-u8td0lf0jpqfu1as1457aaelb9tt6hrd.apps.googleusercontent.com';
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  // Google only accepts HTTP on localhost — NOT HTTPS
  const redirectUri = 'http://localhost:3000';

  if (googleClientId && googleClientSecret) {
    this._googleClient = new OAuth2Client(
      googleClientId,
      googleClientSecret,
      redirectUri, // FIXED
    );
  } else {
    console.error('Google OAuth NOT configured. Missing Client ID or Secret.');
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
  ): Promise<{ userId: number; email: string; name: string }> {

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
  ): Promise<{ message: string }> {

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
      // Extract more detailed error message
      let errorMessage = 'Database insert failed';
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (err?.code) {
        // MySQL error codes
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

    return { message: 'User registered successfully' };
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
      throw new InvalidParametersError(
        'Google OAuth not configured',
      );
    }

    try {
      let idToken: string;

      if (requestBody.code) {
        const { tokens } = await this._googleClient.getToken({
          code: requestBody.code,
          redirect_uri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000',
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

      const ticket = await this._googleClient.verifyIdToken({
        idToken,
        audience: '850515244022-u8td0lf0jpqfu1as1457aaelb9tt6hrd.apps.googleusercontent.com',
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
      throw new InvalidParametersError('Failed to verify Google token');
    }
  }
}




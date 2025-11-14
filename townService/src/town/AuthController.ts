import {
  Body,
  Controller,
  Post,
  Response,
  Route,
  Tags,
} from 'tsoa';
import { OAuth2Client } from 'google-auth-library';
import InvalidParametersError from '../lib/InvalidParametersError';
import UserStore from '../lib/UserStore';

/**
 * Authentication controller for handling OAuth and user authentication
 */
@Route('auth')
@Tags('auth')
export class AuthController extends Controller {
  private _userStore: UserStore = UserStore.getInstance();
  private _googleClient: OAuth2Client | null = null;

  constructor() {
    super();
    // Initialize Google OAuth client if client ID is provided
    const googleClientId = process.env.GOOGLE_CLIENT_ID;
    const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (googleClientId) {
      this._googleClient = new OAuth2Client(
        googleClientId,
        googleClientSecret,
        process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000',
      );
    }
  }

  /**
   * Verify Google OAuth token and create/return user
   * Supports both authorization code exchange and direct ID token verification
   * @param requestBody Either { code: string } for auth code flow or { idToken: string } for direct token
   * @returns User information
   */
  @Post('google')
  @Response<InvalidParametersError>(400, 'Invalid token or missing configuration')
  public async verifyGoogleToken(
    @Body() requestBody: { idToken?: string; code?: string },
  ): Promise<{ userId: string; email: string; name: string }> {
    if (!this._googleClient) {
      throw new InvalidParametersError('Google OAuth is not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.');
    }

    try {
      let idToken: string;

      // If authorization code is provided, exchange it for tokens
      if (requestBody.code) {
        const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
        if (!googleClientSecret) {
          throw new InvalidParametersError('GOOGLE_CLIENT_SECRET is required for authorization code flow');
        }

        const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000';
        console.log('Exchanging code for token with:', {
          clientId: process.env.GOOGLE_CLIENT_ID?.substring(0, 20) + '...',
          redirectUri,
          hasSecret: !!googleClientSecret,
        });
        
        const { tokens } = await this._googleClient.getToken({
          code: requestBody.code,
          redirect_uri: redirectUri,
        });

        if (!tokens.id_token) {
          throw new InvalidParametersError('Failed to get ID token from authorization code');
        }

        idToken = tokens.id_token;
      } else if (requestBody.idToken) {
        idToken = requestBody.idToken;
      } else {
        throw new InvalidParametersError('Either code or idToken must be provided');
      }

      // Verify the ID token
      const ticket = await this._googleClient.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });

      const payload = ticket.getPayload();
      if (!payload) {
        throw new InvalidParametersError('Invalid token payload');
      }

      const googleId = payload.sub;
      const email = payload.email;
      const name = payload.name || payload.email?.split('@')[0] || 'User';

      if (!email) {
        throw new InvalidParametersError('Email not provided in token');
      }

      // Find or create user
      const user = this._userStore.findOrCreateByGoogleId(googleId, email, name);

      return {
        userId: user.id,
        email: user.email,
        name: user.name,
      };
    } catch (error) {
      if (error instanceof InvalidParametersError) {
        throw error;
      }
      // Log the full error for debugging
      console.error('Google OAuth error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to verify Google token';
      console.error('Error message:', errorMessage);
      throw new InvalidParametersError(errorMessage);
    }
  }
}


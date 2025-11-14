# Google OAuth Setup Guide

This guide will help you set up Google OAuth login for Covey.Town.

## Step 1: Create Google OAuth Credentials

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the **Google+ API** (or **Google Identity Services API**):
   - Go to "APIs & Services" > "Library"
   - Search for "Google Identity Services API" or "Google+ API"
   - Click "Enable"

## Step 2: Configure OAuth Consent Screen

1. Go to "APIs & Services" > "OAuth consent screen"
2. Choose "External" (unless you have a Google Workspace)
3. Fill in the required information:
   - App name: "Covey.Town" (or your app name)
   - User support email: Your email
   - Developer contact information: Your email
4. Add scopes:
   - `openid`
   - `email`
   - `profile`
5. Add test users (if in testing mode) or publish the app

## Step 3: Create OAuth 2.0 Credentials

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth client ID"
3. Choose "Web application" as the application type
4. Configure:
   - **Name**: Covey.Town Client (or any name)
   - **Authorized JavaScript origins**:
     - `http://localhost:3000` (for local development)
     - `http://localhost:8081` (if needed)
     - Your production URL (when deployed)
   - **Authorized redirect URIs**:
     - `http://localhost:3000` (for local development)
     - Your production URL (when deployed)
5. Click "Create"
6. **Save the Client ID and Client Secret** - you'll need these!

## Step 4: Configure Environment Variables

### Backend (`townService/.env`)

Add these variables to your `townService/.env` file:

```env
GOOGLE_CLIENT_ID=your-client-id-here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret-here
GOOGLE_REDIRECT_URI=http://localhost:3000
```

### Frontend (`frontend/.env`)

Add this variable to your `frontend/.env` file:

```env
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-client-id-here.apps.googleusercontent.com
NEXT_PUBLIC_GOOGLE_REDIRECT_URI=http://localhost:3000
```

**Note**: The `NEXT_PUBLIC_` prefix is required for Next.js to expose the variable to the browser.

## Step 5: Restart Your Servers

After setting up the environment variables:

1. **Restart the backend server**:
   ```bash
   cd townService
   npm start
   ```

2. **Restart the frontend server**:
   ```bash
   cd frontend
   npm start
   ```

## Step 6: Test Google Login

1. Open your application in the browser
2. You should see a "Sign in with Google" button on the login page
3. Click it and complete the Google sign-in flow
4. You should be authenticated and redirected to the town selection screen

## Troubleshooting

### "Google OAuth is not configured" error
- Make sure `GOOGLE_CLIENT_ID` is set in `townService/.env`
- Restart the backend server after adding the variable

### "Failed to verify Google token" error
- Check that `GOOGLE_CLIENT_SECRET` is set correctly
- Verify that the redirect URI matches what you configured in Google Cloud Console
- Make sure the OAuth consent screen is properly configured

### Button doesn't appear or doesn't work
- Check that `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is set in `frontend/.env`
- Make sure the frontend server was restarted after adding the variable
- Check the browser console for errors

### Redirect URI mismatch
- The redirect URI in your `.env` files must exactly match what you configured in Google Cloud Console
- For local development, use `http://localhost:3000` (or your frontend port)
- Make sure there are no trailing slashes

## Security Notes

- **Never commit** your `.env` files to version control
- The Client Secret should only be on the backend, never exposed to the frontend
- Use different OAuth credentials for development and production
- Regularly rotate your OAuth credentials

## Production Deployment

When deploying to production:

1. Update the authorized origins and redirect URIs in Google Cloud Console to include your production domain
2. Update the environment variables with production values
3. Make sure your production domain is added to the OAuth consent screen's authorized domains


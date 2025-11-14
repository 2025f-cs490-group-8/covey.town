import React from 'react';
import { Button } from '@chakra-ui/react';
import { useGoogleLogin } from '@react-oauth/google';
import { useToast } from '@chakra-ui/react';

interface GoogleLoginButtonProps {
  onSuccess: (userInfo: { userId: string; email: string; name: string }) => void;
  onError?: (error: Error) => void;
}

export default function GoogleLoginButton({ onSuccess, onError }: GoogleLoginButtonProps): JSX.Element | null {
  const toast = useToast();
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
  
  // Debug: Log the client ID to help troubleshoot
  React.useEffect(() => {
    console.log('Google Client ID from env:', googleClientId);
    console.log('All NEXT_PUBLIC env vars:', Object.keys(process.env).filter(key => key.startsWith('NEXT_PUBLIC')));
  }, [googleClientId]);
  
  // Hooks must be called unconditionally (React rules)
  // The GoogleOAuthProvider is always present (even if with dummy client ID)
  // We'll handle the case where client ID is missing in the render
  const googleLogin = useGoogleLogin({
    flow: 'auth-code',
    redirect_uri: process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI || window.location.origin,
    onSuccess: async (codeResponse) => {
      try {
        // Exchange authorization code for ID token
        // We need to get the ID token from Google
        const url = process.env.NEXT_PUBLIC_TOWNS_SERVICE_URL || 'http://localhost:8081';
        
        // Send the authorization code to our backend, which will exchange it for an ID token
        const response = await fetch(`${url}/auth/google`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ code: codeResponse.code }),
        });

        if (!response.ok) {
          let errorMessage = 'Failed to verify Google token';
          try {
            const error = await response.json();
            errorMessage = error.message || errorMessage;
            console.error('Backend error response:', error);
          } catch (e) {
            const text = await response.text();
            console.error('Backend error (non-JSON):', text);
            errorMessage = text || errorMessage;
          }
          throw new Error(errorMessage);
        }

        const userInfo = await response.json();
        onSuccess(userInfo);
        
        toast({
          title: 'Success',
          description: `Welcome, ${userInfo.name}!`,
          status: 'success',
          duration: 2000,
        });
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Google login failed');
        if (onError) {
          onError(error);
        } else {
          toast({
            title: 'Error',
            description: error.message,
            status: 'error',
            duration: 3000,
          });
        }
      }
    },
    onError: (error) => {
      const err = new Error(error.error || 'Google login failed');
      if (onError) {
        onError(err);
      } else {
        toast({
          title: 'Error',
          description: err.message,
          status: 'error',
          duration: 3000,
        });
      }
    },
  });

  const handleClick = React.useCallback(() => {
    googleLogin();
  }, [googleLogin]);

  // If Google OAuth is not configured, show a disabled button with helpful message
  if (!googleClientId || googleClientId.length === 0) {
    return (
      // @ts-ignore - Chakra UI Button has complex union types that TypeScript struggles with
      <Button
        isDisabled
        colorScheme="gray"
        variant="outline"
        width="100%"
        title="Google OAuth not configured. Set NEXT_PUBLIC_GOOGLE_CLIENT_ID in your .env file"
      >
        Sign in with Google (Not Configured)
      </Button>
    );
  }

  return (
    // @ts-ignore - Chakra UI Button has complex union types that TypeScript struggles with
    <Button
      onClick={handleClick}
      colorScheme="red"
      variant="outline"
      width="100%"
      type="button"
    >
      Sign in with Google
    </Button>
  );
}


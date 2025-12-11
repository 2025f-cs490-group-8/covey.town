import React from 'react';
import { Button } from '@chakra-ui/react';
import { useGoogleLogin } from '@react-oauth/google';
import { useToast } from '@chakra-ui/react';

interface GoogleLoginButtonProps {
  onSuccess: (userInfo: { userId: string; email: string; name: string }) => void;
  onError?: (error: Error) => void;
}
console.log('🔥 GoogleLoginButton component loaded');

export default function GoogleLoginButton({
  onSuccess,
  onError,
}: GoogleLoginButtonProps): JSX.Element | null {
  const toast = useToast();
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  React.useEffect(() => {
    console.log('🔍 GoogleLoginButton - Client ID:', googleClientId);
    console.log(
      '🔍 GoogleLoginButton - NEXT_PUBLIC_GOOGLE_CLIENT_ID from env:',
      process.env.GOOGLE_CLIENT_ID,
    );
    console.log('🔍 GoogleLoginButton - Redirect URI:', process.env.GOOGLE_REDIRECT_URI);
  }, [googleClientId]);

  const googleLogin = useGoogleLogin({
    flow: 'auth-code',
    redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    onSuccess: async codeResponse => {
      try {
        const url = process.env.NEXT_PUBLIC_TOWNS_SERVICE_URL;

        const response = await fetch(`${url}/auth/google`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: codeResponse.code }),
        });

        if (!response.ok) {
          let errorMessage = 'Failed to verify Google token';
          try {
            const errorData = await response.json();
            errorMessage = errorData.message || errorMessage;
          } catch {
            const text = await response.text();
            errorMessage = text || errorMessage;
          }
          console.error('Google login error:', {
            status: response.status,
            statusText: response.statusText,
            message: errorMessage,
          });
          throw new Error(errorMessage);
        }

        const userInfo = await response.json();
        onSuccess(userInfo);
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Google login failed');
        onError?.(error);
        toast({
          title: 'Error',
          description: error.message,
          status: 'error',
          duration: 3000,
        });
      }
    },
    onError: error => {
      console.error('🚨 Google OAuth Error:', error);
      toast({
        title: 'Google Authorization Error',
        description:
          error?.error_description ||
          error?.error ||
          'Google login failed. Please check your OAuth client configuration in Google Cloud Console.',
        status: 'error',
        duration: 5000,
      });
    },
  });

  const handleClick = React.useCallback(() => {
    googleLogin();
  }, [googleLogin]);

  // If Google OAuth is not configured, show a disabled button with helpful message
  if (!googleClientId || googleClientId.length === 0) {
    return (
      <Button
        isDisabled
        colorScheme='gray'
        variant='outline'
        width='100%'
        title='Google OAuth not configured. Set NEXT_PUBLIC_GOOGLE_CLIENT_ID in your .env file'>
        Sign in with Google (Not Configured)
      </Button>
    );
  }

  return (
    <Button onClick={handleClick} colorScheme='red' variant='outline' width='100%' type='button'>
      Sign in with Google
    </Button>
  );
}

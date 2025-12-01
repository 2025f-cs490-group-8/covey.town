import React from 'react';
import { Button } from '@chakra-ui/react';
import { useGoogleLogin } from '@react-oauth/google';
import { useToast } from '@chakra-ui/react';

interface GoogleLoginButtonProps {
  onSuccess: (userInfo: { userId: string; email: string; name: string }) => void;
  onError?: (error: Error) => void;
}
console.log("🔥 GoogleLoginButton component loaded");

export default function GoogleLoginButton({ onSuccess, onError }: GoogleLoginButtonProps): JSX.Element | null {
  const toast = useToast();
  const googleClientId = '850515244022-u8td0lf0jpqfu1as1457aaelb9tt6hrd.apps.googleusercontent.com';
  

  React.useEffect(() => {
    console.log('Google Client ID from env:', googleClientId);
  }, [googleClientId]);
  
  const googleLogin = useGoogleLogin({
    flow: 'auth-code',
    redirect_uri: 'http://localhost:3000',   
    onSuccess: async (codeResponse) => {
      try {
        const url =
          process.env.NEXT_PUBLIC_TOWNS_SERVICE_URL ||
          'http://localhost:8081'; 

        const response = await fetch(`${url}/auth/google`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: codeResponse.code }),
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || 'Failed to verify Google token');
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
    onError: () => toast({
      title: 'Error',
      description: 'Google login failed',
      status: 'error',
      duration: 3000,
    }),
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


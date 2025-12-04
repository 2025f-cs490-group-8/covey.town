// @ts-nocheck
import { ChakraProvider } from '@chakra-ui/react';
import { MuiThemeProvider } from '@material-ui/core/styles';
import assert from 'assert';
import React, { useCallback, useEffect, useState } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { GoogleOAuthProvider, useGoogleLogin } from '@react-oauth/google';
import TownController from './classes/TownController';
import { ChatProvider } from './components/VideoCall/VideoFrontend/components/ChatProvider';
import ErrorDialog from './components/VideoCall/VideoFrontend/components/ErrorDialog/ErrorDialog';
import PreJoinScreens from './components/VideoCall/VideoFrontend/components/PreJoinScreens/PreJoinScreens';
import UnsupportedBrowserWarning from './components/VideoCall/VideoFrontend/components/UnsupportedBrowserWarning/UnsupportedBrowserWarning';
import { VideoProvider } from './components/VideoCall/VideoFrontend/components/VideoProvider';
import AppStateProvider, { useAppState } from './components/VideoCall/VideoFrontend/state';
import theme from './components/VideoCall/VideoFrontend/theme';
import useConnectionOptions from './components/VideoCall/VideoFrontend/utils/useConnectionOptions/useConnectionOptions';
import VideoOverlay from './components/VideoCall/VideoOverlay/VideoOverlay';
import TownMap from './components/Town/TownMap';
import TownControllerContext from './contexts/TownControllerContext';
import LoginControllerContext from './contexts/LoginControllerContext';
import { TownsServiceClient } from './generated/client';
import { nanoid } from 'nanoid';
import { Routes, Route } from 'react-router-dom';
import Profile from './components/SocialSidebar/Profile';
import { Box, VStack, FormControl, FormLabel, Input, Button, Heading, useToast, Text, HStack, Divider } from '@chakra-ui/react';
import ToggleChatButton from './components/VideoCall/VideoFrontend/components/Buttons/ToggleChatButton/ToggleChatButton';
import GoogleLoginButton from './components/Login/GoogleLoginButton';

function App() {
  const [townController, setTownController] = useState<TownController | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [accountUsername, setAccountUsername] = useState<string>(''); // Store the account username
  const { error, setError } = useAppState();
  const connectionOptions = useConnectionOptions();
  const toast = useToast() as any;
  
  const onDisconnect = useCallback(() => {
    townController?.disconnect();
  }, [townController]);

  const handleLogin = async (e: React.FormEvent) => {
  e.preventDefault();
  
  if (!username || !password) {
    toast({
      title: 'Error',
      description: 'Please enter both username and password',
      status: 'error',
      duration: 3000,
    });
    return;
  }

  try {
    const response = await fetch('http://localhost:8081/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username,
        password,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Login failed');
    }
    console.log('Login successful, setting accountUsername to:', data.accountUsername);

    // Store the account username for later use
    setAccountUsername(data.accountUsername);
    setIsAuthenticated(true);
    localStorage.setItem('accountUsername', data.accountUsername);
    
    toast({
      title: 'Success',
      description: 'Logged in successfully',
      status: 'success',
      duration: 2000,
    });
  } catch (error) {
    toast({
      title: 'Login Failed',
      description: error instanceof Error ? error.message : 'Invalid credentials',
      status: 'error',
      duration: 3000,
    });
  }
};

  const handleRegister = async (e: React.FormEvent) => {
  e.preventDefault();
  
  if (!username || !email || !password || !confirmPassword) {
    toast({
      title: 'Error',
      description: 'Please fill in all fields',
      status: 'error',
      duration: 3000,
    });
    return;
  }

  if (username.includes(" ")){
    toast({
      title: 'Error',
      description: 'Username can not include space',
      status: 'error',
      duration: 3000,
    });
    return;
  }

  if (password !== confirmPassword) {
    toast({
      title: 'Error',
      description: 'Passwords do not match',
      status: 'error',
      duration: 3000,
    });
    return;
  }

  if (password.length < 6) {
    toast({
      title: 'Error',
      description: 'Password must be at least 6 characters',
      status: 'error',
      duration: 3000,
    });
    return;
  }

  try {
    const response = await fetch('http://localhost:8081/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username,
        email,
        password,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Registration failed');
    }

    toast({
      title: 'Success',
      description: 'Account created! Please log in.',
      status: 'success',
      duration: 3000,
    });
    
    setShowRegister(false);
    setUsername('');
    setPassword('');
    setConfirmPassword('');
    setEmail('');
  } catch (error) {
    toast({
      title: 'Registration Failed',
      description: error instanceof Error ? error.message : 'Could not create account',
      status: 'error',
      duration: 3000,
    });
  }
};

  if (!isAuthenticated) {
    return (
      <Box 
        display="flex" 
        alignItems="center" 
        justifyContent="center" 
        minH="100vh"
        bgGradient="linear(to-br, blue.400, purple.600)"
      >
        <Box 
          maxW="400px" 
          w="full" 
          p={8} 
          borderRadius="2xl" 
          boxShadow="2xl"
          bg="white"
        >
          {!showRegister ? (
            <form onSubmit={handleLogin} style={{ width: '100%' }}>
              <VStack spacing={6}>
                <Heading size="lg" color="gray.800">Login to Covey.Town</Heading>
                
                <FormControl isRequired>
                  <FormLabel>Username</FormLabel>
                  <Input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter username"
                  />
                </FormControl>

                <FormControl isRequired>
                  <FormLabel>Password</FormLabel>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                  />
                </FormControl>

                <Button type="submit" colorScheme="blue" width="100%">
                  Login
                </Button>

                <HStack width="100%" spacing={2}>
                  <Divider />
                  <Text fontSize="sm" color="gray.500">OR</Text>
                  <Divider />
                </HStack>

                <GoogleLoginButton
                  onSuccess={(userInfo) => {
                    // Store the Google email as the account username
                    setAccountUsername(userInfo.email);
                    setIsAuthenticated(true);
                    // Store user info for later use
                    localStorage.setItem('googleUser', JSON.stringify(userInfo));
                    localStorage.setItem('accountUsername', userInfo.email);
                    toast({
                      title: 'Success',
                      description: `Welcome, ${userInfo.name}!`,
                      status: 'success',
                      duration: 2000,
                    });
                  }}
                />

                <Text fontSize="sm" color="gray.600">
                  Don't have an account?{' '}
                  <Button
                    variant="link"
                    colorScheme="blue"
                    onClick={() => {
                      setShowRegister(true);
                      setUsername('');
                      setPassword('');
                    }}
                  >
                    Register here
                  </Button>
                </Text>
              </VStack>
            </form>
          ) : (
            <form onSubmit={handleRegister}>
              <VStack spacing="6">
                <Heading size="lg" color="gray.800">Create Account</Heading>
                
                <FormControl isRequired>
                  <FormLabel>Username</FormLabel>
                  <Input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Choose a username"
                  />
                </FormControl>

                <FormControl isRequired>
                  <FormLabel>Email</FormLabel>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email"
                  />
                </FormControl>

                <FormControl isRequired>
                  <FormLabel>Password</FormLabel>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Create a password"
                  />
                </FormControl>

                <FormControl isRequired>
                  <FormLabel>Confirm Password</FormLabel>
                  <Input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm your password"
                  />
                </FormControl>

                <Button type="submit" colorScheme="blue" width="100%">
                  Register
                </Button>

                <Text fontSize="sm" color="gray.600">
                  Already have an account?{' '}
                  <Button
                    variant="link"
                    colorScheme="blue"
                    onClick={() => {
                      setShowRegister(false);
                      setUsername('');
                      setPassword('');
                      setConfirmPassword('');
                      setEmail('');
                    }}
                  >
                    Login here
                  </Button>
                </Text>
              </VStack>
            </form>
          )}
        </Box>
      </Box>
    );
  }

  let page: JSX.Element;
  if (townController) {
    page = (
      <TownControllerContext.Provider value={townController}>
        <ChatProvider>
          <TownMap />
          <VideoOverlay preferredMode='fullwidth' />
        </ChatProvider>
      </TownControllerContext.Provider>
    );
  } else {
    // Pass the account username to PreJoinScreens
    page = <PreJoinScreens accountUsername={accountUsername} />;
  }
  
  const url = "http://localhost:8081";
  assert(url, 'NEXT_PUBLIC_TOWNS_SERVICE_URL must be defined');
  const townsService = new TownsServiceClient({ BASE: url }).towns;
  
  return (
    <LoginControllerContext.Provider value={{ setTownController, townsService, accountUsername }}>
      <UnsupportedBrowserWarning>
        <VideoProvider options={connectionOptions} onError={setError} onDisconnect={onDisconnect}>
          <ErrorDialog dismissError={() => setError(null)} error={error} />
          {page}
        </VideoProvider>
      </UnsupportedBrowserWarning>
    </LoginControllerContext.Provider>
  );
}

const DEBUG_TOWN_NAME = 'DEBUG_TOWN';
function DebugApp(): JSX.Element {
  const [townController, setTownController] = useState<TownController | null>(null);
  useEffect(() => {
    const url = 'http://localhost:8081';
    assert(url, 'NEXT_PUBLIC_TOWNS_SERVICE_URL must be defined');
    const townsService = new TownsServiceClient({ BASE: url }).towns;
    async function getOrCreateDebugTownID() {
      const towns = await townsService.listTowns();
      const existingTown = towns.find(town => town.friendlyName === DEBUG_TOWN_NAME);
      if (existingTown) {
        return existingTown.townID;
      } else {
        try {
          const newTown = await townsService.createTown({
            friendlyName: DEBUG_TOWN_NAME,
            isPubliclyListed: true,
          });
          return newTown.townID;
        } catch (e) {
          console.error(e);
          //Try one more time to see if the town had been created by another process
          const townsRetry = await townsService.listTowns();
          const existingTownRetry = townsRetry.find(town => town.friendlyName === DEBUG_TOWN_NAME);
          if (!existingTownRetry) {
            throw e;
          } else {
            return existingTownRetry.townID;
          }
        }
      }
    }
    getOrCreateDebugTownID().then(townID => {
      assert(townID);
      const debugUsername = nanoid();
      const newTownController = new TownController({
        townID,
        loginController: {
          setTownController: () => {},
          townsService,
          accountUsername: debugUsername,  // Use same value for debug mode
        },
        userName: debugUsername,
        accountUsername: debugUsername, // Pass account username
      });
      newTownController.connect().then(() => {
        setTownController(newTownController);
      });
    });
  }, []);
  if (!townController) {
    return <div>Loading...</div>;
  } else {
    return (
      <TownControllerContext.Provider value={townController}>
        <ChatProvider>
          <TownMap />
          <ToggleChatButton />
        </ChatProvider>
      </TownControllerContext.Provider>
    );
  }
}

function AppOrDebugApp(): JSX.Element {
  const debugTown = false;
  if (debugTown) {
    return <DebugApp />;
  } else {
    return <App />;
  }
}

export default function AppStateWrapper(): JSX.Element {
  const googleClientId = '850515244022-u8td0lf0jpqfu1as1457aaelb9tt6hrd.apps.googleusercontent.com';
  
  const appContent = (
    <AppStateProvider>
      <AppOrDebugApp />
    </AppStateProvider>
  );
  
  return (
    <BrowserRouter>
      <ChakraProvider>
        <MuiThemeProvider theme={theme}>
          <GoogleOAuthProvider clientId={googleClientId || 'dummy-client-id-for-hook'}>
            {appContent}
          </GoogleOAuthProvider>
        </MuiThemeProvider>
      </ChakraProvider>
    </BrowserRouter>
  );
}

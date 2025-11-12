import {
  Box,
  Button,
  HStack,
  Text,
  VStack,
  useColorModeValue,
  IconButton,
  Avatar,
} from '@chakra-ui/react';
import { CloseIcon } from '@chakra-ui/icons';
import React, { useEffect, useState } from 'react';
import useTownController from '../../hooks/useTownController';
import { FriendRequestNotification } from '../../types/CoveyTownSocket';
import { useFriendRequests } from '../../classes/TownController';

/**
 * Component that displays friend request notifications as cards above the friends list
 * When a friend request is received, it shows a notification card with accept/deny options
 */
export default function FriendRequestNotificationCard(): JSX.Element {
  const townController = useTownController();
  const friendRequests = useFriendRequests();
  const [displayedRequests, setDisplayedRequests] = useState<FriendRequestNotification[]>([]);
  const bgColor = useColorModeValue('blue.50', 'blue.900');
  const borderColor = useColorModeValue('blue.200', 'blue.700');

  // Initialize with existing requests on mount
  useEffect(() => {
    const existingRequests = townController.incomingFriendRequests;
    console.log('[FriendRequestNotification] Initial mount - Existing requests:', existingRequests);
    if (existingRequests.length > 0) {
      setDisplayedRequests([...existingRequests]);
    }
  }, []); // Only run on mount

  // Update displayed requests when friend requests change
  useEffect(() => {
    console.log('[FriendRequestNotification] Friend requests from hook:', friendRequests);
    console.log('[FriendRequestNotification] Friend requests from controller:', townController.incomingFriendRequests);
    // Use controller directly as fallback
    const requests = friendRequests.length > 0 ? friendRequests : townController.incomingFriendRequests;
    if (requests.length > 0) {
      setDisplayedRequests([...requests]);
    }
  }, [friendRequests, townController]);

  // Also listen directly to events as a backup
  useEffect(() => {
    const handleFriendRequestReceived = (request: FriendRequestNotification) => {
      console.log('[FriendRequestNotification] Direct event received:', request);
      setDisplayedRequests(prev => {
        // Check if already in list
        if (prev.some(req => req.requestID === request.requestID)) {
          return prev;
        }
        return [...prev, request];
      });
    };

    townController.addListener('friendRequestReceived', handleFriendRequestReceived);
    
    return () => {
      townController.removeListener('friendRequestReceived', handleFriendRequestReceived);
    };
  }, [townController]);

  const handleAccept = (request: FriendRequestNotification) => {
    townController.respondFriendRequest(request.requestID, true);
  };

  const handleDeny = (request: FriendRequestNotification) => {
    townController.respondFriendRequest(request.requestID, false);
  };

  const handleDismiss = (requestID: string) => {
    // Remove from displayed requests (user dismissed without responding)
    setDisplayedRequests(prev => prev.filter(req => req.requestID !== requestID));
  };

  // Debug: Show component even if empty to verify it's rendering
  // Remove this after debugging
  if (displayedRequests.length === 0) {
    // Uncomment below to see debug info
    // return (
    //   <Box p={2} bg="gray.100" borderRadius="md" fontSize="xs" color="gray.600">
    //     Debug: No friend requests (Hook: {friendRequests.length}, Controller: {townController.incomingFriendRequests.length})
    //   </Box>
    // );
    return <></>;
  }

  return (
    <VStack spacing={3} align="stretch" mb={4}>
      {displayedRequests.map((request) => (
        <Box
          key={request.requestID}
          p={4}
          bg={bgColor}
          borderWidth="2px"
          borderColor={borderColor}
          borderRadius="lg"
          boxShadow="md"
          position="relative"
        >
          <HStack spacing={3} align="start">
            <Avatar
              size="sm"
              name={request.fromPlayerName}
              bg="blue.500"
            />
            <VStack align="start" spacing={2} flex={1}>
              <Text fontWeight="bold" fontSize="sm">
                Friend Request
              </Text>
              <Text fontSize="sm">
                <strong>{request.fromPlayerName}</strong> wants to be your friend
              </Text>
              <HStack spacing={2} mt={1}>
                <Button
                  size="sm"
                  colorScheme="green"
                  onClick={() => handleAccept(request)}
                >
                  Accept
                </Button>
                <Button
                  size="sm"
                  colorScheme="red"
                  variant="outline"
                  onClick={() => handleDeny(request)}
                >
                  Deny
                </Button>
              </HStack>
            </VStack>
            <IconButton
              aria-label="Dismiss"
              icon={<CloseIcon />}
              size="xs"
              variant="ghost"
              onClick={() => handleDismiss(request.requestID)}
            />
          </HStack>
        </Box>
      ))}
    </VStack>
  );
}


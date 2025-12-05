// @ts-nocheck
import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  VStack,
  HStack,
  Heading,
  Text,
  Avatar,
  Badge,
  Divider,
  Button,
  useColorModeValue,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Input,
  InputGroup,
  InputLeftElement,
  IconButton,
  Flex,
  Spacer,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  useToast,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  useDisclosure,
} from '@chakra-ui/react';
import { ChevronDownIcon, SearchIcon, AddIcon, CloseIcon, CheckIcon, DeleteIcon } from '@chakra-ui/icons';
import useTownController from '../../hooks/useTownController';
import { usePlayers } from '../../classes/TownController';
import { ArrowRightIcon } from '@chakra-ui/icons';
import useLoginController from '../../hooks/useLoginController';
import useVideoContext from '../VideoCall/VideoFrontend/hooks/useVideoContext/useVideoContext';

type UserStatus = 'Online' | 'Busy' | 'Offline';

interface Friend {
  friendId: string;
  friendUserName: string;
  friendStatus?: UserStatus;
  friendTownID?: string;
  friendTownName?: string;
}

interface FriendRequest {
  requestId: string;
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  toUserName: string;
  status: string;
  createdAt: Date;
}

export default function Profile(): JSX.Element {
  const teleportModal = useDisclosure();
  const townController = useTownController();
  const loginController = useLoginController();
  const { connect: videoConnect } = useVideoContext();
  const bgColor = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const toast = useToast();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const players = usePlayers();
  const [incomingTeleport, setIncomingTeleport] = useState<{fromUserId: string; fromUserName: string} | null>(null);
  const [incomingCrossTownTeleport, setIncomingCrossTownTeleport] = useState<{fromUserId: string; fromUserName: string; fromTownID: string; fromTownName: string} | null>(null);
  const crossTownTeleportModal = useDisclosure();
  const username = townController.userName;
  const townId = townController.townID;
  const friendlyName = townController.friendlyName;

  
  // Scroll to top when component mounts
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  
  // Status management
  const [userStatus, setUserStatus] = useState<UserStatus>('Online');
  
  // Note: Initial status is set to Online when user joins the town (in backend)
  // No need to set it again here
  const [searchQuery, setSearchQuery] = useState('');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addFriendSearchQuery, setAddFriendSearchQuery] = useState('');
  const [sendingRequestTo, setSendingRequestTo] = useState<string | null>(null);
  const justAcceptedFriendIdRef = useRef<string | null>(null);
  const [searchResults, setSearchResults] = useState<Array<{ playerId: string; userName: string; townID: string; townName: string }>>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [teleportCooldown, setTeleportCooldown] = useState<number>(0);

  const handleSendTeleportRequest = async (friend: Friend) => {
        try {
          // Note: We don't block here - let the backend decide if cooldown is active
          // The frontend timer is just for UI display. The backend is the source of truth.

          // Check friend status first
          if (friend.friendStatus !== 'Online') {
            toast({
              title: 'Cannot Teleport',
              description: `Cannot teleport. ${friend.friendUserName} is ${friend.friendStatus || 'Offline'}.`,
              status: 'error',
              duration: 3000,
            });
            return;
          }

          // Check if friend is in any town
          if (!friend.friendTownID) {
            toast({
              title: 'Cannot Teleport',
              description: `${friend.friendUserName} is not in any town.`,
              status: 'error',
              duration: 3000,
            });
            return;
          }

          // Check if friend is in the same town
          if (friend.friendTownID === townId) {
            // Same town - use regular teleport
            await townController.sendTeleportRequest(friend.friendId);
          } else {
            // Different town - use cross-town teleport
            await townController.sendCrossTownTeleportRequest(friend.friendId);
          }

          toast({
            title: 'Teleport request sent',
            description: 'Waiting for the other player to accept…',
            status: 'success',
            duration: 3000,
            isClosable: true,
          });
        } catch (err: any) {
          toast({
            title: 'Teleport failed',
            description: err?.message ?? 'Unknown error',
            status: 'error',
            duration: 3000,
            isClosable: true,
          });
        }
  };
  const handleAcceptRequest = async (requestId: string) => {
  try {
    justAcceptedFriendIdRef.current = requestId;
    await townController.acceptFriendRequest(requestId);

    setFriendRequests(prev =>
      prev.filter(req => req.requestId !== requestId),
    );
  

  } catch (err: any) {
    toast({
      title: 'Error',
      description: err.message ?? 'Failed to accept request',
      status: 'error',
      duration: 3000,
      isClosable: true,
    });
  } finally {
    justAcceptedFriendIdRef.current = null;
  }
};
useEffect(() => {
  const handler = (payload) => {
    setIncomingTeleport(payload);
    teleportModal.onOpen();
  };

  const crossTownHandler = (payload: { fromUserId: string; fromUserName: string; fromTownID: string; fromTownName: string }) => {
    setIncomingCrossTownTeleport(payload);
    crossTownTeleportModal.onOpen();
  };

  const crossTownResultHandler = (data: { success: boolean; accepted?: boolean; reason?: string; targetTownID?: string; targetTownName?: string; cooldownRemaining?: number }) => {
    if (data.success && data.accepted && data.targetTownID) {
      // Set cooldown if provided
      if (data.cooldownRemaining !== undefined) {
        setTeleportCooldown(data.cooldownRemaining);
      } else {
        // Default to 10 seconds when teleport succeeds
        setTeleportCooldown(10);
      }
      // Dispatch custom event for town switching - will be handled by separate useEffect
      // hacky fix to prevent town switch if already in that town
      if (data.targetTownID !== townController.townID) {
        window.dispatchEvent(new CustomEvent('switchTown', { 
          detail: { 
            townID: data.targetTownID,
            townName: data.targetTownName 
          } 
        }));
      }
      
    } else if (data.success && data.accepted === undefined) {
      // Request was sent successfully, but not yet accepted/declined
      // Don't show any message - the initial "request sent" toast is already shown
      return;
    } else if (!data.success || data.accepted === false) {
      // Set cooldown if provided in error response
      if (data.cooldownRemaining !== undefined && data.cooldownRemaining > 0) {
        setTeleportCooldown(data.cooldownRemaining);
      }
      toast({
        title: 'Teleport Failed',
        description: data.reason || 'Teleport request was declined',
        status: 'error',
        duration: 3000,
      });
    }
  };

  const teleportResultHandler = (data: { success: boolean; accepted?: boolean; reason?: string; fromUserId?: string; fromUserName?: string; newLocation?: any; cooldownRemaining?: number }) => {
    // Always sync cooldown from backend response (backend is source of truth)
    if (data.cooldownRemaining !== undefined) {
      setTeleportCooldown(data.cooldownRemaining);
    } else if (data.success && data.accepted) {
      // Teleport succeeded - set default cooldown to 10 seconds
      setTeleportCooldown(10);
    } else if (data.success === false && data.cooldownRemaining === undefined) {
      // If request failed and no cooldown specified, clear the cooldown (might be expired)
      setTeleportCooldown(0);
    }
  };

  townController.addListener('teleportRequestReceived', handler);
  townController.addListener('crossTownTeleportRequestReceived', crossTownHandler);
  townController.addListener('crossTownTeleportResult', crossTownResultHandler);
  townController.addListener('teleportResult', teleportResultHandler);
  return () => {
    townController.removeListener('teleportRequestReceived', handler);
    townController.removeListener('crossTownTeleportRequestReceived', crossTownHandler);
    townController.removeListener('crossTownTeleportResult', crossTownResultHandler);
    townController.removeListener('teleportResult', teleportResultHandler);
  };
}, [townController]);

  // Load friends and friend requests
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [friendsData, requestsData] = await Promise.all([
          townController.getFriends(),
          townController.getFriendRequests(),
        ]);
        setFriends(friendsData);
        setFriendRequests(requestsData);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
        toast({
          title: 'Error',
          description: err instanceof Error ? err.message : 'Failed to load friends',
          status: 'error',
          duration: 3000,
          isClosable: true,
        });
      } finally {
        setLoading(false);
      }
    };

    loadData();

    // Listen for new friend requests
    const handleFriendRequest = (request: { requestId: string; fromUserId: string; fromUserName: string }) => {
      setFriendRequests(prev => [
        ...prev,
        {
          requestId: request.requestId,
          fromUserId: request.fromUserId,
          fromUserName: request.fromUserName,
          toUserId: townController.userID,
          toUserName: username,
          status: 'pending',
          createdAt: new Date(),
        },
      ]);
      toast({
        title: 'New Friend Request',
        description: `${request.fromUserName} sent you a friend request`,
        status: 'info',
        duration: 5000,
        isClosable: true,
      });
    };
    // Listen for friend request accepted events
    const handleFriendAccepted = async (friend: { friendId: string; friendUserName: string; friendStatus?: string }) => {
      // Reload friends list to ensure both users see the friend
      // This handles cross-town scenarios where friend data might not be complete
      try {
        const friendsData = await townController.getFriends();
        setFriends(friendsData);
        
        // Only show toast if we didn't just accept this friend ourselves
        if (justAcceptedFriendIdRef.current !== friend.friendId) {
          toast({
            title: 'Friend Added',
            description: `${friend.friendUserName} accepted your friend request`,
            status: 'success',
            duration: 3000,
            isClosable: true,
          });
        }
      } catch (err) {
        console.error('Error reloading friends after acceptance:', err);
        // Fallback to adding friend manually if reload fails
        setFriends(prev => {
          if (!prev.some(f => f.friendId === friend.friendId)) {
            return [...prev, { 
              friendId: friend.friendId, 
              friendUserName: friend.friendUserName,
              friendStatus: (friend.friendStatus as UserStatus) || 'Online'
            }];
          }
          return prev;
        });
      }
    };

    // Listen for user status updates from friends
    const handleStatusUpdate = (statusUpdate: { userId: string; userName: string; status: string }) => {
      setFriends(prev => prev.map(friend =>
        friend.friendId === statusUpdate.userId
          ? { ...friend, friendStatus: statusUpdate.status as UserStatus }
          : friend
      ));
    };

    // Listen for friend removed events
    const handleFriendRemoved = (removedFriend: { friendId: string; friendUserName: string }) => {
      setFriends(prev => prev.filter(friend => friend.friendId !== removedFriend.friendId));
      toast({
        title: 'Friend Removed',
        description: `${removedFriend.friendUserName} has been removed from your friends list`,
        status: 'info',
        duration: 3000,
        isClosable: true,
      });
    };

    townController.on('friendRequestReceived', handleFriendRequest);
    townController.on('friendRequestAccepted', handleFriendAccepted);
    townController.on('friendRemoved', handleFriendRemoved);
    townController.on('userStatusUpdated', handleStatusUpdate);

    return () => {
      townController.off('friendRequestReceived', handleFriendRequest);
      townController.off('friendRequestAccepted', handleFriendAccepted);
      townController.off('friendRemoved', handleFriendRemoved);
      townController.off('userStatusUpdated', handleStatusUpdate);
    };
  }, [townController, username]);

  // Handle town switching for cross-town teleport
  useEffect(() => {
    const handleSwitchTown = async (event: CustomEvent<{ townID: string; townName?: string }>) => {
      const { townID, townName } = event.detail;
      try {
        toast({
          title: 'Teleport Accepted',
          description: `Switching to ${townName || townID}...`,
          status: 'success',
          duration: 3000,
        });
        
        const { setTownController } = loginController;
        
        // Disconnect current town
        townController.disconnect();
        
        // Create new town controller and connect
        const TownController = (await import('../../classes/TownController')).default;
        const newController = new TownController({
          userName: username,
          townID: townID,
          loginController,
          accountUsername: loginController.accountUsername,
        });
        
        await newController.connect();
        const videoToken = newController.providerVideoToken;
        if (videoToken) {
          await videoConnect(videoToken);
        }
        setTownController(newController);
      } catch (err) {
        toast({
          title: 'Failed to Switch Towns',
          description: err instanceof Error ? err.message : 'Unknown error',
          status: 'error',
          duration: 3000,
        });
      }
    };

    window.addEventListener('switchTown', handleSwitchTown as EventListener);
    return () => {
      window.removeEventListener('switchTown', handleSwitchTown as EventListener);
    };
  }, [townController, loginController, username, toast, videoConnect]);

  const getStatusColor = (status: UserStatus) => {
    switch (status) {
      case 'Online': return 'green';
      case 'Busy': return 'red';
      case 'Offline': return 'gray';
      default: return 'gray';
    }
  };

  const filteredFriends = friends.filter(friend =>
    friend.friendUserName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAcceptTeleport = async () => {
  if (!incomingTeleport) return;

  try {
    await townController.respondTeleport(incomingTeleport.fromUserId, true);

    toast({
      title: 'Teleport Accepted',
      description: `Teleporting ${incomingTeleport.fromUserName}...`,
      status: 'success',
      duration: 3000,
      isClosable: true,
    });

    setIncomingTeleport(null);
    teleportModal.onClose();
  } catch (err: any) {
    toast({
      title: 'Teleport Failed',
      description: err?.message ?? 'Unknown error',
      status: 'error',
    });
  }
};

const handleDeclineTeleport = async () => {
  if (!incomingTeleport) return;

  try {
    await townController.respondTeleport(incomingTeleport.fromUserId, false);

    toast({
      title: 'Teleport Declined',
      description: `You declined ${incomingTeleport.fromUserName}'s request.`,
      status: 'info',
      duration: 3000,
      isClosable: true,
    });

    setIncomingTeleport(null);
    teleportModal.onClose();
  } catch (err: any) {
    toast({
      title: 'Error Declining Teleport',
      description: err?.message ?? 'Unknown error',
      status: 'error',
    });
  }
};

const handleAcceptCrossTownTeleport = async () => {
  if (!incomingCrossTownTeleport) return;

  try {
    await townController.respondCrossTownTeleport(incomingCrossTownTeleport.fromUserId, true);

    toast({
      title: 'Teleport Accepted',
      description: `${incomingCrossTownTeleport.fromUserName} will join your town...`,
      status: 'success',
      duration: 3000,
      isClosable: true,
    });

    setIncomingCrossTownTeleport(null);
    crossTownTeleportModal.onClose();
  } catch (err: any) {
    toast({
      title: 'Teleport Failed',
      description: err?.message ?? 'Unknown error',
      status: 'error',
    });
  }
};

const handleDeclineCrossTownTeleport = async () => {
  if (!incomingCrossTownTeleport) return;

  try {
    await townController.respondCrossTownTeleport(incomingCrossTownTeleport.fromUserId, false);

    toast({
      title: 'Teleport Declined',
      description: `You declined ${incomingCrossTownTeleport.fromUserName}'s request.`,
      status: 'info',
      duration: 3000,
      isClosable: true,
    });

    setIncomingCrossTownTeleport(null);
    crossTownTeleportModal.onClose();
  } catch (err: any) {
    toast({
      title: 'Error Declining Teleport',
      description: err?.message ?? 'Unknown error',
      status: 'error',
    });
  }
};

  const handleDeclineRequest = async (requestId: string) => {
    try {
      await townController.declineFriendRequest(requestId);
      setFriendRequests(prev => prev.filter(req => req.requestId !== requestId));
      toast({
        title: 'Request Declined',
        status: 'info',
        duration: 2000,
        isClosable: true,
      });
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to decline friend request',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  };

  const handleRemoveFriend = async (friendId: string, friendUserName: string) => {
    try {
      await townController.removeFriend(friendId);
      setFriends(prev => prev.filter(friend => friend.friendId !== friendId));
      toast({
        title: 'Friend Removed',
        description: `${friendUserName} has been removed from your friends list`,
        status: 'info',
        duration: 3000,
        isClosable: true,
      });
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to remove friend',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  };

  // Search for players across all towns when search query changes
  useEffect(() => {
    const searchPlayers = async () => {
      if (!addFriendSearchQuery || addFriendSearchQuery.trim().length === 0) {
        setSearchResults([]);
        return;
      }

      setIsSearching(true);
      try {
        const results = await townController.searchPlayers(addFriendSearchQuery.trim());
        // Filter out current user, existing friends, and pending requests
        const filtered = results.filter(result => {
          if (result.playerId === townController.userID) {
            return false;
          }
          if (friends.some(friend => friend.friendId === result.playerId)) {
            return false;
          }
          if (friendRequests.some(request => 
            request.fromUserId === result.playerId || request.toUserId === result.playerId
          )) {
            return false;
          }
          return true;
        });
        setSearchResults(filtered);
      } catch (err) {
        console.error('Error searching players:', err);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    };

    // Debounce search
    const timeoutId = setTimeout(searchPlayers, 300);
    return () => clearTimeout(timeoutId);
  }, [addFriendSearchQuery, townController, friends, friendRequests]);

  // Get available users from current town (for when search is empty)
  const availableUsers = players.filter(player => {
    // Exclude current user
    if (player.id === townController.userID) {
      return false;
    }
    // Exclude existing friends
    if (friends.some(friend => friend.friendId === player.id)) {
      return false;
    }
    // Exclude users who have pending friend requests (sent to us or we sent to them)
    if (friendRequests.some(request => 
      request.fromUserId === player.id || request.toUserId === player.id
    )) {
      return false;
    }
    return true;
  });

  // Use search results if available, otherwise use local players
  const filteredAvailableUsers = addFriendSearchQuery.trim().length > 0
    ? searchResults.map(result => ({
        id: result.playerId,
        userName: result.userName,
        townID: result.townID,
        townName: result.townName,
      }))
    : availableUsers;

  const handleSendFriendRequestFromModal = async (toUserId: string, toUserName: string) => {
    if (toUserId === townController.userID) {
      toast({
        title: 'Cannot send request',
        description: 'You cannot send a friend request to yourself',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    try {
      setSendingRequestTo(toUserId);
      await townController.sendFriendRequest(toUserId);
      toast({
        title: 'Friend Request Sent',
        description: `Friend request sent to ${toUserName}`,
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
      // Close modal after successful request
      onClose();
      setAddFriendSearchQuery('');
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to send friend request',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setSendingRequestTo(null);
    }
  };

  return (
    
  <Box
  maxW="5000px"
  mx="auto"
  mt={-1400}     // pull upward slightly
  pt={2}      // smaller top padding
  mb={8}
  p={8}
    bg={bgColor}
    borderWidth="1px"
    borderColor={borderColor}
    borderRadius="xl"
    boxShadow="lg"
  >
      <VStack spacing={6} align="stretch">
        {/* Header with Avatar and Status Selector */}
        <HStack spacing={4}>
          <Avatar
            size="xl"
            name={username}
            bg="blue.500"
          />
          <VStack align="start" spacing={2} flex={1}>
            <Heading size="lg">{username}</Heading>
            
            {/* Status Dropdown */}
            <Menu>
              <MenuButton
                as={Button}
                rightIcon={<ChevronDownIcon />}
                colorScheme={getStatusColor(userStatus)}
                size="sm"
                variant="solid"
              >
                {userStatus}
              </MenuButton>
              <MenuList>
                <MenuItem onClick={async () => {
                  const newStatus = 'Online';
                  const previousStatus = userStatus;
                  setUserStatus(newStatus);
                  try {
                    await townController.updateUserStatus(newStatus);
                  } catch (err) {
                    // Revert on error
                    setUserStatus(previousStatus);
                    toast({
                      title: 'Error',
                      description: err instanceof Error ? err.message : 'Failed to update status',
                      status: 'error',
                      duration: 3000,
                      isClosable: true,
                    });
                  }
                }}>
                  <Badge colorScheme="green" mr={2}>●</Badge> Online
                </MenuItem>
                <MenuItem onClick={async () => {
                  const newStatus = 'Busy';
                  const previousStatus = userStatus;
                  setUserStatus(newStatus);
                  try {
                    await townController.updateUserStatus(newStatus);
                  } catch (err) {
                    // Revert on error
                    setUserStatus(previousStatus);
                    toast({
                      title: 'Error',
                      description: err instanceof Error ? err.message : 'Failed to update status',
                      status: 'error',
                      duration: 3000,
                      isClosable: true,
                    });
                  }
                }}>
                  <Badge colorScheme="red" mr={2}>●</Badge> Busy
                </MenuItem>
                <MenuItem onClick={async () => {
                  const newStatus = 'Offline';
                  const previousStatus = userStatus;
                  setUserStatus(newStatus);
                  try {
                    await townController.updateUserStatus(newStatus);
                  } catch (err) {
                    // Revert on error
                    setUserStatus(previousStatus);
                    toast({
                      title: 'Error',
                      description: err instanceof Error ? err.message : 'Failed to update status',
                      status: 'error',
                      duration: 3000,
                      isClosable: true,
                    });
                  }
                }}>
                  <Badge colorScheme="gray" mr={2}>●</Badge> Offline
                </MenuItem>
              </MenuList>
            </Menu>
          </VStack>
        </HStack>

        {/* Teleport Cooldown Timer */}
        {teleportCooldown > 0 && (
          <Box
            p={3}
            bg="orange.50"
            borderWidth="1px"
            borderColor="orange.200"
            borderRadius="md"
            mb={4}
          >
            <HStack spacing={2}>
              <Text fontWeight="bold" color="orange.700">
                ⏱️ Teleport Cooldown:
              </Text>
              <Text fontSize="xl" fontWeight="bold" color="orange.600">
                {teleportCooldown}s
              </Text>
            </HStack>
            <Text fontSize="sm" color="orange.600" mt={1}>
              Please wait before teleporting again
            </Text>
          </Box>
        )}

        <Divider />

        {/* Profile Information */}
        <VStack align="stretch" spacing={4}>
          <Box>
            <Text fontWeight="bold" color="gray.500" fontSize="sm" mb={1}>
              USERNAME
            </Text>
            <Text fontSize="lg">{username}</Text>
          </Box>

          <Box>
            <Text fontWeight="bold" color="gray.500" fontSize="sm" mb={1}>
              TOWN NAME
            </Text>
            <Text fontSize="lg">{friendlyName || 'Unknown Town'}</Text>
          </Box>

          <Box>
            <Text fontWeight="bold" color="gray.500" fontSize="sm" mb={1}>
              TOWN ID
            </Text>
            <Text fontSize="lg" fontFamily="mono" color="blue.600">
              {townId}
            </Text>
          </Box>
        </VStack>

        <Divider />

        {/* Friend Requests Section */}
        {friendRequests.length > 0 && (
          <>
            <Box>
              <Heading size="md" mb={4}>Friend Requests ({friendRequests.length})</Heading>
              <VStack spacing={2} align="stretch">
                {friendRequests.map((request) => (
                  <Box
                    key={request.requestId}
                    p={3}
                    borderWidth="1px"
                    borderRadius="md"
                    borderColor={borderColor}
                    _hover={{ bg: useColorModeValue('gray.50', 'gray.700') }}
                  >
                    <Flex align="center">
                      <Avatar size="sm" name={request.fromUserName} mr={3} />
                      <Box flex={1}>
                        <Text fontWeight="medium">{request.fromUserName}</Text>
                        <Text fontSize="xs" color="gray.500">
                          wants to be your friend
                        </Text>
                      </Box>
                      <HStack spacing={2}>
                        <IconButton
                          icon={<CheckIcon />}
                          size="sm"
                          colorScheme="green"
                          aria-label="Accept"
                          onClick={() => handleAcceptRequest(request.requestId)}
                        />
                        <IconButton
                          icon={<CloseIcon />}
                          size="sm"
                          colorScheme="red"
                          variant="ghost"
                          aria-label="Decline"
                          onClick={() => handleDeclineRequest(request.requestId)}
                        />
                      </HStack>
                    </Flex>
                  </Box>
                ))}
              </VStack>
            </Box>
            <Divider />
          </>
        )}

        {/* Friends List Section */}
        <Box>
          <Flex align="center" mb={4}>
            <Heading size="md">Friends ({friends.length})</Heading>
            <Spacer />
            <Button
              leftIcon={<AddIcon />}
              colorScheme="blue"
              size="sm"
              onClick={onOpen}
            >
              Add Friend
            </Button>
          </Flex>

          {/* Search Bar */}
          <InputGroup mb={4}>
            <InputLeftElement pointerEvents="none">
              <SearchIcon color="gray.400" />
            </InputLeftElement>
            <Input
              placeholder="Search friends..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </InputGroup>

          {/* Error Message */}
          {error && (
            <Alert status="error" mb={4}>
              <AlertIcon />
              <AlertTitle>Error!</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Friends List */}
          {loading ? (
            <Text color="gray.500" textAlign="center" py={4}>
              Loading...
            </Text>
          ) : (
            <VStack spacing={2} align="stretch" maxH="300px" overflowY="auto">
              {filteredFriends.length > 0 ? (
                filteredFriends.map((friend) => (
                  <Box
                    key={friend.friendId}
                    p={3}
                    borderWidth="1px"
                    borderRadius="md"
                    borderColor={borderColor}
                    _hover={{ bg: useColorModeValue('gray.50', 'gray.700') }}
                  >
                    <Flex align="center">
                      <Avatar size="sm" name={friend.friendUserName} mr={3} />
                      <Box flex={1}>
                        <Text fontWeight="medium">{friend.friendUserName}</Text>
                        <HStack spacing={1}>
                        <Box
                          w={2}
                          h={2}
                          borderRadius="full"
                          bg={`${getStatusColor(friend.friendStatus || 'Offline')}.400`}
                        />
                        <Text fontSize="xs" color="gray.500">
                          {friend.friendStatus || 'Offline'}
                        </Text>
                        </HStack>
                        {friend.friendTownName && (
                          <Text fontSize="xs" color="gray.400" mt={1}>
                            {friend.friendTownID === townId ? 'Same Town' : `Town: ${friend.friendTownName}`}
                          </Text>
                        )}
                      </Box>
                      <IconButton
                        icon={<ArrowRightIcon />}   
                        size="sm"
                        colorScheme="blue"
                        variant="outline"
                        aria-label={`Teleport to ${friend.friendUserName}`}
                        onClick={() => handleSendTeleportRequest(friend)}
                        isDisabled={friend.friendStatus !== 'Online'}
                        title={
                          teleportCooldown > 0
                            ? `Teleport on cooldown (${teleportCooldown}s remaining)`
                            : friend.friendStatus !== 'Online' 
                              ? `Cannot teleport. ${friend.friendUserName} is ${friend.friendStatus || 'Offline'}.` 
                              : friend.friendTownID === townId 
                                ? `Teleport to ${friend.friendUserName} (same town)`
                                : `Teleport to ${friend.friendUserName} (cross-town)`
                        }
                      />
                      <IconButton
                        icon={<DeleteIcon />}
                        size="sm"
                        colorScheme="red"
                        variant="ghost"
                        aria-label={`Remove ${friend.friendUserName} from friends`}
                        onClick={() => handleRemoveFriend(friend.friendId, friend.friendUserName)}
                      />
                    </Flex>
                  </Box>
                ))
              ) : (
                <Text color="gray.500" textAlign="center" py={4}>
                  {searchQuery ? 'No friends found' : 'No friends yet'}
                </Text>
              )}
            </VStack>
          )}
        </Box>

        <Divider />

        {/* Action Buttons */}
        <HStack spacing={4}>
          <Button colorScheme="blue" flex={1}>
            Edit Profile
          </Button>
          <Button variant="outline" flex={1} onClick={() => window.history.back()}>
            Back to Town
          </Button>
        </HStack>
      </VStack>

      {/* Add Friend Modal */}
      <Modal isOpen={isOpen} onClose={onClose} size="md">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Add Friend</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4} align="stretch">
              <InputGroup>
                <InputLeftElement pointerEvents="none">
                  <SearchIcon color="gray.400" />
                </InputLeftElement>
                <Input
                  placeholder="Search users..."
                  value={addFriendSearchQuery}
                  onChange={(e) => setAddFriendSearchQuery(e.target.value)}
                />
              </InputGroup>

              {filteredAvailableUsers.length > 0 ? (
                <VStack spacing={2} align="stretch" maxH="400px" overflowY="auto">
                  {filteredAvailableUsers.map((player) => (
                    <Box
                      key={player.id}
                      p={3}
                      borderWidth="1px"
                      borderRadius="md"
                      borderColor={borderColor}
                      _hover={{ bg: useColorModeValue('gray.50', 'gray.700') }}
                    >
                      <Flex align="center">
                        <Avatar size="sm" name={player.userName} mr={3} />
                        <Box flex={1}>
                          <Text fontWeight="medium">{player.userName}</Text>
                          {(player as any).townName && (
                            <Text fontSize="xs" color="gray.400" mt={1}>
                              {(player as any).townID === townId ? 'Same Town' : `Town: ${(player as any).townName}`}
                            </Text>
                          )}
                        </Box>
                        <IconButton
                          icon={<AddIcon />}
                          size="sm"
                          colorScheme="blue"
                          aria-label={`Send friend request to ${player.userName}`}
                          onClick={() => handleSendFriendRequestFromModal(player.id, player.userName)}
                          isLoading={sendingRequestTo === player.id}
                        />
                      </Flex>
                    </Box>
                  ))}
                </VStack>
              ) : (
                <Text color="gray.500" textAlign="center" py={4}>
                  {isSearching 
                    ? 'Searching...'
                    : addFriendSearchQuery 
                    ? 'No users found' 
                    : availableUsers.length === 0
                    ? 'No available users to add. Try searching for players in other towns!'
                    : 'No users match your search'}
                </Text>
              )}
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
      {/* CROSS-TOWN TELEPORT REQUEST MODAL */}
      <Modal isOpen={crossTownTeleportModal.isOpen} onClose={crossTownTeleportModal.onClose} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Cross-Town Teleport Request</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {incomingCrossTownTeleport && (
              <VStack spacing={4} align="stretch">
                <Text>
                  <strong>{incomingCrossTownTeleport.fromUserName}</strong> from{' '}
                  <strong>{incomingCrossTownTeleport.fromTownName}</strong> wants to teleport to your town.
                </Text>
                <Text fontSize="sm" color="gray.500">
                  If you accept, they will join your current town.
                </Text>
              </VStack>
            )}
          </ModalBody>
          <ModalFooter>
            <Button colorScheme="red" variant="ghost" mr={3} onClick={handleDeclineCrossTownTeleport}>
              Decline
            </Button>
            <Button colorScheme="green" onClick={handleAcceptCrossTownTeleport}>
              Accept
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* TELEPORT REQUEST MODAL */}
  <Modal isOpen={teleportModal.isOpen} onClose={teleportModal.onClose} isCentered>
  <ModalOverlay />
  <ModalContent>
    <ModalHeader>Teleport Request</ModalHeader>
    <ModalCloseButton />

    <ModalBody>
      {incomingTeleport && (
        <Text>
          <b>{incomingTeleport.fromUserName}</b> wants you to teleport to them.
        </Text>
      )}
    </ModalBody>

    <ModalFooter>
      <Button colorScheme="green" mr={3} onClick={handleAcceptTeleport}>
        Accept
      </Button>
      <Button variant="outline" colorScheme="red" onClick={handleDeclineTeleport}>
        Decline
      </Button>
    </ModalFooter>
  </ModalContent>
</Modal>
    </Box>
  );
}

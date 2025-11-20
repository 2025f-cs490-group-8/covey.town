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

type UserStatus = 'Online' | 'Busy' | 'Offline';

interface Friend {
  friendId: string;
  friendUserName: string;
  friendStatus?: UserStatus;
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
  const townController = useTownController();
  const bgColor = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const toast = useToast();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const players = usePlayers();

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
    const handleFriendAccepted = (friend: { friendId: string; friendUserName: string; friendStatus?: string }) => {
      setFriends(prev => {
        // Check if friend is already in the list
        if (!prev.some(f => f.friendId === friend.friendId)) {
          // Only show toast if we didn't just accept this friend ourselves
          // (to avoid duplicate toasts)
          if (justAcceptedFriendIdRef.current !== friend.friendId) {
            toast({
              title: 'Friend Added',
              description: `${friend.friendUserName} accepted your friend request`,
              status: 'success',
              duration: 3000,
              isClosable: true,
            });
          }
          return [...prev, { 
            friendId: friend.friendId, 
            friendUserName: friend.friendUserName,
            friendStatus: (friend.friendStatus as UserStatus) || 'Online'
          }];
        }
        return prev;
      });
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

  const handleAcceptRequest = async (requestId: string) => {
    try {
      // Get the request info before accepting to show the correct toast
      const request = friendRequests.find(req => req.requestId === requestId);
      if (!request) {
        throw new Error('Friend request not found');
      }
      
      await townController.acceptFriendRequest(requestId);
      setFriendRequests(prev => prev.filter(req => req.requestId !== requestId));
      
      // Track that we just accepted this friend to prevent duplicate toast
      justAcceptedFriendIdRef.current = request.fromUserId;
      
      // Show toast for the accepter
      toast({
        title: 'Friend Added',
        description: `You are now friends with ${request.fromUserName}`,
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
      
      // Clear the tracking after a short delay
      setTimeout(() => {
        justAcceptedFriendIdRef.current = null;
      }, 1000);
      
      // Don't manually add friend here - let the socket event handle it
      // This prevents duplicate friends from being added
      // The socket event will trigger handleFriendAccepted which adds the friend
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to accept friend request',
        status: 'error',
        duration: 3000,
        isClosable: true,
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

  // Get available users to add as friends (exclude current user and existing friends)
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

  // Filter available users by search query
  const filteredAvailableUsers = availableUsers.filter(player =>
    player.userName.toLowerCase().includes(addFriendSearchQuery.toLowerCase())
  );

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
                      </Box>
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
                  {addFriendSearchQuery 
                    ? 'No users found' 
                    : availableUsers.length === 0
                    ? 'No available users to add'
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
    </Box>
  );
}

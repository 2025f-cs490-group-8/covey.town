// @ts-nocheck
import React, { useState, useEffect } from 'react';
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
} from '@chakra-ui/react';
import { ChevronDownIcon, SearchIcon, AddIcon, CloseIcon } from '@chakra-ui/icons';
import useTownController from '../../hooks/useTownController';
import FriendRequestNotification from './FriendRequestNotification';
import { useFriends, usePlayers } from '../../classes/TownController';
import { UserStatus } from '../../types/CoveyTownSocket';

interface Friend {
  id: string;
  username: string;
  status: UserStatus;
}

export default function Profile(): JSX.Element {
  const townController = useTownController();
  const bgColor = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');

  const username = townController.userName;
  const townId = townController.townID;
  const friendlyName = townController.friendlyName;
  
  // Scroll to top when component mounts
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  
  // Status management - sync with server
  const [userStatus, setUserStatus] = useState<UserStatus>('Online');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Update status on server when user changes it
  const handleStatusChange = (newStatus: UserStatus) => {
    setUserStatus(newStatus);
    townController.updateStatus(newStatus);
  };
  
  // Get real friends from the friend system
  const realFriends = useFriends();
  // Get current players in town to check if friends are online
  const playersInTown = usePlayers();
  
  // Convert real friends to the format expected by the UI
  // Use the friend's actual status if available, otherwise check if they're in town
  const friends: Friend[] = realFriends.map(friend => {
    // Prioritize the friend's status from the server (which is updated via playerStatusUpdated events)
    // If status is explicitly set (Online, Busy, or Offline), use it
    // Otherwise, check if they're in town to determine Online/Offline
    let status: UserStatus;
    if (friend.status && (friend.status === 'Online' || friend.status === 'Busy' || friend.status === 'Offline')) {
      // Use the friend's actual status (this is updated in real-time via playerStatusUpdated events)
      status = friend.status;
    } else {
      // Fallback: check if friend is in town to determine status
      const isInTown = playersInTown.some(player => player.id === friend.id);
      status = isInTown ? 'Online' : 'Offline';
    }
    return {
      id: friend.id,
      username: friend.userName,
      status,
    };
  });

  const getStatusColor = (status: UserStatus) => {
    switch (status) {
      case 'Online': return 'green';
      case 'Busy': return 'red';
      case 'Offline': return 'gray';
      default: return 'gray';
    }
  };

  const filteredFriends = friends.filter(friend =>
    friend.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const removeFriend = (friendId: string) => {
    // TODO: Implement remove friend functionality in TownController
    // For now, this would need to call a backend endpoint to remove the friend
    console.log('Remove friend:', friendId);
    // Note: This would require backend support for removing friends
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
                <MenuItem onClick={() => handleStatusChange('Online')}>
                  <Badge colorScheme="green" mr={2}>●</Badge> Online
                </MenuItem>
                <MenuItem onClick={() => handleStatusChange('Busy')}>
                  <Badge colorScheme="red" mr={2}>●</Badge> Busy
                </MenuItem>
                <MenuItem onClick={() => handleStatusChange('Offline')}>
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

        {/* Friends List Section */}
        <Box>
          <Flex align="center" mb={4}>
            <Heading size="md">Friends ({friends.length})</Heading>
            <Spacer />
            <Button leftIcon={<AddIcon />} colorScheme="blue" size="sm">
              Add Friend
            </Button>
          </Flex>

          {/* Friend Request Notifications */}
          <FriendRequestNotification />

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

          {/* Friends List */}
          <VStack spacing={2} align="stretch" maxH="300px" overflowY="auto">
            {filteredFriends.length > 0 ? (
              filteredFriends.map((friend) => (
                <Box
                  key={friend.id}
                  p={3}
                  borderWidth="1px"
                  borderRadius="md"
                  borderColor={borderColor}
                  _hover={{ bg: useColorModeValue('gray.50', 'gray.700') }}
                >
                  <Flex align="center">
                    <Avatar size="sm" name={friend.username} mr={3} />
                    <Box flex={1}>
                      <Text fontWeight="medium">{friend.username}</Text>
                      <HStack spacing={1}>
                        <Box
                          w={2}
                          h={2}
                          borderRadius="full"
                          bg={`${getStatusColor(friend.status)}.400`}
                        />
                        <Text fontSize="xs" color="gray.500">
                          {friend.status}
                        </Text>
                      </HStack>
                    </Box>
                    <IconButton
                      icon={<CloseIcon />}
                      size="xs"
                      colorScheme="red"
                      variant="ghost"
                      aria-label="Remove friend"
                      onClick={() => removeFriend(friend.id)}
                    />
                  </Flex>
                </Box>
              ))
            ) : (
              <Text color="gray.500" textAlign="center" py={4}>
                No friends found
              </Text>
            )}
          </VStack>
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
    </Box>
  );
}
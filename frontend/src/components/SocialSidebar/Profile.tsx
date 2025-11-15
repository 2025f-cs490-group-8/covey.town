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

type UserStatus = 'Online' | 'Busy' | 'Offline';

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
  
  // Status management
  const [userStatus, setUserStatus] = useState<UserStatus>('Online');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Mock friends list (in real app, this would come from backend)
  const [friends, setFriends] = useState<Friend[]>([
    { id: '1', username: 'Alice', status: 'Online' },
    { id: '2', username: 'Bob', status: 'Busy' },
    { id: '3', username: 'Charlie', status: 'Offline' },
    { id: '4', username: 'Diana', status: 'Online' },
  ]);

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
    setFriends(friends.filter(f => f.id !== friendId));
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
                <MenuItem onClick={() => setUserStatus('Online')}>
                  <Badge colorScheme="green" mr={2}>●</Badge> Online
                </MenuItem>
                <MenuItem onClick={() => setUserStatus('Busy')}>
                  <Badge colorScheme="red" mr={2}>●</Badge> Busy
                </MenuItem>
                <MenuItem onClick={() => setUserStatus('Offline')}>
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
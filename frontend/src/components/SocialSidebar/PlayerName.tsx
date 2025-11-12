import { HStack, IconButton, Tooltip, useToast } from '@chakra-ui/react';
import React from 'react';
import { AddIcon } from '@chakra-ui/icons';
import PlayerController from '../../classes/PlayerController';
import useTownController from '../../hooks/useTownController';
import { useFriends } from '../../classes/TownController';

type PlayerNameProps = {
  player: PlayerController;
};

export default function PlayerName({ player }: PlayerNameProps): JSX.Element {
  const townController = useTownController();
  const friends = useFriends();
  const toast = useToast();

  // Check if this player is already a friend
  const isFriend = friends.some(friend => friend.id === player.id);
  
  // Don't show button for ourselves
  const isSelf = player.id === townController.userID;

  const handleSendFriendRequest = () => {
    if (isFriend) {
      toast({
        title: 'Already Friends',
        description: `You are already friends with ${player.userName}`,
        status: 'info',
        duration: 2000,
        isClosable: true,
      });
      return;
    }

    townController.sendFriendRequest(player.id);
    toast({
      title: 'Friend Request Sent',
      description: `Friend request sent to ${player.userName}`,
      status: 'success',
      duration: 2000,
      isClosable: true,
    });
  };

  if (isSelf) {
    return <>{player.userName} (You)</>;
  }

  return (
    <HStack spacing={2}>
      <span>{player.userName}</span>
      {!isFriend && (
        <Tooltip label={`Send friend request to ${player.userName}`}>
          <IconButton
            aria-label={`Add ${player.userName} as friend`}
            icon={<AddIcon />}
            size="xs"
            colorScheme="blue"
            variant="ghost"
            onClick={handleSendFriendRequest}
          />
        </Tooltip>
      )}
      {isFriend && (
        <Tooltip label={`${player.userName} is your friend`}>
          <span style={{ color: 'green', fontSize: '0.8em' }}>✓ Friend</span>
        </Tooltip>
      )}
    </HStack>
  );
}

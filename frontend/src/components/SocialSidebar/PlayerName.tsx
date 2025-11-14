import React, { useState } from 'react';
import { IconButton, HStack, Text, useToast } from '@chakra-ui/react';
import { AddIcon } from '@chakra-ui/icons';
import PlayerController from '../../classes/PlayerController';
import useTownController from '../../hooks/useTownController';

type PlayerNameProps = {
  player: PlayerController;
};
export default function PlayerName({ player }: PlayerNameProps): JSX.Element {
  const townController = useTownController();
  const toast = useToast();
  const [sending, setSending] = useState(false);

  const handleSendFriendRequest = async () => {
    if (player.id === townController.userID) {
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
      setSending(true);
      await townController.sendFriendRequest(player.id);
      toast({
        title: 'Friend Request Sent',
        description: `Friend request sent to ${player.userName}`,
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to send friend request',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setSending(false);
    }
  };

  const isCurrentUser = player.id === townController.userID;
  
  if (isCurrentUser) {
    return <Text>{player.userName}</Text>;
  }
  
  return (
    <HStack spacing={2}>
      <Text>{player.userName}</Text>
      <IconButton
        icon={<AddIcon />}
        size="xs"
        colorScheme="blue"
        variant="ghost"
        aria-label={`Send friend request to ${player.userName}`}
        onClick={handleSendFriendRequest}
        isLoading={sending}
      />
    </HStack>
  );
}

// @ts-nocheck
import React, { useState } from 'react';
import { Button, useDisclosure } from '@chakra-ui/react';
import Profile from './Profile';

export default function ProfileButton(): JSX.Element {
  const { isOpen, onOpen, onClose } = useDisclosure();

  return (
    <>
      <Button
        colorScheme="blue"
        size="sm"
        position="fixed"
        top="10px"
        right="20px"
        zIndex={999}
        onClick={onOpen}
      >
        Profile
      </Button>
      <Profile isOpen={isOpen} onClose={onClose} />
    </>
  );
}
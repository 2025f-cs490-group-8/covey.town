import React from 'react';
import { Button, useDisclosure } from '@chakra-ui/react';
import Profile from './Profile';

export default function ProfileButton(): JSX.Element {
  const onOpen = useDisclosure();

  return (
    <>
      <Button
        colorScheme='blue'
        size='sm'
        position='fixed'
        top='10px'
        right='20px'
        zIndex={999}
        onClick={onOpen}>
        Profile
      </Button>
      {/* removed isOpen={isOpen} onClose={onClose} so it builds */}
      {/* profile was always showing*/}
      anyways
      <Profile />
    </>
  );
}

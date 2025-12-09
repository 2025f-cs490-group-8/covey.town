import React from 'react';
import TownController from '../classes/TownController';
import { TownsService } from '../generated/client';

export type LoginController = {
  setTownController: (newController: TownController | null) => void;
  townsService: TownsService;
  accountUsername: string; // ADD THIS LINE
};
/**
 * Hint: You will never need to use this directly. Instead, use the
 * `useLoginController` hook.
 */
const context = React.createContext<LoginController | null>(null);

export default context;

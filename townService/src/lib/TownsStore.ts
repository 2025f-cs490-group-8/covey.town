import { ITiledMap } from '@jonbell/tiled-map-type-guard';
import * as fs from 'fs/promises';
import { customAlphabet } from 'nanoid';
import Town from '../town/Town';
import { TownEmitterFactory } from '../types/CoveyTownSocket';
import Player from './Player';

function passwordMatches(provided: string, expected: string): boolean {
  if (provided === expected) {
    return true;
  }
  if (process.env.MASTER_TOWN_PASSWORD && process.env.MASTER_TOWN_PASWORD === provided) {
    return true;
  }
  return false;
}

const friendlyNanoID = customAlphabet('1234567890ABCDEF', 8);

export type TownList = {
  friendlyName: string;
  townID: string;
  currentOccupancy: number;
  maximumOccupancy: number;
}[];

export default class TownsStore {
  private static _instance: TownsStore;

  private _towns: Town[] = [];

  private _emitterFactory: TownEmitterFactory;

  // Map from player ID to town ID to track which town each player is in
  private _playerTowns: Map<string, string> = new Map();

  static initializeTownsStore(emitterFactory: TownEmitterFactory) {
    TownsStore._instance = new TownsStore(emitterFactory);
  }

  /**
   * Retrieve the singleton TownsStore.
   *
   * There is only a single instance of the TownsStore - it follows the singleton pattern
   */
  static getInstance(): TownsStore {
    if (TownsStore._instance === undefined) {
      throw new Error('TownsStore must be initialized before getInstance is called');
    }
    return TownsStore._instance;
  }

  private constructor(emitterFactory: TownEmitterFactory) {
    this._emitterFactory = emitterFactory;
  }

  /**
   * Given a town ID, fetch the town model
   *
   * @param townID town ID to fetch
   * @returns the existing town controller, or undefined if there is no such town ID
   */
  getTownByID(townID: string): Town | undefined {
    return this._towns.find(town => town.townID === townID);
  }

  /**
   * @returns List of all publicly visible towns
   */
  getTowns(): TownList {
    return this._towns
      .filter(townController => townController.isPubliclyListed)
      .map(townController => ({
        townID: townController.townID,
        friendlyName: townController.friendlyName,
        currentOccupancy: townController.occupancy,
        maximumOccupancy: townController.capacity,
      }));
  }

  /**
   * Creates a new town, registering it in the Town Store, and returning that new town
   * @param friendlyName
   * @param isPubliclyListed
   * @returns the new town controller
   */
  async createTown(
    friendlyName: string,
    isPubliclyListed: boolean,
    mapFile = '../frontend/public/assets/tilemaps/indoors.json',
  ): Promise<Town> {
    if (friendlyName.length === 0) {
      throw new Error('FriendlyName must be specified');
    }
    const townID = process.env.DEMO_TOWN_ID === friendlyName ? friendlyName : friendlyNanoID();
    const newTown = new Town(friendlyName, isPubliclyListed, townID, this._emitterFactory(townID));
    const data = JSON.parse(await fs.readFile(mapFile, 'utf-8'));
    const map = ITiledMap.parse(data);
    newTown.initializeFromMap(map);
    this._towns.push(newTown);
    return newTown;
  }

  /**
   * Updates an existing town. Validates that the provided password is valid
   * @param townID
   * @param townUpdatePassword
   * @param friendlyName
   * @param makePublic
   * @returns true upon success, or false otherwise
   */
  updateTown(
    townID: string,
    townUpdatePassword: string,
    friendlyName?: string,
    makePublic?: boolean,
  ): boolean {
    const existingTown = this.getTownByID(townID);
    if (existingTown && passwordMatches(townUpdatePassword, existingTown.townUpdatePassword)) {
      if (friendlyName !== undefined) {
        if (friendlyName.length === 0) {
          return false;
        }
        existingTown.friendlyName = friendlyName;
      }
      if (makePublic !== undefined) {
        existingTown.isPubliclyListed = makePublic;
      }
      return true;
    }
    return false;
  }

  /**
   * Deletes a given town from this towns store, destroying the town controller in the process.
   * Checks that the password is valid before deletion
   * @param townID
   * @param townUpdatePassword
   * @returns true if the town exists and is successfully deleted, false otherwise
   */
  deleteTown(townID: string, townUpdatePassword: string): boolean {
    const existingTown = this.getTownByID(townID);
    if (existingTown && passwordMatches(townUpdatePassword, existingTown.townUpdatePassword)) {
      this._towns = this._towns.filter(town => town !== existingTown);
      existingTown.disconnectAllPlayers();
      return true;
    }
    return false;
  }

  /**
   * Track that a player has joined a town
   * @param playerId The ID of the player
   * @param townID The ID of the town they joined
   */
  setPlayerTown(playerId: string, townID: string): void {
    this._playerTowns.set(playerId, townID);
  }

  /**
   * Remove tracking for a player (when they leave a town)
   * @param playerId The ID of the player
   */
  removePlayerTown(playerId: string): void {
    this._playerTowns.delete(playerId);
  }

  /**
   * Get the town ID that a player is currently in
   * @param playerId The ID of the player
   * @returns The town ID, or undefined if the player is not in any town
   */
  getPlayerTown(playerId: string): string | undefined {
    return this._playerTowns.get(playerId);
   }

  /**
   * Find a player across all towns by their user ID
   * @param playerId The ID of the player to find
   * @returns The player and their town, or undefined if not found
   */
  findPlayerAcrossTowns(playerId: string): { player: Player; town: Town } | undefined {
    const townID = this._playerTowns.get(playerId);
    if (!townID) {
      return undefined;
    }
    const town = this.getTownByID(townID);
    if (!town) {
      return undefined;
    }
    const player = town.players.find(p => p.id === playerId);
    if (!player) {
      return undefined;
    }
    return { player, town };
  }

  /**
   * Search for players by username across all towns
   * @param username The username to search for (case-insensitive partial match)
   * @param excludePlayerId Optional player ID to exclude from results
   * @returns Array of players with their town information
   */
  searchPlayersByUsername(username: string, excludePlayerId?: string): Array<{ player: Player; town: Town; townID: string }> {
    const results: Array<{ player: Player; town: Town; townID: string }> = [];
    const searchLower = username.toLowerCase();

    for (const town of this._towns) {
      for (const player of town.players) {
        if (excludePlayerId && player.id === excludePlayerId) {
          continue;
        }
        if (player.userName.toLowerCase().includes(searchLower)) {
          results.push({
            player,
            town,
            townID: town.townID,
          });
        }
      }
    }

    return results;
  }
}

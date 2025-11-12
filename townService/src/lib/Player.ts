import { nanoid } from 'nanoid';
import { Player as PlayerModel, PlayerID, PlayerLocation, TownEmitter, UserStatus } from '../types/CoveyTownSocket';

/**
 * Each user who is connected to a town is represented by a Player object
 */
export default class Player {
  /** The current location of this user in the world map * */
  public location: PlayerLocation;

  /** The unique identifier for this player * */
  private readonly _id: string;

  /** The player's username, which is not guaranteed to be unique within the town * */
  private readonly _userName: string;

  /** The secret token that allows this client to access our Covey.Town service for this town * */
  private readonly _sessionToken: string;

  /** The secret token that allows this client to access our video resources for this town * */
  private _videoToken?: string;

  /** A special town emitter that will emit events to the entire town BUT NOT to this player */
  public readonly townEmitter: TownEmitter;

  /** Set of friend player IDs */
  private _friends: Set<PlayerID> = new Set();

  /** User's status (Online, Busy, Offline) */
  private _status: UserStatus = 'Online';

  constructor(userName: string, townEmitter: TownEmitter) {
    this.location = {
      x: 0,
      y: 0,
      moving: false,
      rotation: 'front',
    };
    this._userName = userName;
    this._id = nanoid();
    this._sessionToken = nanoid();
    this.townEmitter = townEmitter;
  }

  get userName(): string {
    return this._userName;
  }

  get id(): string {
    return this._id;
  }

  set videoToken(value: string | undefined) {
    this._videoToken = value;
  }

  get videoToken(): string | undefined {
    return this._videoToken;
  }

  get sessionToken(): string {
    return this._sessionToken;
  }

  toPlayerModel(): PlayerModel {
    return {
      id: this._id,
      location: this.location,
      userName: this._userName,
      status: this._status,
    };
  }

  /**
   * Add a friend to this player's friend list
   */
  addFriend(friendID: PlayerID): void {
    this._friends.add(friendID);
  }

  /**
   * Remove a friend from this player's friend list
   */
  removeFriend(friendID: PlayerID): void {
    this._friends.delete(friendID);
  }

  /**
   * Check if a player is a friend
   */
  isFriend(playerID: PlayerID): boolean {
    return this._friends.has(playerID);
  }

  /**
   * Get all friend IDs
   */
  getFriends(): PlayerID[] {
    return Array.from(this._friends);
  }

  /**
   * Get the player's status
   */
  get status(): UserStatus {
    return this._status;
  }

  /**
   * Set the player's status
   */
  set status(value: UserStatus) {
    this._status = value;
  }
}

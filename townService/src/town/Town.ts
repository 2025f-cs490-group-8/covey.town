import { ITiledMap, ITiledMapObjectLayer } from '@jonbell/tiled-map-type-guard';
import { nanoid } from 'nanoid';
import { BroadcastOperator } from 'socket.io';
import InvalidParametersError from '../lib/InvalidParametersError';
import IVideoClient from '../lib/IVideoClient';
import Player from '../lib/Player';
import TwilioVideo from '../lib/TwilioVideo';
import { isViewingArea } from '../TestUtils';
import {
  ChatMessage,
  ConversationArea as ConversationAreaModel,
  CoveyTownSocket,
  FriendRequestNotification,
  FriendRequestUpdate,
  Interactable,
  InteractableCommand,
  InteractableCommandBase,
  PlayerID,
  PlayerLocation,
  ServerToClientEvents,
  SocketData,
  UserStatus,
  ViewingArea as ViewingAreaModel,
} from '../types/CoveyTownSocket';
import { logError } from '../Utils';
import ConversationArea from './ConversationArea';
import GameAreaFactory from './games/GameAreaFactory';
import InteractableArea from './InteractableArea';
import ViewingArea from './ViewingArea';

/**
 * The Town class implements the logic for each town: managing the various events that
 * can occur (e.g. joining a town, moving, leaving a town)
 */
export default class Town {
  get capacity(): number {
    return this._capacity;
  }

  set isPubliclyListed(value: boolean) {
    this._isPubliclyListed = value;
    this._broadcastEmitter.emit('townSettingsUpdated', { isPubliclyListed: value });
  }

  get isPubliclyListed(): boolean {
    return this._isPubliclyListed;
  }

  get townUpdatePassword(): string {
    return this._townUpdatePassword;
  }

  get players(): Player[] {
    return this._players;
  }

  get occupancy(): number {
    return this.players.length;
  }

  get friendlyName(): string {
    return this._friendlyName;
  }

  set friendlyName(value: string) {
    this._friendlyName = value;
    this._broadcastEmitter.emit('townSettingsUpdated', { friendlyName: value });
  }

  get townID(): string {
    return this._townID;
  }

  get interactables(): InteractableArea[] {
    return this._interactables;
  }

  /** The list of players currently in the town * */
  private _players: Player[] = [];

  /** The videoClient that this CoveyTown will use to provision video resources * */
  private _videoClient: IVideoClient = TwilioVideo.getInstance();

  private _interactables: InteractableArea[] = [];

  private readonly _townID: string;

  private _friendlyName: string;

  private readonly _townUpdatePassword: string;

  private _isPubliclyListed: boolean;

  private _capacity: number;

  private _broadcastEmitter: BroadcastOperator<ServerToClientEvents, SocketData>;

  private _connectedSockets: Set<CoveyTownSocket> = new Set();

  private _chatMessages: ChatMessage[] = [];

  /** Map of player IDs to their sockets for direct messaging */
  private _playerSockets: Map<PlayerID, CoveyTownSocket> = new Map();

  /** Map of pending friend requests: requestID -> { fromPlayerID, toPlayerID, fromPlayerName } */
  private _pendingFriendRequests: Map<string, {
    fromPlayerID: PlayerID;
    toPlayerID: PlayerID;
    fromPlayerName: string;
  }> = new Map();

  constructor(
    friendlyName: string,
    isPubliclyListed: boolean,
    townID: string,
    broadcastEmitter: BroadcastOperator<ServerToClientEvents, SocketData>,
  ) {
    this._townID = townID;
    this._capacity = 50;
    this._townUpdatePassword = nanoid(24);
    this._isPubliclyListed = isPubliclyListed;
    this._friendlyName = friendlyName;
    this._broadcastEmitter = broadcastEmitter;
  }

  /**
   * Adds a player to this Covey Town, provisioning the necessary credentials for the
   * player, and returning them
   *
   * @param newPlayer The new player to add to the town
   */
  async addPlayer(userName: string, socket: CoveyTownSocket): Promise<Player> {
    const newPlayer = new Player(userName, socket.to(this._townID));
    this._players.push(newPlayer);

    this._connectedSockets.add(socket);
    this._playerSockets.set(newPlayer.id, socket);

    // Create a video token for this user to join this town
    newPlayer.videoToken = await this._videoClient.getTokenForTown(this._townID, newPlayer.id);

    // Notify other players that this player has joined
    this._broadcastEmitter.emit('playerJoined', newPlayer.toPlayerModel());

    // Register an event listener for the client socket: if the client disconnects,
    // clean up our listener adapter, and then let the CoveyTownController know that the
    // player's session is disconnected
    socket.on('disconnect', () => {
      this._removePlayer(newPlayer);
      this._connectedSockets.delete(socket);
      this._playerSockets.delete(newPlayer.id);
      this._clearPendingFriendRequestsForPlayer(newPlayer.id);
    });

    // Set up a listener to forward all chat messages to all clients in the town
    socket.on('chatMessage', (message: ChatMessage) => {
      this._broadcastEmitter.emit('chatMessage', message);
      this._chatMessages.push(message);
      if (this._chatMessages.length > 200) {
        this._chatMessages.shift();
      }
    });

    // Register an event listener for the client socket: if the client updates their
    // location, inform the CoveyTownController
    socket.on('playerMovement', (movementData: PlayerLocation) => {
      try {
        this._updatePlayerLocation(newPlayer, movementData);
      } catch (err) {
        logError(err);
      }
    });

    // Set up a listener to process updates to interactables.
    // Currently only knows how to process updates for ViewingArea's, and
    // ignores any other updates for any other kind of interactable.
    // For ViewingArea's: dispatches an updateModel call to the viewingArea that
    // corresponds to the interactable being updated. Does not throw an error if
    // the specified viewing area does not exist.
    socket.on('interactableUpdate', (update: Interactable) => {
      if (isViewingArea(update)) {
        newPlayer.townEmitter.emit('interactableUpdate', update);
        const viewingArea = this._interactables.find(
          eachInteractable => eachInteractable.id === update.id,
        );
        if (viewingArea) {
          (viewingArea as ViewingArea).updateModel(update);
        }
      }
    });

    // Set up a listener to process commands to interactables.
    // Dispatches commands to the appropriate interactable and sends the response back to the client
    socket.on('interactableCommand', (command: InteractableCommand & InteractableCommandBase) => {
      const interactable = this._interactables.find(
        eachInteractable => eachInteractable.id === command.interactableID,
      );
      if (interactable) {
        try {
          const payload = interactable.handleCommand(command, newPlayer);
          socket.emit('commandResponse', {
            commandID: command.commandID,
            interactableID: command.interactableID,
            isOK: true,
            payload,
          });
        } catch (err) {
          if (err instanceof InvalidParametersError) {
            socket.emit('commandResponse', {
              commandID: command.commandID,
              interactableID: command.interactableID,
              isOK: false,
              error: err.message,
            });
          } else {
            logError(err);
            socket.emit('commandResponse', {
              commandID: command.commandID,
              interactableID: command.interactableID,
              isOK: false,
              error: 'Unknown error',
            });
          }
        }
      } else {
        socket.emit('commandResponse', {
          commandID: command.commandID,
          interactableID: command.interactableID,
          isOK: false,
          error: `No such interactable ${command.interactableID}`,
        });
      }
    });

    // Set up friend request handlers
    socket.on('sendFriendRequest', (toPlayerID: PlayerID) => {
      this._handleFriendRequest(newPlayer.id, toPlayerID);
    });

    socket.on('respondFriendRequest', (requestID: string, accept: boolean) => {
      this._handleFriendRequestResponse(newPlayer.id, requestID, accept);
    });

    // Set up status update handler
    socket.on('updateStatus', (status: UserStatus) => {
      newPlayer.status = status;
      // Broadcast status update to all players (friends will see it in their friends list)
      this._broadcastEmitter.emit('playerStatusUpdated', newPlayer.id, status);
      // Also update the player model in the playerMoved event so it's included in future updates
      this._broadcastEmitter.emit('playerMoved', newPlayer.toPlayerModel());
    });

    return newPlayer;
  }

  /**
   * Destroys all data related to a player in this town.
   *
   * @param session PlayerSession to destroy
   */
  private _removePlayer(player: Player): void {
    if (player.location.interactableID) {
      this._removePlayerFromInteractable(player);
    }
    // Update player's status to Offline before removing them
    // This ensures friends see the status change when the player disconnects
    this._broadcastEmitter.emit('playerStatusUpdated', player.id, 'Offline');
    this._players = this._players.filter(p => p.id !== player.id);
    this._broadcastEmitter.emit('playerDisconnect', player.toPlayerModel());
  }

  /**
   * Handles sending a friend request from one player to another
   */
  private _handleFriendRequest(fromPlayerID: PlayerID, toPlayerID: PlayerID): void {
    const fromPlayer = this._players.find(p => p.id === fromPlayerID);
    const toPlayer = this._players.find(p => p.id === toPlayerID);

    if (!fromPlayer || !toPlayer) {
      return; // One of the players doesn't exist
    }

    if (fromPlayerID === toPlayerID) {
      return; // Can't send request to yourself
    }

    if (fromPlayer.isFriend(toPlayerID)) {
      return; // Already friends
    }

    // Check if there's already a pending request
    const existingRequest = Array.from(this._pendingFriendRequests.values())
      .find(req => 
        (req.fromPlayerID === fromPlayerID && req.toPlayerID === toPlayerID) ||
        (req.fromPlayerID === toPlayerID && req.toPlayerID === fromPlayerID)
      );

    if (existingRequest) {
      return; // Request already exists
    }

    // Create a new friend request
    const requestID = nanoid();
    this._pendingFriendRequests.set(requestID, {
      fromPlayerID,
      toPlayerID,
      fromPlayerName: fromPlayer.userName,
    });

    // Notify the recipient
    const toSocket = this._playerSockets.get(toPlayerID);
    if (toSocket) {
      const notification: FriendRequestNotification = {
        fromPlayerID,
        fromPlayerName: fromPlayer.userName,
        requestID,
      };
      console.log(`[Friend Request] Sending notification to ${toPlayerID} from ${fromPlayerID}:`, notification);
      console.log(`[Friend Request] Socket connected: ${toSocket.connected}, Socket ID: ${toSocket.id}`);
      toSocket.emit('friendRequestReceived', notification);
      console.log(`[Friend Request] Event emitted successfully`);
    } else {
      console.log(`[Friend Request] ERROR: No socket found for player ${toPlayerID}`);
      console.log(`[Friend Request] Available player sockets:`, Array.from(this._playerSockets.keys()));
      console.log(`[Friend Request] Current players in town:`, this._players.map(p => ({ id: p.id, name: p.userName })));
    }
  }

  /**
   * Handles a response to a friend request (accept or deny)
   */
  private _handleFriendRequestResponse(
    respondingPlayerID: PlayerID,
    requestID: string,
    accept: boolean,
  ): void {
    const request = this._pendingFriendRequests.get(requestID);
    if (!request) {
      return; // Request doesn't exist
    }

    // Verify the responding player is the recipient
    if (request.toPlayerID !== respondingPlayerID) {
      return; // Not authorized to respond to this request
    }

    const fromPlayer = this._players.find(p => p.id === request.fromPlayerID);
    const toPlayer = this._players.find(p => p.id === request.toPlayerID);

    if (!fromPlayer || !toPlayer) {
      // One of the players left, clean up
      this._pendingFriendRequests.delete(requestID);
      return;
    }

    // Remove the pending request
    this._pendingFriendRequests.delete(requestID);

    if (accept) {
      // Add each other as friends
      fromPlayer.addFriend(toPlayer.id);
      toPlayer.addFriend(fromPlayer.id);

      // Notify both players of the updated friend list
      this._notifyFriendList(fromPlayer.id);
      this._notifyFriendList(toPlayer.id);
    }

    // Notify the sender of the response
    const fromSocket = this._playerSockets.get(request.fromPlayerID);
    if (fromSocket) {
      const update: FriendRequestUpdate = {
        requestID,
        fromPlayerID: request.fromPlayerID,
        toPlayerID: request.toPlayerID,
        status: accept ? 'accepted' : 'denied',
      };
      fromSocket.emit('friendRequestUpdated', update);
    }
  }

  /**
   * Clears all pending friend requests involving a specific player
   */
  private _clearPendingFriendRequestsForPlayer(playerID: PlayerID): void {
    const requestsToRemove: string[] = [];
    this._pendingFriendRequests.forEach((request, requestID) => {
      if (request.fromPlayerID === playerID || request.toPlayerID === playerID) {
        requestsToRemove.push(requestID);
      }
    });
    requestsToRemove.forEach(requestID => {
      this._pendingFriendRequests.delete(requestID);
    });
  }

  /**
   * Notifies a player of their updated friend list
   */
  private _notifyFriendList(playerID: PlayerID): void {
    const player = this._players.find(p => p.id === playerID);
    if (!player) {
      return;
    }

    const friendIDs = player.getFriends();
    const friends = this._players
      .filter(p => friendIDs.includes(p.id))
      .map(p => p.toPlayerModel());

    const socket = this._playerSockets.get(playerID);
    if (socket) {
      socket.emit('friendListUpdated', friends);
    }
  }

  /**
   * Get friends for a player (as Player models)
   */
  public getFriendsForPlayer(playerID: PlayerID): Player[] {
    const player = this._players.find(p => p.id === playerID);
    if (!player) {
      return [];
    }

    const friendIDs = player.getFriends();
    return this._players.filter(p => friendIDs.includes(p.id));
  }

  /**
   * Get pending friend requests for a player
   */
  public getPendingFriendRequestsForPlayer(playerID: PlayerID): FriendRequestNotification[] {
    const requests: FriendRequestNotification[] = [];
    this._pendingFriendRequests.forEach((request, requestID) => {
      if (request.toPlayerID === playerID) {
        requests.push({
          fromPlayerID: request.fromPlayerID,
          fromPlayerName: request.fromPlayerName,
          requestID,
        });
      }
    });
    return requests;
  }

  /**
   * Updates the location of a player within the town
   *
   * If the player has changed conversation areas, this method also updates the
   * corresponding ConversationArea objects tracked by the town controller, and dispatches
   * any onConversationUpdated events as appropriate
   *
   * @param player Player to update location for
   * @param location New location for this player
   */
  private _updatePlayerLocation(player: Player, location: PlayerLocation): void {
    const prevInteractable = this._interactables.find(
      conv => conv.id === player.location.interactableID,
    );

    if (!prevInteractable?.contains(location)) {
      if (prevInteractable) {
        // Remove from old area
        prevInteractable.remove(player);
      }
      const newInteractable = this._interactables.find(
        eachArea => eachArea.isActive && eachArea.contains(location),
      );
      if (newInteractable) {
        newInteractable.add(player);
      }
      location.interactableID = newInteractable?.id;
    } else {
      location.interactableID = prevInteractable.id;
    }

    player.location = location;

    this._broadcastEmitter.emit('playerMoved', player.toPlayerModel());
  }

  /**
   * Removes a player from a conversation area, updating the conversation area's occupants list,
   * and emitting the appropriate message (area updated or area destroyed)
   *
   * @param player Player to remove from their current conversation area
   */
  private _removePlayerFromInteractable(player: Player): void {
    const area = this._interactables.find(
      eachArea => eachArea.id === player.location.interactableID,
    );
    if (area) {
      area.remove(player);
    }
  }

  /**
   * Creates a new conversation area in this town if there is not currently an active
   * conversation with the same ID. The conversation area ID must match the name of a
   * conversation area that exists in this town's map, and the conversation area must not
   * already have a topic set.
   *
   * If successful creating the conversation area, this method:
   *  Adds any players who are in the region defined by the conversation area to it.
   *  Notifies all players in the town that the conversation area has been updated
   *
   * @param conversationArea Information describing the conversation area to create. Ignores any
   *  occupantsById that are set on the conversation area that is passed to this method.
   *
   * @returns true if the conversation is successfully created, or false if there is no known
   * conversation area with the specified ID or if there is already an active conversation area
   * with the specified ID
   */
  public addConversationArea(conversationArea: ConversationAreaModel): boolean {
    const area = this._interactables.find(
      eachArea => eachArea.id === conversationArea.id,
    ) as ConversationArea;
    if (!area || !conversationArea.topic || area.topic) {
      return false;
    }
    area.topic = conversationArea.topic;
    area.addPlayersWithinBounds(this._players);
    this._broadcastEmitter.emit('interactableUpdate', area.toModel());
    return true;
  }

  /**
   * Creates a new viewing area in this town if there is not currently an active
   * viewing area with the same ID. The viewing area ID must match the name of a
   * viewing area that exists in this town's map, and the viewing area must not
   * already have a video set.
   *
   * If successful creating the viewing area, this method:
   *    Adds any players who are in the region defined by the viewing area to it
   *    Notifies all players in the town that the viewing area has been updated by
   *      emitting an interactableUpdate event
   *
   * @param viewingArea Information describing the viewing area to create.
   *
   * @returns True if the viewing area was created or false if there is no known
   * viewing area with the specified ID or if there is already an active viewing area
   * with the specified ID or if there is no video URL specified
   */
  public addViewingArea(viewingArea: ViewingAreaModel): boolean {
    const area = this._interactables.find(
      eachArea => eachArea.id === viewingArea.id,
    ) as ViewingArea;
    if (!area || !viewingArea.video || area.video) {
      return false;
    }
    area.updateModel(viewingArea);
    area.addPlayersWithinBounds(this._players);
    this._broadcastEmitter.emit('interactableUpdate', area.toModel());
    return true;
  }

  /**
   * Fetch a player's session based on the provided session token. Returns undefined if the
   * session token is not valid.
   *
   * @param token
   */
  public getPlayerBySessionToken(token: string): Player | undefined {
    return this.players.find(eachPlayer => eachPlayer.sessionToken === token);
  }

  /**
   * Find an interactable by its ID
   *
   * @param id
   * @returns the interactable
   * @throws Error if no such interactable exists
   */
  public getInteractable(id: string): InteractableArea {
    const ret = this._interactables.find(eachInteractable => eachInteractable.id === id);
    if (!ret) {
      throw new Error(`No such interactable ${id}`);
    }
    return ret;
  }

  /**
   * Retrieves all chat messages, optionally filtered by interactableID
   * @param interactableID optional interactableID to filter by
   */
  public getChatMessages(interactableID: string | undefined) {
    return this._chatMessages.filter(eachMessage => eachMessage.interactableID === interactableID);
  }

  /**
   * Informs all players' clients that they are about to be disconnected, and then
   * disconnects all players.
   */
  public disconnectAllPlayers(): void {
    this._broadcastEmitter.emit('townClosing');
    this._connectedSockets.forEach(eachSocket => eachSocket.disconnect(true));
  }

  /**
   * Initializes the town's state from a JSON map, setting the "interactables" property of this town
   * to instances of InteractableArea that match each interactable in the map.
   *
   * Each tilemap may contain "objects", and those objects may have properties. Towns
   * support two kinds of interactable objects: "ViewingArea" and "ConversationArea."
   * Initializing the town state from the map, then, means instantiating the corresponding objects.
   *
   * This method will throw an Error if the objects are not valid:
   * In the map file, each object is identified with a name. Names must be unique. Each object also has
   * some kind of geometry that establishes where the object is on the map. Objects must not overlap.
   *
   * @param mapFile the map file to read in, defaults to the "indoors" map in the frontend
   * @throws Error if there is no layer named "Objects" in the map, if the objects overlap or if object
   *  names are not unique
   */
  public initializeFromMap(map: ITiledMap) {
    const objectLayer = map.layers.find(
      eachLayer => eachLayer.name === 'Objects',
    ) as ITiledMapObjectLayer;
    if (!objectLayer) {
      throw new Error(`Unable to find objects layer in map`);
    }
    const viewingAreas = objectLayer.objects
      .filter(eachObject => eachObject.type === 'ViewingArea')
      .map(eachViewingAreaObject =>
        ViewingArea.fromMapObject(eachViewingAreaObject, this._broadcastEmitter),
      );

    const conversationAreas = objectLayer.objects
      .filter(eachObject => eachObject.type === 'ConversationArea')
      .map(eachConvAreaObj =>
        ConversationArea.fromMapObject(eachConvAreaObj, this._broadcastEmitter),
      );

    const gameAreas = objectLayer.objects
      .filter(eachObject => eachObject.type === 'GameArea')
      .map(eachGameAreaObj => GameAreaFactory(eachGameAreaObj, this._broadcastEmitter));

    this._interactables = this._interactables
      .concat(viewingAreas)
      .concat(conversationAreas)
      .concat(gameAreas);
    this._validateInteractables();
  }

  private _validateInteractables() {
    // Make sure that the IDs are unique
    const interactableIDs = this._interactables.map(eachInteractable => eachInteractable.id);
    if (
      interactableIDs.some(
        item => interactableIDs.indexOf(item) !== interactableIDs.lastIndexOf(item),
      )
    ) {
      throw new Error(
        `Expected all interactable IDs to be unique, but found duplicate interactable ID in ${interactableIDs}`,
      );
    }
    // Make sure that there are no overlapping objects
    for (const interactable of this._interactables) {
      for (const otherInteractable of this._interactables) {
        if (interactable !== otherInteractable && interactable.overlaps(otherInteractable)) {
          throw new Error(
            `Expected interactables not to overlap, but found overlap between ${interactable.id} and ${otherInteractable.id}`,
          );
        }
      }
    }
  }
}

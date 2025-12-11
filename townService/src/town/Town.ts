import { ITiledMap, ITiledMapObjectLayer } from '@jonbell/tiled-map-type-guard';
import { nanoid } from 'nanoid';
import { BroadcastOperator } from 'socket.io';
import InvalidParametersError from '../lib/InvalidParametersError';
import FriendsStore from '../lib/FriendsStore';
import IVideoClient from '../lib/IVideoClient';
import Player from '../lib/Player';
import TwilioVideo from '../lib/TwilioVideo';
import CoveyTownsStore from '../lib/TownsStore';
import { isViewingArea } from '../TestUtils';
import {
  ChatMessage,
  ConversationArea as ConversationAreaModel,
  CoveyTownSocket,
  Interactable,
  InteractableCommand,
  InteractableCommandBase,
  PlayerLocation,
  ServerToClientEvents,
  SocketData,
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

  // Map from player ID to their socket for direct messaging
  private _playerSockets: Map<string, CoveyTownSocket> = new Map();

  private _chatMessages: ChatMessage[] = [];

  // Map from player ID to their last teleport timestamp (for cooldown)
  private _teleportCooldowns: Map<string, number> = new Map();

  // Teleport cooldown duration in milliseconds (10 seconds)
  private static readonly _teleportCooldownMs = 10000;

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
   * @param userName The username of the new player
   * @param socket The socket connection for this player
   * @param spawnLocation Optional spawn location for cross-town teleportation
   */
  async addPlayer(
    userName: string,
    socket: CoveyTownSocket,
    spawnLocation?: { x: number; y: number; rotation: string; moving: boolean },
  ): Promise<Player> {
    const newPlayer = new Player(userName, socket.to(this._townID));

    // Apply spawn location if provided (for cross-town teleportation)
    if (spawnLocation) {
      newPlayer.location = {
        x: spawnLocation.x,
        y: spawnLocation.y,
        rotation: spawnLocation.rotation as 'front' | 'back' | 'left' | 'right',
        moving: spawnLocation.moving,
      };
    }

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

    // Set up a listener for teleport requests
    socket.on('teleportRequest', (data: { toUserId: string }) => {
      try {
        // Prevent teleporting to yourself
        if (newPlayer.id === data.toUserId) {
          socket.emit('teleportResult', {
            success: false,
            accepted: false,
            reason: 'Cannot teleport to yourself',
            cooldownRemaining: 0,
          });
          return;
        }

        // Check teleport cooldown
        const lastTeleportTime = this._teleportCooldowns.get(newPlayer.id);
        if (lastTeleportTime) {
          const timeSinceLastTeleport = Date.now() - lastTeleportTime;
          const cooldownRemaining = Town._teleportCooldownMs - timeSinceLastTeleport;
          if (cooldownRemaining > 0) {
            socket.emit('teleportResult', {
              success: false,
              accepted: false,
              reason: `Teleport is on cooldown. Please wait ${Math.ceil(
                cooldownRemaining / 1000,
              )} seconds.`,
              cooldownRemaining: Math.ceil(cooldownRemaining / 1000),
            });
            return;
          }
          // Cooldown has expired, remove it from the map to clean up
          this._teleportCooldowns.delete(newPlayer.id);
        }

        const targetPlayer = this._players.find(p => p.id === data.toUserId);
        if (!targetPlayer) {
          socket.emit('teleportResult', {
            success: false,
            accepted: false,
            reason: 'Target player not found',
            cooldownRemaining: 0,
          });
          return;
        }

        // Safety check: Verify target player is still in the town
        const currentTargetPlayer = this._players.find(p => p.id === data.toUserId);
        if (!currentTargetPlayer || currentTargetPlayer.id !== targetPlayer.id) {
          socket.emit('teleportResult', {
            success: false,
            accepted: false,
            reason: 'Target player is no longer in this town',
            cooldownRemaining: 0,
          });
          return;
        }

        // Check if players are friends (required for teleportation)
        // Check both directions to ensure friendship is bidirectional
        const friendsStore = FriendsStore.getInstance();
        const areFriends =
          friendsStore.areFriends(newPlayer.id, targetPlayer.id) ||
          friendsStore.areFriends(targetPlayer.id, newPlayer.id);
        if (!areFriends) {
          socket.emit('teleportResult', {
            success: false,
            accepted: false,
            reason: 'You can only teleport to friends',
            cooldownRemaining: 0,
          });
          return;
        }

        // Check if target player is online (required for teleportation)
        const targetStatus = friendsStore.getUserStatus(data.toUserId);
        if (targetStatus !== 'Online') {
          socket.emit('teleportResult', {
            success: false,
            accepted: false,
            reason: `Cannot teleport to ${
              targetPlayer.userName
            }. They are currently ${targetStatus.toLowerCase()}.`,
            cooldownRemaining: 0,
          });
          return;
        }

        // Notify the target player about the teleport request
        const targetSocket = this._playerSockets.get(data.toUserId);
        if (!targetSocket) {
          socket.emit('teleportResult', {
            success: false,
            accepted: false,
            reason: 'Target player is not connected',
            cooldownRemaining: 0,
          });
          return;
        }

        // Safety check: Verify the target socket is still connected and in the same town
        if (!targetSocket.connected) {
          socket.emit('teleportResult', {
            success: false,
            accepted: false,
            reason: 'Target player disconnected',
            cooldownRemaining: 0,
          });
          return;
        }

        // Emit the teleport request to the target player
        targetSocket.emit('teleportRequestReceived', {
          fromUserId: newPlayer.id,
          fromUserName: newPlayer.userName,
        });

        // Also send a success result to the requesting player (request was sent)
        socket.emit('teleportResult', {
          success: true,
          accepted: undefined, // Not yet accepted/declined
          reason: 'Teleport request sent',
          cooldownRemaining: 0,
        });
      } catch (err) {
        logError(err);
        socket.emit('teleportResult', {
          success: false,
          accepted: false,
          reason: 'Error processing teleport request',
          cooldownRemaining: 0,
        });
      }
    });

    // Set up a listener for teleport responses
    socket.on('teleportResponse', (data: { fromUserId: string; accepted: boolean }) => {
      try {
        const requestingPlayer = this._players.find(p => p.id === data.fromUserId);
        if (!requestingPlayer) {
          socket.emit('teleportResult', {
            success: false,
            accepted: false,
            reason: 'Requesting player not found',
          });
          return;
        }

        if (!data.accepted) {
          // Notify the requesting player that the request was declined
          const requestingSocket = this._playerSockets.get(data.fromUserId);
          if (requestingSocket) {
            requestingSocket.emit('teleportResult', {
              success: false,
              accepted: false,
              reason: 'Teleport request was declined',
              fromUserId: newPlayer.id,
              fromUserName: newPlayer.userName,
              cooldownRemaining: 0,
            });
          }
          return;
        }

        // Safety check: Verify requesting player is still in the town
        const currentRequestingPlayer = this._players.find(p => p.id === data.fromUserId);
        if (!currentRequestingPlayer || currentRequestingPlayer.id !== requestingPlayer.id) {
          socket.emit('teleportResult', {
            success: false,
            accepted: false,
            reason: 'Requesting player is no longer in this town',
            cooldownRemaining: 0,
          });
          return;
        }

        // Teleport the requesting player to the accepting player
        const targetLocation = newPlayer.location;

        // Create a new location object to ensure we're not modifying the target's location
        const teleportLocation: PlayerLocation = {
          x: targetLocation.x,
          y: targetLocation.y,
          rotation: targetLocation.rotation,
          moving: false,
          interactableID: targetLocation.interactableID,
        };

        // Update the requesting player's location
        // This will automatically broadcast the playerMoved event to all clients via _broadcastEmitter
        this._updatePlayerLocation(requestingPlayer, teleportLocation);

        // Set cooldown for the requesting player
        this._teleportCooldowns.set(requestingPlayer.id, Date.now());

        // Notify both players of successful teleport
        // Include the new location in the result so the frontend can force update the teleported player's position
        const requestingSocket = this._playerSockets.get(data.fromUserId);
        if (requestingSocket) {
          requestingSocket.emit('teleportResult', {
            success: true,
            accepted: true,
            fromUserId: newPlayer.id,
            fromUserName: newPlayer.userName,
            newLocation: teleportLocation, // Include the new location for the teleported player
            cooldownRemaining: 0,
          });
        }

        socket.emit('teleportResult', {
          success: true,
          accepted: true,
          fromUserId: requestingPlayer.id,
          fromUserName: requestingPlayer.userName,
          cooldownRemaining: 0,
        });
      } catch (err) {
        logError(err);
        socket.emit('teleportResult', {
          success: false,
          accepted: false,
          reason: 'Error processing teleport response',
        });
      }
    });

    // Set up a listener for cross-town teleport requests
    socket.on('crossTownTeleportRequest', (data: { toUserId: string }) => {
      try {
        // Prevent teleporting to yourself
        if (newPlayer.id === data.toUserId) {
          socket.emit('crossTownTeleportResult', {
            success: false,
            accepted: false,
            reason: 'Cannot teleport to yourself',
            cooldownRemaining: 0,
          });
          return;
        }

        // Check teleport cooldown
        const lastTeleportTime = this._teleportCooldowns.get(newPlayer.id);
        if (lastTeleportTime) {
          const timeSinceLastTeleport = Date.now() - lastTeleportTime;
          const cooldownRemaining = Town._teleportCooldownMs - timeSinceLastTeleport;
          if (cooldownRemaining > 0) {
            socket.emit('crossTownTeleportResult', {
              success: false,
              accepted: false,
              reason: `Teleport is on cooldown. Please wait ${Math.ceil(
                cooldownRemaining / 1000,
              )} seconds.`,
              cooldownRemaining: Math.ceil(cooldownRemaining / 1000),
            });
            return;
          }
          // Cooldown has expired, remove it from the map to clean up
          this._teleportCooldowns.delete(newPlayer.id);
        }

        // Check if players are friends
        const friendsStore = FriendsStore.getInstance();
        const areFriends =
          friendsStore.areFriends(newPlayer.id, data.toUserId) ||
          friendsStore.areFriends(data.toUserId, newPlayer.id);
        if (!areFriends) {
          socket.emit('crossTownTeleportResult', {
            success: false,
            accepted: false,
            reason: 'You can only teleport to friends',
            cooldownRemaining: 0,
          });
          return;
        }

        // Check target player status
        const targetStatus = friendsStore.getUserStatus(data.toUserId);
        if (targetStatus !== 'Online') {
          socket.emit('crossTownTeleportResult', {
            success: false,
            accepted: false,
            reason: `Cannot teleport. Target player is currently ${targetStatus}.`,
            cooldownRemaining: 0,
          });
          return;
        }

        // Get target player's town
        const townsStore = CoveyTownsStore.getInstance();
        const targetTownID = townsStore.getPlayerTown(data.toUserId);
        if (!targetTownID) {
          socket.emit('crossTownTeleportResult', {
            success: false,
            accepted: false,
            reason: 'Target player is not in any town',
            cooldownRemaining: 0,
          });
          return;
        }

        // Check if target is in the same town (should use regular teleport instead)
        if (targetTownID === this._townID) {
          socket.emit('crossTownTeleportResult', {
            success: false,
            accepted: false,
            reason: 'Target player is in the same town. Use regular teleport instead.',
            cooldownRemaining: 0,
          });
          return;
        }

        const targetTown = townsStore.getTownByID(targetTownID);
        if (!targetTown) {
          socket.emit('crossTownTeleportResult', {
            success: false,
            accepted: false,
            reason: "Target player's town not found",
            cooldownRemaining: 0,
          });
          return;
        }

        // Safety check: Find target player in their town
        const targetPlayer = targetTown.players.find(p => p.id === data.toUserId);
        if (!targetPlayer) {
          socket.emit('crossTownTeleportResult', {
            success: false,
            accepted: false,
            reason: 'Target player not found in their town',
            cooldownRemaining: 0,
          });
          return;
        }

        // Get target player's socket
        const targetSocket = targetTown.getPlayerSocket(data.toUserId);
        if (!targetSocket || !targetSocket.connected) {
          socket.emit('crossTownTeleportResult', {
            success: false,
            accepted: false,
            reason: 'Target player is not connected',
            cooldownRemaining: 0,
          });
          return;
        }

        // Send request to target player
        targetSocket.emit('crossTownTeleportRequestReceived', {
          fromUserId: newPlayer.id,
          fromUserName: newPlayer.userName,
          fromTownID: this._townID,
          fromTownName: this._friendlyName,
        });

        socket.emit('crossTownTeleportResult', {
          success: true,
          accepted: undefined,
          reason: 'Cross-town teleport request sent',
          cooldownRemaining: 0,
        });
      } catch (err) {
        logError(err);
        socket.emit('crossTownTeleportResult', {
          success: false,
          accepted: false,
          reason: 'Error processing cross-town teleport request',
          cooldownRemaining: 0,
        });
      }
    });

    // Set up a listener for cross-town teleport responses
    socket.on('crossTownTeleportResponse', (data: { fromUserId: string; accepted: boolean }) => {
      try {
        // Note: The requesting player (fromUserId) is in a different town, so we don't check
        // if they're in this town. We just need to notify them of the response.

        if (!data.accepted) {
          // Notify the requesting player that the request was declined
          const townsStore = CoveyTownsStore.getInstance();
          const requestingTownID = townsStore.getPlayerTown(data.fromUserId);
          if (requestingTownID) {
            const requestingTown = townsStore.getTownByID(requestingTownID);
            if (requestingTown) {
              const requestingSocket = requestingTown.getPlayerSocket(data.fromUserId);
              if (requestingSocket) {
                requestingSocket.emit('crossTownTeleportResult', {
                  success: false,
                  accepted: false,
                  reason: 'Cross-town teleport request was declined',
                  cooldownRemaining: 0,
                });
              }
            }
          }
          return;
        }

        // Accepted - set cooldown for the requesting player (they will teleport to this town)
        const townsStore = CoveyTownsStore.getInstance();
        const requestingTownID = townsStore.getPlayerTown(data.fromUserId);
        if (requestingTownID) {
          const requestingTown = townsStore.getTownByID(requestingTownID);
          if (requestingTown) {
            // Set cooldown in the requesting player's town
            (requestingTown as any)._teleportCooldowns?.set(data.fromUserId, Date.now());
          }
        }

        // Accepted - notify the requesting player to join this town
        if (!requestingTownID) {
          socket.emit('crossTownTeleportResult', {
            success: false,
            accepted: false,
            reason: 'Requesting player is not in any town',
            cooldownRemaining: 0,
          });
          return;
        }

        const requestingTown = townsStore.getTownByID(requestingTownID);
        if (!requestingTown) {
          socket.emit('crossTownTeleportResult', {
            success: false,
            accepted: false,
            reason: "Requesting player's town not found",
          });
          return;
        }

        const requestingSocket = requestingTown.getPlayerSocket(data.fromUserId);
        if (!requestingSocket || !requestingSocket.connected) {
          socket.emit('crossTownTeleportResult', {
            success: false,
            accepted: false,
            reason: 'Requesting player is not connected',
          });
          return;
        }

        const targetLocation = newPlayer.location;
        // console.log('Cross-town teleport: Accepting player location:', targetLocation);

        // console.log(
        //   'Cross-town teleport: Sending spawnLocation to requesting player:',
        //   targetLocation,
        // );

        // Notify the requesting player that their request was accepted, include spawn location
        // They will switch to this town and spawn at the specified location
        requestingSocket.emit('crossTownTeleportResult', {
          success: true,
          accepted: true,
          targetTownID: this._townID,
          targetTownName: this._friendlyName,
          targetLocation,
        });

        // Notify the accepting player that the teleport was successful
        // Do NOT include targetTownID - they should stay in their current town, not switch!
        socket.emit('crossTownTeleportResult', {
          success: true,
          accepted: true,
          // No targetTownID - this prevents the accepting player from switching towns
        });
      } catch (err) {
        logError(err);
        socket.emit('crossTownTeleportResult', {
          success: false,
          accepted: false,
          reason: 'Error processing cross-town teleport response',
        });
      }
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

    // Remove player town tracking
    const townsStore = CoveyTownsStore.getInstance();
    townsStore.removePlayerTown(player.id);

    // Set status to Offline when player disconnects and notify friends
    const friendsStore = FriendsStore.getInstance();
    friendsStore.setUserStatus(player.id, 'Offline');

    // Notify friends of status change (across all towns)
    const friends = friendsStore.getFriends(player.id);
    friends.forEach(friend => {
      // Find friend across all towns (they might be in a different town)
      const friendInfo = townsStore.findPlayerAcrossTowns(friend.friendId);
      if (friendInfo) {
        friendInfo.town.emitUserStatusUpdate(friendInfo.player.id, {
          userId: player.id,
          userName: player.userName,
          status: 'Offline',
          townID: undefined,
          townName: undefined,
        });
      }
    });

    this._players = this._players.filter(p => p.id !== player.id);
    this._broadcastEmitter.emit('playerDisconnect', player.toPlayerModel());
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
   * Get the socket for a player by their ID
   * @param playerId The ID of the player
   * @returns The socket for the player, or undefined if not found
   */
  public getPlayerSocket(playerId: string): CoveyTownSocket | undefined {
    return this._playerSockets.get(playerId);
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
   * Emit a friend request event to a specific player
   * @param playerId The ID of the player to notify
   * @param request The friend request data
   */
  public emitFriendRequestToPlayer(
    playerId: string,
    request: { requestId: string; fromUserId: string; fromUserName: string },
  ): void {
    const socket = this._playerSockets.get(playerId);
    if (socket) {
      socket.emit('friendRequestReceived', request);
    }
  }

  /**
   * Emit a friend request accepted event to a specific player
   * @param playerId The ID of the player to notify
   * @param friend The friend data
   */
  public emitFriendRequestAccepted(
    playerId: string,
    friend: { friendId: string; friendUserName: string; friendStatus?: string },
  ): void {
    const socket = this._playerSockets.get(playerId);
    if (socket) {
      socket.emit('friendRequestAccepted', friend);
    }
  }

  /**
   * Emit a friend removed event to a specific player
   * @param playerId The ID of the player to notify
   * @param removedFriend The removed friend data
   */
  public emitFriendRemoved(
    playerId: string,
    removedFriend: { friendId: string; friendUserName: string },
  ): void {
    const socket = this._playerSockets.get(playerId);
    if (socket) {
      socket.emit('friendRemoved', removedFriend);
    }
  }

  /**
   * Emit a user status update event to a specific player
   * @param playerId The ID of the player to notify
   * @param statusUpdate The status update data
   */
  public emitUserStatusUpdate(
    playerId: string,
    statusUpdate: {
      userId: string;
      userName: string;
      status: string;
      townID?: string;
      townName?: string;
    },
  ): void {
    const socket = this._playerSockets.get(playerId);
    if (socket) {
      socket.emit('userStatusUpdated', statusUpdate);
    }
  }

  /**
   * Emit a user blocked notification to a specific player
   * @param playerId The ID of the player to notify (the one being blocked)
   * @param blockData The block event data
   */
  public emitUserBlocked(
    playerId: string,
    blockData: { blockerId: string; blockerUserName: string },
  ): void {
    const socket = this._playerSockets.get(playerId);
    if (socket) {
      socket.emit('userBlocked', blockData);
    }
  }

  /**
   * Emit a user unblocked notification to a specific player
   * @param playerId The ID of the player to notify (the one being unblocked)
   * @param unblockData The unblock event data
   */
  public emitUserUnblocked(
    playerId: string,
    unblockData: { unblockerId: string; unblockerUserName: string },
  ): void {
    const socket = this._playerSockets.get(playerId);
    if (socket) {
      socket.emit('userUnblocked', unblockData);
    }
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

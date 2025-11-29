import assert from 'assert';
import {
  Body,
  Controller,
  Delete,
  Example,
  Get,
  Header,
  Patch,
  Path,
  Post,
  Query,
  Response,
  Route,
  Tags,
} from 'tsoa';

import { Town, TownCreateParams, TownCreateResponse } from '../api/Model';
import InvalidParametersError from '../lib/InvalidParametersError';
import FriendsStore from '../lib/FriendsStore';
import CoveyTownsStore from '../lib/TownsStore';
import {
  ChatMessage,
  ConversationArea,
  CoveyTownSocket,
  TownSettingsUpdate,
  ViewingArea,
} from '../types/CoveyTownSocket';

/**
 * This is the town route
 */
@Route('towns')
@Tags('towns')
// TSOA (which we use to generate the REST API from this file) does not support default exports, so the controller can't be a default export.
// eslint-disable-next-line import/prefer-default-export
export class TownsController extends Controller {
  private _townsStore: CoveyTownsStore = CoveyTownsStore.getInstance();

  private _friendsStore: FriendsStore = FriendsStore.getInstance();

  /**
   * List all towns that are set to be publicly available
   *
   * @returns list of towns
   */
  @Get()
  public async listTowns(): Promise<Town[]> {
    return this._townsStore.getTowns();
  }

  /**
   * Create a new town
   *
   * @param request The public-facing information for the new town
   * @example request {"friendlyName": "My testing town public name", "isPubliclyListed": true}
   * @returns The ID of the newly created town, and a secret password that will be needed to update or delete this town.
   */
  @Example<TownCreateResponse>({ townID: 'stringID', townUpdatePassword: 'secretPassword' })
  @Post()
  public async createTown(@Body() request: TownCreateParams): Promise<TownCreateResponse> {
    const { townID, townUpdatePassword } = await this._townsStore.createTown(
      request.friendlyName,
      request.isPubliclyListed,
      request.mapFile,
    );
    return {
      townID,
      townUpdatePassword,
    };
  }

  /**
   * Updates an existing town's settings by ID
   *
   * @param townID  town to update
   * @param townUpdatePassword  town update password, must match the password returned by createTown
   * @param requestBody The updated settings
   */
  @Patch('{townID}')
  @Response<InvalidParametersError>(400, 'Invalid password or update values specified')
  public async updateTown(
    @Path() townID: string,
    @Header('X-CoveyTown-Password') townUpdatePassword: string,
    @Body() requestBody: TownSettingsUpdate,
  ): Promise<void> {
    const success = this._townsStore.updateTown(
      townID,
      townUpdatePassword,
      requestBody.friendlyName,
      requestBody.isPubliclyListed,
    );
    if (!success) {
      throw new InvalidParametersError('Invalid password or update values specified');
    }
  }

  /**
   * Deletes a town
   * @param townID ID of the town to delete
   * @param townUpdatePassword town update password, must match the password returned by createTown
   */
  @Delete('{townID}')
  @Response<InvalidParametersError>(400, 'Invalid password or update values specified')
  public async deleteTown(
    @Path() townID: string,
    @Header('X-CoveyTown-Password') townUpdatePassword: string,
  ): Promise<void> {
    const success = this._townsStore.deleteTown(townID, townUpdatePassword);
    if (!success) {
      throw new InvalidParametersError('Invalid password or update values specified');
    }
  }

  /**
   * Creates a conversation area in a given town
   * @param townID ID of the town in which to create the new conversation area
   * @param sessionToken session token of the player making the request, must match the session token returned when the player joined the town
   * @param requestBody The new conversation area to create
   */
  @Post('{townID}/conversationArea')
  @Response<InvalidParametersError>(400, 'Invalid values specified')
  public async createConversationArea(
    @Path() townID: string,
    @Header('X-Session-Token') sessionToken: string,
    @Body() requestBody: Omit<ConversationArea, 'type'>,
  ): Promise<void> {
    const town = this._townsStore.getTownByID(townID);
    if (!town?.getPlayerBySessionToken(sessionToken)) {
      throw new InvalidParametersError('Invalid values specified');
    }
    const success = town.addConversationArea({ ...requestBody, type: 'ConversationArea' });
    if (!success) {
      throw new InvalidParametersError('Invalid values specified');
    }
  }

  /**
   * Creates a viewing area in a given town
   *
   * @param townID ID of the town in which to create the new viewing area
   * @param sessionToken session token of the player making the request, must
   *        match the session token returned when the player joined the town
   * @param requestBody The new viewing area to create
   *
   * @throws InvalidParametersError if the session token is not valid, or if the
   *          viewing area could not be created
   */
  @Post('{townID}/viewingArea')
  @Response<InvalidParametersError>(400, 'Invalid values specified')
  public async createViewingArea(
    @Path() townID: string,
    @Header('X-Session-Token') sessionToken: string,
    @Body() requestBody: Omit<ViewingArea, 'type'>,
  ): Promise<void> {
    const town = this._townsStore.getTownByID(townID);
    if (!town) {
      throw new InvalidParametersError('Invalid values specified');
    }
    if (!town?.getPlayerBySessionToken(sessionToken)) {
      throw new InvalidParametersError('Invalid values specified');
    }
    const success = town.addViewingArea({ ...requestBody, type: 'ViewingArea' });
    if (!success) {
      throw new InvalidParametersError('Invalid values specified');
    }
  }

  /**
   * Retrieves up to the first 200 chat messages for a given town, optionally filtered by interactableID
   * @param townID town to retrieve messages for
   * @param sessionToken a valid session token for a player in the town
   * @param interactableID optional interactableID to filter messages by
   * @returns list of chat messages
   */
  @Get('{townID}/chatMessages')
  @Response<InvalidParametersError>(400, 'Invalid values specified')
  public async getChatMessages(
    @Path() townID: string,
    @Header('X-Session-Token') sessionToken: string,
    @Query() interactableID?: string,
  ): Promise<ChatMessage[]> {
    const town = this._townsStore.getTownByID(townID);
    if (!town) {
      throw new InvalidParametersError('Invalid values specified');
    }
    const player = town.getPlayerBySessionToken(sessionToken);
    if (!player) {
      throw new InvalidParametersError('Invalid values specified');
    }
    const messages = town.getChatMessages(interactableID);
    return messages;
  }

  /**
   * Send a friend request to another user
   * Can send to players in the same town or different towns
   * @param townID ID of the town
   * @param sessionToken session token of the player making the request
   * @param requestBody The friend request details
   */
  @Post('{townID}/friendRequest')
  @Response<InvalidParametersError>(400, 'Invalid values specified')
  public async sendFriendRequest(
    @Path() townID: string,
    @Header('X-Session-Token') sessionToken: string,
    @Body() requestBody: { toUserId: string },
  ): Promise<{ requestId: string }> {
    const town = this._townsStore.getTownByID(townID);
    if (!town) {
      throw new InvalidParametersError('Invalid values specified');
    }
    const fromPlayer = town.getPlayerBySessionToken(sessionToken);
    if (!fromPlayer) {
      throw new InvalidParametersError('Invalid values specified');
    }

    if (fromPlayer.id === requestBody.toUserId) {
      throw new InvalidParametersError('Cannot send friend request to yourself');
    }

    // Find the target player across all towns (not just current town)
    const targetPlayerInfo = this._townsStore.findPlayerAcrossTowns(requestBody.toUserId);
    if (!targetPlayerInfo) {
      throw new InvalidParametersError('Target user not found in any town');
    }

    const { player: toPlayer, town: targetTown } = targetPlayerInfo;

    try {
      const request = this._friendsStore.sendFriendRequest(
        fromPlayer.id,
        fromPlayer.userName,
        toPlayer.id,
        toPlayer.userName,
      );

      // Notify the target player via socket (works across towns)
      targetTown.emitFriendRequestToPlayer(toPlayer.id, {
        requestId: request.id,
        fromUserId: request.fromUserId,
        fromUserName: request.fromUserName,
      });

      return { requestId: request.id };
    } catch (error) {
      throw new InvalidParametersError(
        error instanceof Error ? error.message : 'Failed to send friend request',
      );
    }
  }

  /**
   * Accept a friend request
   * @param townID ID of the town
   * @param sessionToken session token of the player accepting the request
   * @param requestBody The friend request ID
   */
  @Post('{townID}/friendRequest/accept')
  @Response<InvalidParametersError>(400, 'Invalid values specified')
  public async acceptFriendRequest(
    @Path() townID: string,
    @Header('X-Session-Token') sessionToken: string,
    @Body() requestBody: { requestId: string },
  ): Promise<{ friendId: string; friendUserName: string }> {
    const town = this._townsStore.getTownByID(townID);
    if (!town) {
      throw new InvalidParametersError('Invalid values specified');
    }
    const player = town.getPlayerBySessionToken(sessionToken);
    if (!player) {
      throw new InvalidParametersError('Invalid values specified');
    }

    try {
      // Get the request before accepting to find the sender
      const allRequests = this._friendsStore.getFriendRequests(player.id);
      const request = allRequests.find(req => req.id === requestBody.requestId);

      if (!request) {
        throw new InvalidParametersError('Friend request not found');
      }

      const friend = this._friendsStore.acceptFriendRequest(requestBody.requestId, player.id);

      // Get user statuses for both players
      const senderStatus = this._friendsStore.getUserStatus(request.fromUserId);
      const accepterStatus = this._friendsStore.getUserStatus(player.id);

      // Notify the sender (fromUserId) that their request was accepted
      // Find sender across all towns (they might be in a different town)
      const senderInfo = this._townsStore.findPlayerAcrossTowns(request.fromUserId);
      if (senderInfo) {
        senderInfo.town.emitFriendRequestAccepted(senderInfo.player.id, {
          friendId: player.id,
          friendUserName: player.userName,
          friendStatus: accepterStatus,
        });
      }

      // Notify the accepter via socket as well (for consistency and real-time updates)
      town.emitFriendRequestAccepted(player.id, {
        friendId: request.fromUserId,
        friendUserName: request.fromUserName,
        friendStatus: senderStatus,
      });

      return { friendId: friend.friendId, friendUserName: friend.friendUserName };
    } catch (error) {
      throw new InvalidParametersError(
        error instanceof Error ? error.message : 'Failed to accept friend request',
      );
    }
  }

  /**
   * Decline a friend request
   * @param townID ID of the town
   * @param sessionToken session token of the player declining the request
   * @param requestBody The friend request ID
   */
  @Post('{townID}/friendRequest/decline')
  @Response<InvalidParametersError>(400, 'Invalid values specified')
  public async declineFriendRequest(
    @Path() townID: string,
    @Header('X-Session-Token') sessionToken: string,
    @Body() requestBody: { requestId: string },
  ): Promise<void> {
    const town = this._townsStore.getTownByID(townID);
    if (!town) {
      throw new InvalidParametersError('Invalid values specified');
    }
    const player = town.getPlayerBySessionToken(sessionToken);
    if (!player) {
      throw new InvalidParametersError('Invalid values specified');
    }

    try {
      this._friendsStore.declineFriendRequest(requestBody.requestId, player.id);
    } catch (error) {
      throw new InvalidParametersError(
        error instanceof Error ? error.message : 'Failed to decline friend request',
      );
    }
  }

  /**
   * Search for players by username across all towns
   * @param townID ID of the town (used for authentication)
   * @param sessionToken session token of the player
   * @param query Username search query
   * @returns list of matching players with their town information
   */
  @Get('{townID}/searchPlayers')
  @Response<InvalidParametersError>(400, 'Invalid values specified')
  public async searchPlayers(
    @Path() townID: string,
    @Header('X-Session-Token') sessionToken: string,
    @Query() query: string,
  ): Promise<Array<{ playerId: string; userName: string; townID: string; townName: string }>> {
    const town = this._townsStore.getTownByID(townID);
    if (!town) {
      throw new InvalidParametersError('Invalid values specified');
    }
    const player = town.getPlayerBySessionToken(sessionToken);
    if (!player) {
      throw new InvalidParametersError('Invalid values specified');
    }

    if (!query || query.trim().length === 0) {
      return [];
    }

    const results = this._townsStore.searchPlayersByUsername(query.trim(), player.id);
    return results.map(({ player: foundPlayer, townID: foundTownID, town: foundTown }) => ({
      playerId: foundPlayer.id,
      userName: foundPlayer.userName,
      townID: foundTownID,
      townName: foundTown.friendlyName,
    }));
  }

  /**
   * Get friend list for the current user
   * @param townID ID of the town
   * @param sessionToken session token of the player
   * @returns list of friends with their statuses
   */
  @Get('{townID}/friends')
  @Response<InvalidParametersError>(400, 'Invalid values specified')
  public async getFriends(
    @Path() townID: string,
    @Header('X-Session-Token') sessionToken: string,
  ): Promise<Array<{ friendId: string; friendUserName: string; friendStatus: string; friendTownID?: string; friendTownName?: string }>> {
    const town = this._townsStore.getTownByID(townID);
    if (!town) {
      throw new InvalidParametersError('Invalid values specified');
    }
    const player = town.getPlayerBySessionToken(sessionToken);
    if (!player) {
      throw new InvalidParametersError('Invalid values specified');
    }

    const friends = this._friendsStore.getFriendsWithStatus(player.id);
    return friends.map(f => {
      const friendTownID = this._townsStore.getPlayerTown(f.friendId);
      const friendTown = friendTownID ? this._townsStore.getTownByID(friendTownID) : undefined;
      return {
        friendId: f.friendId,
        friendUserName: f.friendUserName,
        friendStatus: f.friendStatus,
        friendTownID: friendTownID || undefined,
        friendTownName: friendTown?.friendlyName || undefined,
      };
    });
  }

  /**
   * Get a friend's current town information
   * @param townID ID of the town
   * @param sessionToken session token of the player
   * @param friendId The ID of the friend to get town info for
   * @returns The friend's town information
   */
  @Get('{townID}/friend/{friendId}/town')
  @Response<InvalidParametersError>(400, 'Invalid values specified')
  public async getFriendTown(
    @Path() townID: string,
    @Path() friendId: string,
    @Header('X-Session-Token') sessionToken: string,
  ): Promise<{ townID: string; friendlyName: string; friendLocation?: { x: number; y: number; rotation: string } } | null> {
    const town = this._townsStore.getTownByID(townID);
    if (!town) {
      throw new InvalidParametersError('Invalid values specified');
    }
    const player = town.getPlayerBySessionToken(sessionToken);
    if (!player) {
      throw new InvalidParametersError('Invalid values specified');
    }

    // Check if they are friends
    if (!this._friendsStore.areFriends(player.id, friendId) && !this._friendsStore.areFriends(friendId, player.id)) {
      throw new InvalidParametersError('Users are not friends');
    }

    const friendTownID = this._townsStore.getPlayerTown(friendId);
    if (!friendTownID) {
      return null; // Friend is not in any town
    }

    const friendTown = this._townsStore.getTownByID(friendTownID);
    if (!friendTown) {
      return null; // Town doesn't exist
    }

    // Get friend's location if they're in the same town
    const friendPlayer = friendTown.players.find(p => p.id === friendId);
    const friendLocation = friendPlayer ? {
      x: friendPlayer.location.x,
      y: friendPlayer.location.y,
      rotation: friendPlayer.location.rotation,
    } : undefined;

    return {
      townID: friendTownID,
      friendlyName: friendTown.friendlyName,
      friendLocation,
    };
  }

  /**
   * Update user status
   * @param townID ID of the town
   * @param sessionToken session token of the player
   * @param requestBody The new status
   */
  @Post('{townID}/status')
  @Response<InvalidParametersError>(400, 'Invalid values specified')
  public async updateUserStatus(
    @Path() townID: string,
    @Header('X-Session-Token') sessionToken: string,
    @Body() requestBody: { status: 'Online' | 'Busy' | 'Offline' },
  ): Promise<void> {
    const town = this._townsStore.getTownByID(townID);
    if (!town) {
      throw new InvalidParametersError('Invalid values specified');
    }
    const player = town.getPlayerBySessionToken(sessionToken);
    if (!player) {
      throw new InvalidParametersError('Invalid values specified');
    }

    // Validate status
    if (!['Online', 'Busy', 'Offline'].includes(requestBody.status)) {
      throw new InvalidParametersError('Invalid status value');
    }

    // Update status in store
    this._friendsStore.setUserStatus(player.id, requestBody.status);

    // Notify all friends of the status change
    const friends = this._friendsStore.getFriends(player.id);
    friends.forEach(friend => {
      const friendPlayer = town.players.find(p => p.id === friend.friendId);
      if (friendPlayer) {
        town.emitUserStatusUpdate(friendPlayer.id, {
          userId: player.id,
          userName: player.userName,
          status: requestBody.status,
        });
      }
    });
  }

  /**
   * Get pending friend requests for the current user
   * @param townID ID of the town
   * @param sessionToken session token of the player
   * @returns list of pending friend requests
   */
  @Get('{townID}/friendRequests')
  @Response<InvalidParametersError>(400, 'Invalid values specified')
  public async getFriendRequests(
    @Path() townID: string,
    @Header('X-Session-Token') sessionToken: string,
  ): Promise<
    Array<{
      requestId: string;
      fromUserId: string;
      fromUserName: string;
      toUserId: string;
      toUserName: string;
      status: string;
      createdAt: Date;
    }>
  > {
    const town = this._townsStore.getTownByID(townID);
    if (!town) {
      throw new InvalidParametersError('Invalid values specified');
    }
    const player = town.getPlayerBySessionToken(sessionToken);
    if (!player) {
      throw new InvalidParametersError('Invalid values specified');
    }

    const requests = this._friendsStore.getReceivedFriendRequests(player.id);
    return requests.map(r => ({
      requestId: r.id,
      fromUserId: r.fromUserId,
      fromUserName: r.fromUserName,
      toUserId: r.toUserId,
      toUserName: r.toUserName,
      status: r.status,
      createdAt: r.createdAt,
    }));
  }

  /**
   * Remove a friend from the current user's friend list
   * @param townID ID of the town
   * @param sessionToken session token of the player
   * @param requestBody The friend ID to remove
   */
  @Delete('{townID}/friends')
  @Response<InvalidParametersError>(400, 'Invalid values specified')
  public async removeFriend(
    @Path() townID: string,
    @Header('X-Session-Token') sessionToken: string,
    @Body() requestBody: { friendId: string },
  ): Promise<void> {
    const town = this._townsStore.getTownByID(townID);
    if (!town) {
      throw new InvalidParametersError('Invalid values specified');
    }
    const player = town.getPlayerBySessionToken(sessionToken);
    if (!player) {
      throw new InvalidParametersError('Invalid values specified');
    }

    // Check if they are friends
    if (!this._friendsStore.areFriends(player.id, requestBody.friendId)) {
      throw new InvalidParametersError('Users are not friends');
    }

    // Get friend info before removing
    const friends = this._friendsStore.getFriends(player.id);
    const friend = friends.find(f => f.friendId === requestBody.friendId);
    if (!friend) {
      throw new InvalidParametersError('Friend not found');
    }

    // Remove friend from both sides
    this._friendsStore.removeFriend(player.id, requestBody.friendId);

    // Notify the removed friend via socket if they're in the same town
    const friendPlayer = town.players.find(p => p.id === requestBody.friendId);
    if (friendPlayer) {
      town.emitFriendRemoved(friendPlayer.id, {
        friendId: player.id,
        friendUserName: player.userName,
      });
    }
  }

  /**
   * Connects a client's socket to the requested town, or disconnects the socket if no such town exists
   *
   * @param socket A new socket connection, with the userName and townID parameters of the socket's
   * auth object configured with the desired townID to join and username to use
   *
   */
  public async joinTown(socket: CoveyTownSocket) {
    // Parse the client's requested username from the connection
    const { userName, townID } = socket.handshake.auth as { userName: string; townID: string };

    const town = this._townsStore.getTownByID(townID);
    if (!town) {
      socket.disconnect(true);
      return;
    }

    // Connect the client to the socket.io broadcast room for this town
    socket.join(town.townID);

    const newPlayer = await town.addPlayer(userName, socket);
    assert(newPlayer.videoToken);
    console.log('Generated token:', newPlayer.videoToken);
    console.log('Identity:', newPlayer.userName);

    // Track that this player is in this town
    this._townsStore.setPlayerTown(newPlayer.id, townID);

    // Check if this username had friends under a different player ID and migrate them
    // This ensures friend lists persist when switching towns
    const oldPlayerId = this._friendsStore.getPlayerIdForUsername(userName);
    if (oldPlayerId && oldPlayerId !== newPlayer.id) {
      // Migrate friends from old player ID to new player ID
      this._friendsStore.migratePlayerFriends(oldPlayerId, newPlayer.id, userName);
    }
    // Always update the username to player ID mapping
    this._friendsStore.migratePlayerFriends(newPlayer.id, newPlayer.id, userName);

    // Set default status to Online when user joins
    this._friendsStore.setUserStatus(newPlayer.id, 'Online');

    socket.emit('initialize', {
      userID: newPlayer.id,
      sessionToken: newPlayer.sessionToken,
      providerVideoToken: newPlayer.videoToken,
      currentPlayers: town.players.map(eachPlayer => eachPlayer.toPlayerModel()),
      friendlyName: town.friendlyName,
      isPubliclyListed: town.isPubliclyListed,
      interactables: town.interactables.map(eachInteractable => eachInteractable.toModel()),
    });
  }
}

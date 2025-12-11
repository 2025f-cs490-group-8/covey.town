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
  @Response<InvalidParametersError>(400, 'Invalid values specified')
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
   * @param requestBody The friend request details - use account username, not display name
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

    // Get database user IDs (account usernames) for both players
    const fromAccountUsername = this._friendsStore.getDatabaseUserId(fromPlayer.id);
    const toAccountUsername = this._friendsStore.getDatabaseUserId(requestBody.toUserId);

    if (fromAccountUsername === toAccountUsername) {
      throw new InvalidParametersError('Cannot send friend request to yourself');
    }

    // Find the target player across all towns (not just current town)
    const targetPlayerInfo = this._townsStore.findPlayerAcrossTowns(requestBody.toUserId);
    if (!targetPlayerInfo) {
      throw new InvalidParametersError('Target user not found in any town');
    }

    const { player: toPlayer, town: targetTown } = targetPlayerInfo;

    try {
      // Use account usernames for friend request (persistent across sessions)
      const request = await this._friendsStore.sendFriendRequest(
        fromAccountUsername,
        fromAccountUsername, // Store account username as display name
        toAccountUsername,
        toAccountUsername,
      );

      // Notify the target player via socket (works across towns)
      targetTown.emitFriendRequestToPlayer(toPlayer.id, {
        requestId: request.id,
        fromUserId: fromPlayer.id, // Send session ID to client
        fromUserName: fromAccountUsername, // Send account username
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

    const accountUsername = this._friendsStore.getDatabaseUserId(player.id);

    try {
      // Get the request before accepting to find the sender
      const allRequests = this._friendsStore.getFriendRequests(accountUsername);
      const request = allRequests.find(req => req.id === requestBody.requestId);

      if (!request) {
        throw new InvalidParametersError('Friend request not found');
      }

      const friend = await this._friendsStore.acceptFriendRequest(
        requestBody.requestId,
        accountUsername,
      );

      // Get user statuses - check if they're actually in a town
      const senderSessionId = this._friendsStore.getSessionPlayerId(request.fromUserId);
      const senderTownID = senderSessionId
        ? this._townsStore.getPlayerTown(senderSessionId)
        : undefined;
      const senderStatus = senderTownID
        ? this._friendsStore.getUserStatus(request.fromUserId)
        : 'Offline';
      const accepterStatus = this._friendsStore.getUserStatus(accountUsername);

      // Notify the sender (fromUserId) that their request was accepted
      if (senderSessionId) {
        const senderInfo = this._townsStore.findPlayerAcrossTowns(senderSessionId);
        if (senderInfo) {
          senderInfo.town.emitFriendRequestAccepted(senderInfo.player.id, {
            friendId: player.id, // Send session ID to client
            friendUserName: accountUsername, // Send account username
            friendStatus: accepterStatus,
          });
        }
      }

      // Notify the accepter via socket as well (for consistency and real-time updates)
      const senderSessionIdForClient = senderSessionId || request.fromUserId;
      town.emitFriendRequestAccepted(player.id, {
        friendId: senderSessionIdForClient, // Send session ID to client if available
        friendUserName: request.fromUserName, // Account username
        friendStatus: senderStatus,
      });

      return {
        friendId: senderSessionIdForClient, // Return session ID to client
        friendUserName: friend.friendUserName, // Account username
      };
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

    const accountUsername = this._friendsStore.getDatabaseUserId(player.id);

    try {
      this._friendsStore.declineFriendRequest(requestBody.requestId, accountUsername);
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
      playerId: foundPlayer.id, // Session player ID
      userName: foundPlayer.userName, // Display name in town
      townID: foundTownID,
      townName: foundTown.friendlyName,
    }));
  }

  /**
   * Get the list of friends for the current user
   * @param townID ID of the town
   * @param sessionToken session token of the player
   * @returns list of friends with their status and town information
   */
  @Get('{townID}/friends')
  @Response<InvalidParametersError>(400, 'Invalid values specified')
  public async getFriends(
    @Path() townID: string,
    @Header('X-Session-Token') sessionToken: string,
  ): Promise<
    Array<{
      friendId: string;
      friendUserName: string;
      friendStatus: string;
      friendTownID?: string;
      friendTownName?: string;
      isBlockedByFriend?: boolean;
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

    const accountUsername = this._friendsStore.getDatabaseUserId(player.id);
    const friends = this._friendsStore.getFriendsWithStatus(accountUsername);

    return friends.map(f => {
      // Try to get current session ID for the friend (by their account username)
      const friendSessionId = this._friendsStore.getSessionPlayerId(f.friendId);
      const friendTownID = friendSessionId
        ? this._townsStore.getPlayerTown(friendSessionId)
        : undefined;
      const friendTown = friendTownID ? this._townsStore.getTownByID(friendTownID) : undefined;

      // If friend is not in any town, their status should be Offline
      const actualStatus = friendTownID ? f.friendStatus : 'Offline';
      // Check if this friend has blocked the current user
      const isBlockedByFriend = this._friendsStore.isBlocked(f.friendId, player.id);

      return {
        friendId: friendSessionId || f.friendId, // Return session ID if available, otherwise account username
        friendUserName: f.friendUserName, // Account username (persistent)
        friendStatus: actualStatus,
        friendTownID: friendTownID || undefined,
        friendTownName: friendTown?.friendlyName || undefined,
        isBlockedByFriend,
      };
    });
  }

  /**
   * Get a friend's current town information
   * @param townID ID of the town
   * @param sessionToken session token of the player
   * @param friendId The ID of the friend to get town info for (can be session or account username)
   * @returns The friend's town information
   */
  @Get('{townID}/friend/{friendId}/town')
  @Response<InvalidParametersError>(400, 'Invalid values specified')
  public async getFriendTown(
    @Path() townID: string,
    @Path() friendId: string,
    @Header('X-Session-Token') sessionToken: string,
  ): Promise<{
    townID: string;
    friendlyName: string;
    friendLocation?: { x: number; y: number; rotation: string };
  } | null> {
    const town = this._townsStore.getTownByID(townID);
    if (!town) {
      throw new InvalidParametersError('Invalid values specified');
    }
    const player = town.getPlayerBySessionToken(sessionToken);
    if (!player) {
      throw new InvalidParametersError('Invalid values specified');
    }

    const accountUsername = this._friendsStore.getDatabaseUserId(player.id);
    const friendAccountUsername = this._friendsStore.getDatabaseUserId(friendId);

    // Check if they are friends (using account usernames)
    if (!this._friendsStore.areFriends(accountUsername, friendAccountUsername)) {
      throw new InvalidParametersError('Users are not friends');
    }

    // Try to get friend's session ID (by their account username)
    const friendSessionId =
      this._friendsStore.getSessionPlayerId(friendAccountUsername) || friendId;
    const friendTownID = this._townsStore.getPlayerTown(friendSessionId);

    if (!friendTownID) {
      return null; // Friend is not in any town
    }

    const friendTown = this._townsStore.getTownByID(friendTownID);
    if (!friendTown) {
      return null; // Town doesn't exist
    }

    // Get friend's location if they're in the town
    const friendPlayer = friendTown.players.find(p => p.id === friendSessionId);
    const friendLocation = friendPlayer
      ? {
          x: friendPlayer.location.x,
          y: friendPlayer.location.y,
          rotation: friendPlayer.location.rotation,
        }
      : undefined;

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

    const accountUsername = this._friendsStore.getDatabaseUserId(player.id);

    // Update status in store (using account username)
    this._friendsStore.setUserStatus(accountUsername, requestBody.status);

    // Notify all friends of the status change (across all towns)
    const friends = this._friendsStore.getFriends(accountUsername);
    friends.forEach(friend => {
      // Try to get friend's session ID (by their account username)
      const friendSessionId = this._friendsStore.getSessionPlayerId(friend.friendId);
      if (friendSessionId) {
        const friendInfo = this._townsStore.findPlayerAcrossTowns(friendSessionId);
        if (friendInfo) {
          friendInfo.town.emitUserStatusUpdate(friendInfo.player.id, {
            userId: player.id, // Send session ID to client
            userName: accountUsername, // Send account username
            status: requestBody.status,
            townID: town.townID,
            townName: town.friendlyName,
          });
        }
      }
    });
  }

  /**
   * Get pending friend requests for the current user
   * @param townID ID of the town
   * @param sessionToken session token of the player
   * @returns list of pending friend requests (using account usernames)
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

    const accountUsername = this._friendsStore.getDatabaseUserId(player.id);
    const requests = this._friendsStore.getReceivedFriendRequests(accountUsername);

    return requests.map(r => {
      // Try to get session IDs for display
      const fromSessionId = this._friendsStore.getSessionPlayerId(r.fromUserId) || r.fromUserId;
      const toSessionId = this._friendsStore.getSessionPlayerId(r.toUserId) || r.toUserId;

      return {
        requestId: r.id,
        fromUserId: fromSessionId, // Return session ID if available
        fromUserName: r.fromUserName, // Account username
        toUserId: toSessionId, // Return session ID if available
        toUserName: r.toUserName, // Account username
        status: r.status,
        createdAt: r.createdAt,
      };
    });
  }

  /**
   * Remove a friend from the current user's friend list
   * @param townID ID of the town
   * @param sessionToken session token of the player
   * @param requestBody The friend ID to remove (can be session ID or account username)
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

    const accountUsername = this._friendsStore.getDatabaseUserId(player.id);
    const friendAccountUsername = this._friendsStore.getDatabaseUserId(requestBody.friendId);

    // Check if they are friends (using account usernames)
    if (!this._friendsStore.areFriends(accountUsername, friendAccountUsername)) {
      throw new InvalidParametersError('Users are not friends');
    }

    // Get friend info before removing
    const friends = this._friendsStore.getFriends(accountUsername);
    const friend = friends.find(f => f.friendId === friendAccountUsername);
    if (!friend) {
      throw new InvalidParametersError('Friend not found');
    }

    // Remove friend from both sides (using account usernames)
    await this._friendsStore.removeFriend(accountUsername, friendAccountUsername);

    // Notify the removed friend via socket if they're online
    const friendSessionId = this._friendsStore.getSessionPlayerId(friendAccountUsername);
    if (friendSessionId) {
      const friendInfo = this._townsStore.findPlayerAcrossTowns(friendSessionId);
      if (friendInfo) {
        friendInfo.town.emitFriendRemoved(friendInfo.player.id, {
          friendId: player.id, // Send session ID to client
          friendUserName: accountUsername, // Send account username
        });
      }
    }
  }

  /**
   * Block a user. This removes the friendship and prevents future interactions.
   * @param townID ID of the town
   * @param sessionToken session token of the player
   * @param requestBody The user ID to block
   */
  @Post('{townID}/block')
  @Response<InvalidParametersError>(400, 'Invalid values specified')
  public async blockUser(
    @Path() townID: string,
    @Header('X-Session-Token') sessionToken: string,
    @Body() requestBody: { userId: string },
  ): Promise<void> {
    const town = this._townsStore.getTownByID(townID);
    if (!town) {
      throw new InvalidParametersError('Invalid values specified');
    }
    const player = town.getPlayerBySessionToken(sessionToken);
    if (!player) {
      throw new InvalidParametersError('Invalid values specified');
    }

    if (player.id === requestBody.userId) {
      throw new InvalidParametersError('Cannot block yourself');
    }

    // Find the user to block across all towns
    const targetPlayerInfo = this._townsStore.findPlayerAcrossTowns(requestBody.userId);
    const targetUserName = targetPlayerInfo?.player.userName || 'Unknown User';

    try {
      // Block the user (removes friendship from blocker's side only)
      this._friendsStore.blockUser(player.id, player.userName, requestBody.userId, targetUserName);

      // Notify the blocked user that they've been blocked (if they're online)
      // They will still see the blocker in their friends list but with a "blocked" indicator
      if (targetPlayerInfo) {
        targetPlayerInfo.town.emitUserBlocked(targetPlayerInfo.player.id, {
          blockerId: player.id,
          blockerUserName: player.userName,
        });
      }
    } catch (error) {
      throw new InvalidParametersError(
        error instanceof Error ? error.message : 'Failed to block user',
      );
    }
  }

  /**
   * Unblock a user and restore the friendship
   * @param townID ID of the town
   * @param sessionToken session token of the player
   * @param requestBody The user ID to unblock
   * @returns The restored friend info if the friendship was restored
   */
  @Post('{townID}/unblock')
  @Response<InvalidParametersError>(400, 'Invalid values specified')
  public async unblockUser(
    @Path() townID: string,
    @Header('X-Session-Token') sessionToken: string,
    @Body() requestBody: { userId: string },
  ): Promise<{
    friendRestored: boolean;
    friend?: {
      friendId: string;
      friendUserName: string;
      friendStatus: string;
      friendTownID?: string;
      friendTownName?: string;
    };
  }> {
    const town = this._townsStore.getTownByID(townID);
    if (!town) {
      throw new InvalidParametersError('Invalid values specified');
    }
    const player = town.getPlayerBySessionToken(sessionToken);
    if (!player) {
      throw new InvalidParametersError('Invalid values specified');
    }

    try {
      const restoredFriend = this._friendsStore.unblockUser(player.id, requestBody.userId);

      // Notify the unblocked user (if they're online) so they can update their UI
      const unblockedPlayerInfo = this._townsStore.findPlayerAcrossTowns(requestBody.userId);
      if (unblockedPlayerInfo) {
        unblockedPlayerInfo.town.emitUserUnblocked(unblockedPlayerInfo.player.id, {
          unblockerId: player.id,
          unblockerUserName: player.userName,
        });
      }

      if (restoredFriend) {
        // Get the friend's current status and town info
        const friendTownID = this._townsStore.getPlayerTown(restoredFriend.friendId);
        const friendTown = friendTownID ? this._townsStore.getTownByID(friendTownID) : undefined;
        const friendStatus = friendTownID
          ? this._friendsStore.getUserStatus(restoredFriend.friendId)
          : 'Offline';

        return {
          friendRestored: true,
          friend: {
            friendId: restoredFriend.friendId,
            friendUserName: restoredFriend.friendUserName,
            friendStatus,
            friendTownID: friendTownID || undefined,
            friendTownName: friendTown?.friendlyName || undefined,
          },
        };
      }

      return { friendRestored: false };
    } catch (error) {
      throw new InvalidParametersError(
        error instanceof Error ? error.message : 'Failed to unblock user',
      );
    }
  }

  /**
   * Get list of blocked users for the current user
   * @param townID ID of the town
   * @param sessionToken session token of the player
   * @returns list of blocked users
   */
  @Get('{townID}/blocked')
  @Response<InvalidParametersError>(400, 'Invalid values specified')
  public async getBlockedUsers(
    @Path() townID: string,
    @Header('X-Session-Token') sessionToken: string,
  ): Promise<Array<{ blockedId: string; blockedUserName: string; createdAt: Date }>> {
    const town = this._townsStore.getTownByID(townID);
    if (!town) {
      throw new InvalidParametersError('Invalid values specified');
    }
    const player = town.getPlayerBySessionToken(sessionToken);
    if (!player) {
      throw new InvalidParametersError('Invalid values specified');
    }

    const blockedUsers = this._friendsStore.getBlockedUsers(player.id);
    return blockedUsers.map(b => ({
      blockedId: b.blockedId,
      blockedUserName: b.blockedUserName,
      createdAt: b.createdAt,
    }));
  }

  /**
   * Check if a user is blocked by the current player
   * @param townID ID of the town
   * @param sessionToken session token of the player
   * @param userId ID of the user to check
   * @returns whether the user is blocked
   */
  @Get('{townID}/blocked/{userId}')
  @Response<InvalidParametersError>(400, 'Invalid values specified')
  public async isUserBlocked(
    @Path() townID: string,
    @Path() userId: string,
    @Header('X-Session-Token') sessionToken: string,
  ): Promise<{ isBlocked: boolean }> {
    const town = this._townsStore.getTownByID(townID);
    if (!town) {
      throw new InvalidParametersError('Invalid values specified');
    }
    const player = town.getPlayerBySessionToken(sessionToken);
    if (!player) {
      throw new InvalidParametersError('Invalid values specified');
    }

    return { isBlocked: this._friendsStore.isBlocked(player.id, userId) };
  }

  /**
   * Connects a client's socket to the requested town, or disconnects the socket if no such town exists
   *
   * @param socket A new socket connection, with the userName, townID, and accountUsername parameters
   * configured with the desired townID to join, display name to use, and account username for persistence
   *
   */
  public async joinTown(socket: CoveyTownSocket) {
    // Parse the client's requested username and optional spawn location from the connection
    const { userName, townID, spawnLocation, accountUsername } = socket.handshake.auth as {
      userName: string;
      townID: string;
      spawnLocation?: { x: number; y: number; rotation: string; moving: boolean };
      accountUsername?: string;
    };

    const town = this._townsStore.getTownByID(townID);
    if (!town) {
      socket.disconnect(true);
      return;
    }

    // Connect the client to the socket.io broadcast room for this town
    socket.join(town.townID);

    // console.log('joinTown called with spawnLocation:', spawnLocation);
    const newPlayer = await town.addPlayer(userName, socket, spawnLocation);
    // console.log('Player created with location:', newPlayer.location);
    assert(newPlayer.videoToken);
    // console.log('Generated token:', newPlayer.videoToken);
    // console.log('Display Name:', newPlayer.userName);

    // Use accountUsername if provided, otherwise fall back to userName
    const effectiveAccountUsername = accountUsername || userName;
    // console.log('Account Username:', effectiveAccountUsername);

    // Track that this player is in this town
    this._townsStore.setPlayerTown(newPlayer.id, townID);

    // Register this session with the FriendsStore using the account username
    // accountUsername is the persistent identifier (e.g., "t" from login)
    // userName is the display name in the town (e.g., "wahgiotghwaioghwa")
    this._friendsStore.registerSession(
      newPlayer.id,
      effectiveAccountUsername,
      effectiveAccountUsername,
    );

    // Set default status to Online when user joins
    this._friendsStore.setUserStatus(effectiveAccountUsername, 'Online');

    // Notify all friends across all towns that this player is now Online
    const friends = this._friendsStore.getFriends(effectiveAccountUsername);
    friends.forEach(friend => {
      const friendSessionId = this._friendsStore.getSessionPlayerId(friend.friendId);
      if (friendSessionId) {
        const friendInfo = this._townsStore.findPlayerAcrossTowns(friendSessionId);
        if (friendInfo) {
          friendInfo.town.emitUserStatusUpdate(friendInfo.player.id, {
            userId: newPlayer.id, // Send session ID to client
            userName: effectiveAccountUsername, // Send account username (persistent)
            status: 'Online',
            townID: town.townID,
            townName: town.friendlyName,
          });
        }
      }
    });

    socket.emit('initialize', {
      userID: newPlayer.id,
      sessionToken: newPlayer.sessionToken,
      providerVideoToken: newPlayer.videoToken,
      currentPlayers: town.players.map(eachPlayer => eachPlayer.toPlayerModel()),
      friendlyName: town.friendlyName,
      isPubliclyListed: town.isPubliclyListed,
      interactables: town.interactables.map(eachInteractable => eachInteractable.toModel()),
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      // Unregister the session
      this._friendsStore.unregisterSession(newPlayer.id);

      // Set status to Offline
      this._friendsStore.setUserStatus(effectiveAccountUsername, 'Offline');

      // Notify friends of offline status
      friends.forEach(friend => {
        const friendSessionId = this._friendsStore.getSessionPlayerId(friend.friendId);
        if (friendSessionId) {
          const friendInfo = this._townsStore.findPlayerAcrossTowns(friendSessionId);
          if (friendInfo) {
            friendInfo.town.emitUserStatusUpdate(friendInfo.player.id, {
              userId: newPlayer.id,
              userName: effectiveAccountUsername, // Send account username
              status: 'Offline',
              townID: undefined,
              townName: undefined,
            });
          }
        }
      });
    });
  }
}

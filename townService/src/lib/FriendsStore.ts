import { nanoid } from 'nanoid';

export interface FriendRequest {
  id: string;
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  toUserName: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: Date;
}

export interface Friend {
  userId: string;
  userName: string;
  friendId: string;
  friendUserName: string;
  createdAt: Date;
}

export type UserStatus = 'Online' | 'Busy' | 'Offline';

/**
 * Singleton store for managing friend lists and friend requests
 * Uses in-memory storage (in a real app, this would be a database)
 */
export default class FriendsStore {
  private static _instance: FriendsStore;

  // Map from userId to their friends
  private _friends: Map<string, Friend[]> = new Map();

  // Map from userId to their pending friend requests (both sent and received)
  private _friendRequests: Map<string, FriendRequest[]> = new Map();

  // Map from userId to their current status
  private _userStatuses: Map<string, UserStatus> = new Map();

  // Map from username to their current player ID (for friend migration when switching towns)
  private _usernameToPlayerId: Map<string, string> = new Map();

  static getInstance(): FriendsStore {
    if (FriendsStore._instance === undefined) {
      FriendsStore._instance = new FriendsStore();
    }
    return FriendsStore._instance;
  }

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Send a friend request from one user to another
   */
  sendFriendRequest(
    fromUserId: string,
    fromUserName: string,
    toUserId: string,
    toUserName: string,
  ): FriendRequest {
    // Check if they're already friends
    if (this.areFriends(fromUserId, toUserId)) {
      throw new Error('Users are already friends');
    }

    // Check if there's already a pending request
    const existingRequest = this.getPendingRequest(fromUserId, toUserId);
    if (existingRequest) {
      throw new Error('Friend request already exists');
    }

    const request: FriendRequest = {
      id: nanoid(),
      fromUserId,
      fromUserName,
      toUserId,
      toUserName,
      status: 'pending',
      createdAt: new Date(),
    };

    // Add to both users' request lists
    if (!this._friendRequests.has(fromUserId)) {
      this._friendRequests.set(fromUserId, []);
    }
    if (!this._friendRequests.has(toUserId)) {
      this._friendRequests.set(toUserId, []);
    }

    this._friendRequests.get(fromUserId)!.push(request);
    this._friendRequests.get(toUserId)!.push(request);

    return request;
  }

  /**
   * Accept a friend request
   */
  acceptFriendRequest(requestId: string, userId: string): Friend {
    const request = this.findRequest(requestId);
    if (!request) {
      throw new Error('Friend request not found');
    }

    // Verify the user is the recipient
    if (request.toUserId !== userId) {
      throw new Error('User is not the recipient of this request');
    }

    if (request.status !== 'pending') {
      throw new Error('Friend request is not pending');
    }

    // Update request status
    request.status = 'accepted';

    // Add to both users' friend lists
    const friend1: Friend = {
      userId: request.fromUserId,
      userName: request.fromUserName,
      friendId: request.toUserId,
      friendUserName: request.toUserName,
      createdAt: new Date(),
    };

    const friend2: Friend = {
      userId: request.toUserId,
      userName: request.toUserName,
      friendId: request.fromUserId,
      friendUserName: request.fromUserName,
      createdAt: new Date(),
    };

    if (!this._friends.has(request.fromUserId)) {
      this._friends.set(request.fromUserId, []);
    }
    if (!this._friends.has(request.toUserId)) {
      this._friends.set(request.toUserId, []);
    }

    this._friends.get(request.fromUserId)!.push(friend1);
    this._friends.get(request.toUserId)!.push(friend2);

    return friend2; // Return the friend from the perspective of the accepter
  }

  /**
   * Decline a friend request
   */
  declineFriendRequest(requestId: string, userId: string): void {
    const request = this.findRequest(requestId);
    if (!request) {
      throw new Error('Friend request not found');
    }

    // Verify the user is the recipient
    if (request.toUserId !== userId) {
      throw new Error('User is not the recipient of this request');
    }

    if (request.status !== 'pending') {
      throw new Error('Friend request is not pending');
    }

    request.status = 'declined';
  }

  /**
   * Get all pending friend requests for a user (both sent and received)
   */
  getFriendRequests(userId: string): FriendRequest[] {
    return this._friendRequests.get(userId) || [];
  }

  /**
   * Get pending friend requests received by a user
   */
  getReceivedFriendRequests(userId: string): FriendRequest[] {
    return this.getFriendRequests(userId).filter(
      req => req.toUserId === userId && req.status === 'pending',
    );
  }

  /**
   * Get pending friend requests sent by a user
   */
  getSentFriendRequests(userId: string): FriendRequest[] {
    return this.getFriendRequests(userId).filter(
      req => req.fromUserId === userId && req.status === 'pending',
    );
  }

  /**
   * Get all friends of a user
   */
  getFriends(userId: string): Friend[] {
    return this._friends.get(userId) || [];
  }

  /**
   * Set user status
   */
  setUserStatus(userId: string, status: UserStatus): void {
    this._userStatuses.set(userId, status);
  }

  /**
   * Get user status (defaults to 'Offline' if not set)
   */
  getUserStatus(userId: string): UserStatus {
    return this._userStatuses.get(userId) || 'Offline';
  }

  /**
   * Get friends with their current statuses
   */
  getFriendsWithStatus(userId: string): Array<Friend & { friendStatus: UserStatus }> {
    const friends = this.getFriends(userId);
    return friends.map(friend => ({
      ...friend,
      friendStatus: this.getUserStatus(friend.friendId),
    }));
  }

  /**
   * Check if two users are friends
   */
  areFriends(userId1: string, userId2: string): boolean {
    const friends = this.getFriends(userId1);
    return friends.some(friend => friend.friendId === userId2);
  }

  /**
   * Remove a friend
   */
  removeFriend(userId: string, friendId: string): void {
    const friends = this._friends.get(userId);
    if (friends) {
      this._friends.set(
        userId,
        friends.filter(f => f.friendId !== friendId),
      );
    }

    // Also remove from the other user's list
    const otherFriends = this._friends.get(friendId);
    if (otherFriends) {
      this._friends.set(
        friendId,
        otherFriends.filter(f => f.friendId !== userId),
      );
    }
  }

  /**
   * Find a friend request by ID
   */
  private findRequest(requestId: string): FriendRequest | undefined {
    for (const requests of this._friendRequests.values()) {
      const request = requests.find(r => r.id === requestId);
      if (request) {
        return request;
      }
    }
    return undefined;
  }

  /**
   * Get a pending request between two users
   */
  private getPendingRequest(userId1: string, userId2: string): FriendRequest | undefined {
    const requests = this.getFriendRequests(userId1);
    return requests.find(
      req =>
        req.status === 'pending' &&
        ((req.fromUserId === userId1 && req.toUserId === userId2) ||
          (req.fromUserId === userId2 && req.toUserId === userId1)),
    );
  }

  /**
   * Migrate friends from an old player ID to a new player ID
   * This is used when a player switches towns and gets a new player ID
   * @param oldPlayerId The old player ID
   * @param newPlayerId The new player ID
   * @param userName The username (for verification)
   */
  migratePlayerFriends(oldPlayerId: string, newPlayerId: string, userName: string): void {
    // Always update the username to player ID mapping
    this._usernameToPlayerId.set(userName, newPlayerId);
    
    if (oldPlayerId === newPlayerId) {
      return; // No migration needed (just updating the mapping)
    }

    // Migrate friends
    const oldFriends = this._friends.get(oldPlayerId);
    if (oldFriends && oldFriends.length > 0) {
      // Verify that the old friends belong to the same username
      const validFriends = oldFriends.filter(f => f.userName === userName);
      if (validFriends.length > 0) {
        // Set friends for new player ID (merge with existing if any)
        if (!this._friends.has(newPlayerId)) {
          this._friends.set(newPlayerId, []);
        }
        const newPlayerFriends = this._friends.get(newPlayerId)!;
        
        // Add friends that don't already exist
        validFriends.forEach(oldFriend => {
          const migratedFriend = {
            ...oldFriend,
            userId: newPlayerId,
          };
          
          // Check if this friend already exists (by friendId)
          if (!newPlayerFriends.some(f => f.friendId === migratedFriend.friendId)) {
            newPlayerFriends.push(migratedFriend);
          }
        });
        
        // Update friend references in other players' friend lists
        validFriends.forEach(friend => {
          const otherPlayerFriends = this._friends.get(friend.friendId);
          if (otherPlayerFriends) {
            const friendIndex = otherPlayerFriends.findIndex(f => f.friendId === oldPlayerId);
            if (friendIndex !== -1) {
              // Update to point to new player ID
              otherPlayerFriends[friendIndex] = {
                ...otherPlayerFriends[friendIndex],
                friendId: newPlayerId,
              };
            }
          }
        });
      }
    }

    // Migrate friend requests
    const oldRequests = this._friendRequests.get(oldPlayerId);
    if (oldRequests && oldRequests.length > 0) {
      if (!this._friendRequests.has(newPlayerId)) {
        this._friendRequests.set(newPlayerId, []);
      }
      const newPlayerRequests = this._friendRequests.get(newPlayerId)!;
      
      oldRequests.forEach(request => {
        // Update the request to use new player ID
        if (request.fromUserId === oldPlayerId) {
          request.fromUserId = newPlayerId;
        }
        if (request.toUserId === oldPlayerId) {
          request.toUserId = newPlayerId;
        }
        
        // Add to new player's requests if not already there
        const existingRequest = newPlayerRequests.find(r => r.id === request.id);
        if (!existingRequest) {
          newPlayerRequests.push(request);
        }
      });
    }

    // Migrate user status
    const oldStatus = this._userStatuses.get(oldPlayerId);
    if (oldStatus) {
      this._userStatuses.set(newPlayerId, oldStatus);
    }
  }

  /**
   * Get the current player ID for a username
   * @param userName The username
   * @returns The current player ID, or undefined if not found
   */
  getPlayerIdForUsername(userName: string): string | undefined {
    return this._usernameToPlayerId.get(userName);
  }
}

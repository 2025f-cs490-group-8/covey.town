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
  sendFriendRequest(fromUserId: string, fromUserName: string, toUserId: string, toUserName: string): FriendRequest {
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
}


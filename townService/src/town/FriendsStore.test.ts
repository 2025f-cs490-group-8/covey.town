import FriendsStore from '../lib/FriendsStore';

// Create mock functions that will be assigned to the pool
let mockQuery: jest.Mock;
let mockExecute: jest.Mock;

// Mock the entire mysql2/promise module
jest.mock('mysql2/promise', () => ({
  createPool: jest.fn(() => ({
    query: (...args: any[]) => mockQuery(...args),
    execute: (...args: any[]) => mockExecute(...args),
  })),
}));

describe('FriendsStore', () => {
  let friendsStore: FriendsStore;

  beforeEach(async () => {
    // Initialize mock functions
    mockQuery = jest.fn();
    mockExecute = jest.fn();

    // Mock database responses - return format is [rows, fields]
    mockQuery.mockResolvedValue([[], undefined]);
    mockExecute.mockResolvedValue([{ affectedRows: 1 }, undefined]);

    // Get fresh instance
    friendsStore = FriendsStore.getInstance();

    // Initialize (this loads from DB)
    await friendsStore.init();

    // Clear any data from previous tests
    (friendsStore as any)._friends.clear();
    (friendsStore as any)._friendRequests.clear();
    (friendsStore as any)._userStatuses.clear();
    (friendsStore as any)._sessionToDbUserId.clear();
    (friendsStore as any)._dbUserIdToSession.clear();
    (friendsStore as any)._usernameToPlayerId.clear();
    (friendsStore as any)._blockedUsers.clear();
    (friendsStore as any)._initialized = false;
  });

  describe('Session Registration', () => {
    it('should register a new session with database user ID', () => {
      friendsStore.registerSession('session123', 'db-user-123', 'TestUser');

      expect(friendsStore.getDatabaseUserId('session123')).toBe('db-user-123');
    });

    it('should map between session ID and database user ID', () => {
      friendsStore.registerSession('session-abc', 'db-user-456', 'UserName');

      expect(friendsStore.getDatabaseUserId('session-abc')).toBe('db-user-456');
      expect(friendsStore.getSessionPlayerId('db-user-456')).toBe('session-abc');
    });

    it('should unregister a session correctly', () => {
      friendsStore.registerSession('session-xyz', 'db-user-789', 'TempUser');
      friendsStore.unregisterSession('session-xyz');

      expect(friendsStore.getSessionPlayerId('db-user-789')).toBeUndefined();
    });
  });

  describe('Friend Requests', () => {
    beforeEach(() => {
      friendsStore.registerSession('session1', 'user1', 'Alice');
      friendsStore.registerSession('session2', 'user2', 'Bob');
    });

    it('should send a friend request successfully', async () => {
      const request = await friendsStore.sendFriendRequest('user1', 'Alice', 'user2', 'Bob');

      expect(request).toMatchObject({
        fromUserId: 'user1',
        fromUserName: 'Alice',
        toUserId: 'user2',
        toUserName: 'Bob',
        status: 'pending',
      });
      expect(request.id).toBeDefined();
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO friend_requests'),
        expect.any(Array),
      );
    });

    it('should prevent duplicate friend requests', async () => {
      await friendsStore.sendFriendRequest('user1', 'Alice', 'user2', 'Bob');

      await expect(
        friendsStore.sendFriendRequest('user1', 'Alice', 'user2', 'Bob'),
      ).rejects.toThrow('Already requested');
    });

    it('should prevent sending friend request between blocked users', async () => {
      // Block user2 from user1's side
      friendsStore.blockUser('user1', 'Alice', 'user2', 'Bob');

      await expect(
        friendsStore.sendFriendRequest('user1', 'Alice', 'user2', 'Bob'),
      ).rejects.toThrow('Cannot send friend request to this user');
    });

    it('should retrieve received friend requests', async () => {
      await friendsStore.sendFriendRequest('user1', 'Alice', 'user2', 'Bob');

      const received = friendsStore.getReceivedFriendRequests('user2');
      expect(received).toHaveLength(1);
      expect(received[0].toUserId).toBe('user2');
    });

    it('should retrieve sent friend requests', async () => {
      await friendsStore.sendFriendRequest('user1', 'Alice', 'user2', 'Bob');

      const sent = friendsStore.getSentFriendRequests('user1');
      expect(sent).toHaveLength(1);
      expect(sent[0].fromUserId).toBe('user1');
    });
  });

  describe('Friend Management', () => {
    beforeEach(() => {
      friendsStore.registerSession('session1', 'user1', 'Alice');
      friendsStore.registerSession('session2', 'user2', 'Bob');
    });

    it('should accept a friend request and create friendship', async () => {
      const request = await friendsStore.sendFriendRequest('user1', 'Alice', 'user2', 'Bob');
      const friend = await friendsStore.acceptFriendRequest(request.id, 'user2');

      expect(friend.friendId).toBe('user1');
      expect(friend.friendUserName).toBe('Alice');
      expect(friendsStore.areFriends('user1', 'user2')).toBe(true);
      expect(friendsStore.areFriends('user2', 'user1')).toBe(true);

      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE friend_requests'),
        expect.any(Array),
      );
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO friends'),
        expect.any(Array),
      );
    });

    it('should decline a friend request', async () => {
      const request = await friendsStore.sendFriendRequest('user1', 'Alice', 'user2', 'Bob');
      await friendsStore.declineFriendRequest(request.id, 'user2');

      expect(request.status).toBe('declined');
      expect(mockExecute).toHaveBeenCalledWith(expect.stringContaining('UPDATE friend_requests'), [
        request.id,
      ]);
    });

    it('should remove a friendship from both sides', async () => {
      const request = await friendsStore.sendFriendRequest('user1', 'Alice', 'user2', 'Bob');
      await friendsStore.acceptFriendRequest(request.id, 'user2');

      await friendsStore.removeFriend('user1', 'user2');

      expect(friendsStore.areFriends('user1', 'user2')).toBe(false);
      expect(friendsStore.areFriends('user2', 'user1')).toBe(false);

      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM friends'),
        expect.any(Array),
      );
    });

    it('should retrieve friends list with status', async () => {
      const request = await friendsStore.sendFriendRequest('user1', 'Alice', 'user2', 'Bob');
      await friendsStore.acceptFriendRequest(request.id, 'user2');

      friendsStore.setUserStatus('user2', 'Online');

      const friends = friendsStore.getFriendsWithStatus('user1');
      expect(friends).toHaveLength(1);
      expect(friends[0].friendId).toBe('user2');
      expect(friends[0].friendStatus).toBe('Online');
    });
  });

  describe('User Status', () => {
    beforeEach(() => {
      friendsStore.registerSession('session1', 'user1', 'Alice');
    });

    it('should set and retrieve user status', () => {
      friendsStore.setUserStatus('session1', 'Online');
      expect(friendsStore.getUserStatus('session1')).toBe('Online');

      friendsStore.setUserStatus('session1', 'Busy');
      expect(friendsStore.getUserStatus('session1')).toBe('Busy');
    });

    it('should default to Offline for unknown users', () => {
      expect(friendsStore.getUserStatus('unknown-user')).toBe('Offline');
    });

    it('should update user status', () => {
      friendsStore.setUserStatus('user1', 'Online');
      expect(friendsStore.getUserStatus('user1')).toBe('Online');

      friendsStore.setUserStatus('user1', 'Offline');
      expect(friendsStore.getUserStatus('user1')).toBe('Offline');
    });
  });

  describe('Blocking Features', () => {
    beforeEach(() => {
      friendsStore.registerSession('session1', 'user1', 'Alice');
      friendsStore.registerSession('session2', 'user2', 'Bob');
    });

    it('should block a user successfully', () => {
      const blockRecord = friendsStore.blockUser('user1', 'Alice', 'user2', 'Bob');

      expect(blockRecord).toMatchObject({
        blockerId: 'user1',
        blockerUserName: 'Alice',
        blockedId: 'user2',
        blockedUserName: 'Bob',
      });
      expect(friendsStore.isBlocked('user1', 'user2')).toBe(true);
    });

    it('should prevent duplicate blocks', () => {
      friendsStore.blockUser('user1', 'Alice', 'user2', 'Bob');

      expect(() => friendsStore.blockUser('user1', 'Alice', 'user2', 'Bob')).toThrow(
        'User is already blocked',
      );
    });

    it('should unblock a user', async () => {
      // First become friends
      const request = await friendsStore.sendFriendRequest('user1', 'Alice', 'user2', 'Bob');
      await friendsStore.acceptFriendRequest(request.id, 'user2');

      // Then block
      friendsStore.blockUser('user1', 'Alice', 'user2', 'Bob');
      expect(friendsStore.isBlocked('user1', 'user2')).toBe(true);

      // Then unblock
      const restored = friendsStore.unblockUser('user1', 'user2');
      expect(friendsStore.isBlocked('user1', 'user2')).toBe(false);
      expect(restored).toBeDefined();
      expect(restored?.friendId).toBe('user2');
    });

    it('should check if blocked either way', () => {
      friendsStore.blockUser('user1', 'Alice', 'user2', 'Bob');

      expect(friendsStore.isBlockedEitherWay('user1', 'user2')).toBe(true);
      expect(friendsStore.isBlockedEitherWay('user2', 'user1')).toBe(true);
    });

    it('should get list of blocked users', () => {
      friendsStore.blockUser('user1', 'Alice', 'user2', 'Bob');

      const blocked = friendsStore.getBlockedUsers('user1');
      expect(blocked).toHaveLength(1);
      expect(blocked[0].blockedId).toBe('user2');
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      friendsStore.registerSession('session1', 'user1', 'Alice');
    });

    it('should handle session registration with same database user ID', () => {
      friendsStore.registerSession('session2', 'user1', 'Alice');
      expect(friendsStore.getDatabaseUserId('session2')).toBe('user1');
      expect(friendsStore.getSessionPlayerId('user1')).toBe('session2');
    });

    it('should prevent accepting invalid friend request', async () => {
      await expect(friendsStore.acceptFriendRequest('invalid-id', 'user1')).rejects.toThrow(
        'Not found',
      );
    });

    it('should throw error when declining non-existent request', async () => {
      await expect(friendsStore.declineFriendRequest('invalid-id', 'user1')).rejects.toThrow(
        'Not found',
      );
    });

    it('should throw error when unblocking non-blocked user', () => {
      expect(() => friendsStore.unblockUser('user1', 'user2')).toThrow('User is not blocked');
    });
  });
});

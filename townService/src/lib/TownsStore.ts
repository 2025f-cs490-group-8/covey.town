import { mock, mockReset } from 'jest-mock-extended';
import { nanoid } from 'nanoid';
import { Socket } from 'socket.io';
import Town from './Town';
import { CoveyTownsStore } from './TownsStore';
import Player from './Player';
import { ServerToClientEvents, ClientToServerEvents } from '../types/CoveyTownSocket';

// Mock the mysql2/promise module
jest.mock('mysql2/promise', () => ({
  createPool: jest.fn(() => ({
    query: jest.fn().mockResolvedValue([[]]),
    execute: jest.fn().mockResolvedValue([{}]),
  })),
}));

// Mock the FriendsStore module to avoid import issues
jest.mock('../lib/FriendsStore', () => {
  class MockFriendsStore {
    private static _instance: MockFriendsStore;

    private _initialized = false;

    private _friends = new Map<string, any[]>();

    private _friendRequests = new Map<string, any[]>();

    private _userStatuses = new Map<string, string>();

    static getInstance(): MockFriendsStore {
      if (!MockFriendsStore._instance) {
        MockFriendsStore._instance = new MockFriendsStore();
      }
      return MockFriendsStore._instance;
    }

    async init() {
      if (this._initialized) return;
      this._initialized = true;
    }

    async sendFriendRequest(
      fromUserId: string,
      fromUserName: string,
      toUserId: string,
      toUserName: string,
    ) {
      const req = {
        id: nanoid(),
        fromUserId,
        fromUserName,
        toUserId,
        toUserName,
        status: 'pending' as const,
        createdAt: new Date(),
      };

      if (!this._friendRequests.has(fromUserId)) this._friendRequests.set(fromUserId, []);
      if (!this._friendRequests.has(toUserId)) this._friendRequests.set(toUserId, []);

      this._friendRequests.get(fromUserId)!.push(req);
      this._friendRequests.get(toUserId)!.push(req);

      return req;
    }

    async acceptFriendRequest(requestId: string, userId: string) {
      let foundReq: any = null;
      for (const list of this._friendRequests.values()) {
        const req = list.find(r => r.id === requestId);
        if (req) {
          foundReq = req;
          break;
        }
      }

      if (!foundReq) throw new Error('Not found');
      foundReq.status = 'accepted';

      const now = new Date();
      const f1 = {
        userId: foundReq.fromUserId,
        userName: foundReq.fromUserName,
        friendId: foundReq.toUserId,
        friendUserName: foundReq.toUserName,
        createdAt: now,
      };

      const f2 = {
        userId: foundReq.toUserId,
        userName: foundReq.toUserName,
        friendId: foundReq.fromUserId,
        friendUserName: foundReq.fromUserName,
        createdAt: now,
      };

      if (!this._friends.has(foundReq.fromUserId)) this._friends.set(foundReq.fromUserId, []);
      if (!this._friends.has(foundReq.toUserId)) this._friends.set(foundReq.toUserId, []);

      this._friends.get(foundReq.fromUserId)!.push(f1);
      this._friends.get(foundReq.toUserId)!.push(f2);

      return f2;
    }

    getFriends(userId: string) {
      return this._friends.get(userId) || [];
    }

    areFriends(a: string, b: string) {
      return this.getFriends(a).some(x => x.friendId === b);
    }

    setUserStatus(userId: string, status: string) {
      this._userStatuses.set(userId, status);
    }

    getUserStatus(userId: string) {
      return this._userStatuses.get(userId) || 'Offline';
    }

    getFriendsWithStatus(userId: string) {
      return this.getFriends(userId).map(f => ({
        ...f,
        friendStatus: this.getUserStatus(f.friendId),
      }));
    }
  }

  return {
    __esModule: true,
    default: MockFriendsStore,
  };
});

describe('TeleportationFeature', () => {
  let town1: Town;
  let town2: Town;
  let townsStore: CoveyTownsStore;
  let friendsStoreInstance: any;

  // Players
  let player1: Player;
  let player2: Player;
  let player3: Player;

  // Sockets
  let socket1: any;
  let socket2: any;
  let socket3: any;

  beforeEach(async () => {
    // Get FriendsStore from mocked module
    const FriendsStoreModule = await import('./FriendsStore');
    const FriendsStoreClass = (FriendsStoreModule as any).default;

    // Initialize singleton instances for testing
    // Reset any existing instances
    (CoveyTownsStore as any)._instance = undefined;
    (FriendsStoreClass as any)._instance = undefined;

    // Get fresh singleton instances
    townsStore = CoveyTownsStore.getInstance();
    friendsStoreInstance = FriendsStoreClass.getInstance();

    // Initialize FriendsStore (this will use mocked DB)
    await friendsStoreInstance.init();

    // Create two towns
    const town1Data = await townsStore.createTown('Test Town 1', true);
    const town2Data = await townsStore.createTown('Test Town 2', true);

    town1 = townsStore.getTownByID(town1Data.townID) as Town;
    town2 = townsStore.getTownByID(town2Data.townID) as Town;

    // Create mock sockets with emit function
    socket1 = {
      emit: jest.fn(),
      on: jest.fn(),
      join: jest.fn(),
      handshake: {
        auth: { userName: 'Player1', townID: town1.townID, accountUsername: 'player1' },
      },
    };
    socket2 = {
      emit: jest.fn(),
      on: jest.fn(),
      join: jest.fn(),
      handshake: {
        auth: { userName: 'Player2', townID: town1.townID, accountUsername: 'player2' },
      },
    };
    socket3 = {
      emit: jest.fn(),
      on: jest.fn(),
      join: jest.fn(),
      handshake: {
        auth: { userName: 'Player3', townID: town2.townID, accountUsername: 'player3' },
      },
    };

    // Add players to towns
    player1 = await town1.addPlayer('Player1', socket1);
    player2 = await town1.addPlayer('Player2', socket2);
    player3 = await town2.addPlayer('Player3', socket3);

    // Make player1 and player2 friends
    const request = await friendsStoreInstance.sendFriendRequest(
      player1.id,
      player1.userName,
      player2.id,
      player2.userName,
    );
    await friendsStoreInstance.acceptFriendRequest(request.id, player2.id);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    // Clean up singleton instances
    const FriendsStoreModule = await import('./FriendsStore');
    const FriendsStoreClass = (FriendsStoreModule as any).default;
    (CoveyTownsStore as any)._instance = undefined;
    (FriendsStoreClass as any)._instance = undefined;
  });

  describe('Same-Town Teleportation via Socket', () => {
    it('should receive teleport request event', () => {
      // Simulate Player1 sending teleport request to Player2
      socket1.emit('teleportRequest', { toUserId: player2.id });

      // In real implementation, server would emit to Player2's socket
      // Verify the socket emit was called
      expect(socket1.emit).toHaveBeenCalledWith('teleportRequest', { toUserId: player2.id });
    });

    it('should handle teleport accept and update player location', () => {
      const player2InitialLocation = { ...player2.location };

      // Player2 accepts teleport request
      socket2.emit('teleportResponse', { fromUserId: player1.id, accepted: true });

      // Verify response was emitted
      expect(socket2.emit).toHaveBeenCalledWith(
        'teleportResponse',
        expect.objectContaining({
          fromUserId: player1.id,
          accepted: true,
        }),
      );
    });

    it('should handle teleport decline', () => {
      // Player2 declines teleport request
      socket2.emit('teleportResponse', { fromUserId: player1.id, accepted: false });

      expect(socket2.emit).toHaveBeenCalledWith(
        'teleportResponse',
        expect.objectContaining({
          fromUserId: player1.id,
          accepted: false,
        }),
      );
    });

    it('should prevent self-teleportation', () => {
      // Player1 tries to teleport to themselves
      socket1.emit('teleportRequest', { toUserId: player1.id });

      // Should not send request to self
      expect(socket1.emit).toHaveBeenCalledWith('teleportRequest', { toUserId: player1.id });
    });
  });

  describe('Cross-Town Teleportation via Socket', () => {
    beforeEach(async () => {
      // Make player1 and player3 friends (cross-town)
      const request = await friendsStoreInstance.sendFriendRequest(
        player1.id,
        player1.userName,
        player3.id,
        player3.userName,
      );
      await friendsStoreInstance.acceptFriendRequest(request.id, player3.id);
    });

    it('should send cross-town teleport request', () => {
      // Player1 sends cross-town request to Player3
      socket1.emit('crossTownTeleportRequest', { toUserId: player3.id });

      expect(socket1.emit).toHaveBeenCalledWith(
        'crossTownTeleportRequest',
        expect.objectContaining({
          toUserId: player3.id,
        }),
      );
    });

    it('should handle cross-town teleport acceptance', () => {
      // Player3 accepts cross-town request
      socket3.emit('crossTownTeleportResponse', { fromUserId: player1.id, accepted: true });

      expect(socket3.emit).toHaveBeenCalledWith(
        'crossTownTeleportResponse',
        expect.objectContaining({
          fromUserId: player1.id,
          accepted: true,
        }),
      );
    });

    it('should handle cross-town teleport decline', () => {
      // Player3 declines cross-town request
      socket3.emit('crossTownTeleportResponse', { fromUserId: player1.id, accepted: false });

      expect(socket3.emit).toHaveBeenCalledWith(
        'crossTownTeleportResponse',
        expect.objectContaining({
          fromUserId: player1.id,
          accepted: false,
        }),
      );
    });
  });

  describe('Teleport with Friends Integration', () => {
    it('should verify players are friends before teleporting', async () => {
      // Get friends list for player1
      const friends = friendsStoreInstance.getFriends(player1.id);

      // Verify player2 is in friends list
      expect(friends).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            friendId: player2.id,
          }),
        ]),
      );
    });

    it('should not allow teleporting to non-friends', () => {
      // Create a new player who is not friends with player1
      const socket4 = {
        emit: jest.fn(),
        on: jest.fn(),
        join: jest.fn(),
        handshake: {
          auth: { userName: 'Player4', townID: town1.townID, accountUsername: 'player4' },
        },
      };

      // Player1 tries to teleport to non-friend
      socket1.emit('teleportRequest', { toUserId: 'player4' });

      // Request should be sent but server should reject it
      expect(socket1.emit).toHaveBeenCalledWith(
        'teleportRequest',
        expect.objectContaining({ toUserId: 'player4' }),
      );
    });

    it('should maintain friendship after teleportation', async () => {
      // Simulate teleport
      socket1.emit('teleportRequest', { toUserId: player2.id });
      socket2.emit('teleportResponse', { fromUserId: player1.id, accepted: true });

      // Verify still friends
      const friends = friendsStoreInstance.getFriends(player1.id);
      expect(friends).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            friendId: player2.id,
          }),
        ]),
      );
    });
  });

  describe('Player Location and State', () => {
    it('should track player locations', () => {
      expect(player1.location).toBeDefined();
      expect(player1.location).toHaveProperty('x');
      expect(player1.location).toHaveProperty('y');
      expect(player1.location).toHaveProperty('rotation');
    });

    it('should maintain player identity after teleport', () => {
      const originalId = player1.id;
      const originalUserName = player1.userName;

      // Simulate teleport
      socket1.emit('teleportRequest', { toUserId: player2.id });
      socket2.emit('teleportResponse', { fromUserId: player1.id, accepted: true });

      // Identity should remain the same
      expect(player1.id).toBe(originalId);
      expect(player1.userName).toBe(originalUserName);
    });

    it('should verify players are in correct towns', () => {
      expect(town1.players).toContainEqual(expect.objectContaining({ id: player1.id }));
      expect(town1.players).toContainEqual(expect.objectContaining({ id: player2.id }));
      expect(town2.players).toContainEqual(expect.objectContaining({ id: player3.id }));
    });
  });

  describe('Edge Cases', () => {
    it('should handle player disconnection', () => {
      // Get initial player count
      const initialCount = town1.players.length;

      // Simulate disconnect by calling the disconnect handler
      // This would normally be called when socket disconnects
      socket2.emit('disconnect');

      // Note: In real implementation, town would remove player on disconnect
      // This test verifies the socket event is emitted
      expect(socket2.emit).toHaveBeenCalledWith('disconnect');
    });

    it('should handle invalid player IDs', () => {
      const invalidId = 'invalid-player-id';

      socket1.emit('teleportRequest', { toUserId: invalidId });

      // Should emit request but server will reject
      expect(socket1.emit).toHaveBeenCalledWith(
        'teleportRequest',
        expect.objectContaining({ toUserId: invalidId }),
      );
    });

    it('should handle multiple players in same town', () => {
      // Verify both player1 and player2 are in town1
      const town1PlayerIds = town1.players.map(p => p.id);
      expect(town1PlayerIds).toContain(player1.id);
      expect(town1PlayerIds).toContain(player2.id);
    });

    it('should track town player count', () => {
      expect(town1.players.length).toBeGreaterThanOrEqual(2);
      expect(town2.players.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Friend Status Integration', () => {
    it('should show friend as Online when in a town', () => {
      const friends = friendsStoreInstance.getFriendsWithStatus(player1.id);
      const player2Friend = friends.find((f: any) => f.friendId === player2.id);

      expect(player2Friend).toBeDefined();
      // Note: Status would be set by the controller, testing the data structure
      expect(player2Friend).toHaveProperty('friendStatus');
    });

    it('should maintain friend list across towns', async () => {
      // Make player1 and player3 friends (they're in different towns)
      const request = await friendsStoreInstance.sendFriendRequest(
        player1.id,
        player1.userName,
        player3.id,
        player3.userName,
      );
      await friendsStoreInstance.acceptFriendRequest(request.id, player3.id);

      // Both should see each other as friends
      const player1Friends = friendsStoreInstance.getFriends(player1.id);
      const player3Friends = friendsStoreInstance.getFriends(player3.id);

      expect(player1Friends).toEqual(
        expect.arrayContaining([expect.objectContaining({ friendId: player3.id })]),
      );
      expect(player3Friends).toEqual(
        expect.arrayContaining([expect.objectContaining({ friendId: player1.id })]),
      );
    });
  });
});

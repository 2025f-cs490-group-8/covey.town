import { nanoid } from 'nanoid';
import { createPool } from 'mysql2/promise';

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

const pool = createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

export default class FriendsStore {
  private static _instance: FriendsStore;

  private _initialized = false;

  private _friends = new Map<string, Friend[]>();

  private _friendRequests = new Map<string, FriendRequest[]>();

  private _userStatuses = new Map<string, UserStatus>();

  private _usernameToPlayerId = new Map<string, string>();

  // NEW: Maps session player IDs to database user IDs
  private _sessionToDbUserId = new Map<string, string>();

  // NEW: Maps database user IDs to current session player IDs
  private _dbUserIdToSession = new Map<string, string>();

  /** Singleton */
  static getInstance(): FriendsStore {
    if (!FriendsStore._instance) {
      FriendsStore._instance = new FriendsStore();
    }
    return FriendsStore._instance;
  }

  /** MUST BE CALLED BEFORE SERVER START */
  async init() {
    if (this._initialized) return;
    await this._loadFromDB();
    this._initialized = true;
  }

  private async _loadFromDB() {
    // Friend requests
    const [reqRows] = await pool.query(`SELECT * FROM friend_requests ORDER BY createdAt ASC`);

    for (const r of reqRows as any[]) {
      const req: FriendRequest = {
        id: r.id,
        fromUserId: r.fromUserId,
        fromUserName: r.fromUserName,
        toUserId: r.toUserId,
        toUserName: r.toUserName,
        status: r.status,
        createdAt: r.createdAt,
      };

      if (!this._friendRequests.has(r.fromUserId)) this._friendRequests.set(r.fromUserId, []);
      if (!this._friendRequests.has(r.toUserId)) this._friendRequests.set(r.toUserId, []);

      this._friendRequests.get(r.fromUserId)!.push(req);
      this._friendRequests.get(r.toUserId)!.push(req);
    }

    // Friends
    const [friendRows] = await pool.query(`SELECT * FROM friends`);

    for (const f of friendRows as any[]) {
      const fr: Friend = {
        userId: f.userId,
        userName: f.userName,
        friendId: f.friendId,
        friendUserName: f.friendUserName,
        createdAt: f.createdAt,
      };

      if (!this._friends.has(f.userId)) this._friends.set(f.userId, []);
      this._friends.get(f.userId)!.push(fr);
    }

    console.log('Friends + Requests loaded from DB');
  }

  /**
   * Register a session player ID with their permanent database user ID
   */
  registerSession(sessionPlayerId: string, databaseUserId: string, username: string) {
    this._sessionToDbUserId.set(sessionPlayerId, databaseUserId);
    this._dbUserIdToSession.set(databaseUserId, sessionPlayerId);
    this._usernameToPlayerId.set(username, sessionPlayerId);

    console.log(
      `Registered session: ${sessionPlayerId} -> DB User: ${databaseUserId} (${username})`,
    );
  }

  /**
   * Get the database user ID for a session player ID
   */
  getDatabaseUserId(sessionPlayerId: string): string {
    return this._sessionToDbUserId.get(sessionPlayerId) || sessionPlayerId;
  }

  /**
   * Get the session player ID for a database user ID
   */
  getSessionPlayerId(databaseUserId: string): string | undefined {
    return this._dbUserIdToSession.get(databaseUserId);
  }

  /**
   * Unregister a session (when player disconnects)
   */
  unregisterSession(sessionPlayerId: string) {
    const dbUserId = this._sessionToDbUserId.get(sessionPlayerId);
    if (dbUserId) {
      this._dbUserIdToSession.delete(dbUserId);
    }
    this._sessionToDbUserId.delete(sessionPlayerId);
  }

  // ---------------------------------------------
  // SEND FRIEND REQUEST
  // ---------------------------------------------
  async sendFriendRequest(
    fromUserId: string,
    fromUserName: string,
    toUserId: string,
    toUserName: string,
  ): Promise<FriendRequest> {
    if (this.areFriends(fromUserId, toUserId)) throw new Error('Already friends');

    const existing = this._getPendingRequest(fromUserId, toUserId);
    if (existing) throw new Error('Already requested');

    const req: FriendRequest = {
      id: nanoid(),
      fromUserId,
      fromUserName,
      toUserId,
      toUserName,
      status: 'pending',
      createdAt: new Date(),
    };

    await pool.execute(
      `INSERT INTO friend_requests 
      (id, fromUserId, fromUserName, toUserId, toUserName, status, createdAt)
      VALUES (?, ?, ?, ?, ?, 'pending', NOW())`,
      [req.id, req.fromUserId, req.fromUserName, req.toUserId, req.toUserName],
    );

    // Memory
    if (!this._friendRequests.has(fromUserId)) this._friendRequests.set(fromUserId, []);
    if (!this._friendRequests.has(toUserId)) this._friendRequests.set(toUserId, []);

    this._friendRequests.get(fromUserId)!.push(req);
    this._friendRequests.get(toUserId)!.push(req);

    return req;
  }

  async acceptFriendRequest(requestId: string, userId: string): Promise<Friend> {
    const req = this._findRequest(requestId);
    if (!req) throw new Error('Not found');
    if (req.toUserId !== userId) throw new Error('Not recipient');

    req.status = 'accepted';

    await pool.execute(`UPDATE friend_requests SET status='accepted' WHERE id=?`, [requestId]);

    const now = new Date();

    // SAVE FRIEND BOTH DIRECTIONS
    await pool.execute(
      `INSERT INTO friends (userId, userName, friendId, friendUserName, createdAt)
       VALUES 
       (?, ?, ?, ?, NOW()),
       (?, ?, ?, ?, NOW())`,
      [
        req.fromUserId,
        req.fromUserName,
        req.toUserId,
        req.toUserName,
        req.toUserId,
        req.toUserName,
        req.fromUserId,
        req.fromUserName,
      ],
    );

    // Update memory
    const f1: Friend = {
      userId: req.fromUserId,
      userName: req.fromUserName,
      friendId: req.toUserId,
      friendUserName: req.toUserName,
      createdAt: now,
    };

    const f2: Friend = {
      userId: req.toUserId,
      userName: req.toUserName,
      friendId: req.fromUserId,
      friendUserName: req.fromUserName,
      createdAt: now,
    };

    if (!this._friends.has(req.fromUserId)) this._friends.set(req.fromUserId, []);
    if (!this._friends.has(req.toUserId)) this._friends.set(req.toUserId, []);

    this._friends.get(req.fromUserId)!.push(f1);
    this._friends.get(req.toUserId)!.push(f2);

    return f2;
  }

  async declineFriendRequest(requestId: string, userId: string): Promise<void> {
    const req = this._findRequest(requestId);
    if (!req) throw new Error('Not found');
    if (req.toUserId !== userId) throw new Error('Not recipient');

    req.status = 'declined';
    await pool.execute(`UPDATE friend_requests SET status='declined' WHERE id=?`, [requestId]);
  }

  async removeFriend(userId: string, friendId: string): Promise<void> {
    await pool.execute(
      `DELETE FROM friends WHERE 
       (userId = ? AND friendId = ?) OR 
       (userId = ? AND friendId = ?)`,
      [userId, friendId, friendId, userId],
    );

    // Update memory
    const userFriends = this._friends.get(userId) || [];
    this._friends.set(
      userId,
      userFriends.filter(f => f.friendId !== friendId),
    );

    const friendFriends = this._friends.get(friendId) || [];
    this._friends.set(
      friendId,
      friendFriends.filter(f => f.friendId !== userId),
    );
  }

  // ---------------------------------------------
  // BASIC GETTERS (now use database IDs internally)
  // ---------------------------------------------
  getFriendRequests(sessionOrDbId: string) {
    const dbId = this.getDatabaseUserId(sessionOrDbId);
    return this._friendRequests.get(dbId) || [];
  }

  getReceivedFriendRequests(sessionOrDbId: string) {
    const dbId = this.getDatabaseUserId(sessionOrDbId);
    return this.getFriendRequests(dbId).filter(r => r.toUserId === dbId && r.status === 'pending');
  }

  getSentFriendRequests(sessionOrDbId: string) {
    const dbId = this.getDatabaseUserId(sessionOrDbId);
    return this.getFriendRequests(dbId).filter(
      r => r.fromUserId === dbId && r.status === 'pending',
    );
  }

  getFriends(sessionOrDbId: string) {
    const dbId = this.getDatabaseUserId(sessionOrDbId);
    return this._friends.get(dbId) || [];
  }

  areFriends(a: string, b: string) {
    const dbIdA = this.getDatabaseUserId(a);
    const dbIdB = this.getDatabaseUserId(b);
    return this.getFriends(dbIdA).some(x => x.friendId === dbIdB);
  }

  private _findRequest(id: string) {
    for (const list of this._friendRequests.values()) {
      const req = list.find(r => r.id === id);
      if (req) return req;
    }
    return undefined;
  }

  private _getPendingRequest(a: string, b: string) {
    return this.getFriendRequests(a).find(
      r =>
        r.status === 'pending' &&
        ((r.fromUserId === a && r.toUserId === b) || (r.fromUserId === b && r.toUserId === a)),
    );
  }

  // ---------------------------------------------
  // STATUS TRACKING (now uses database IDs)
  // ---------------------------------------------
  setUserStatus(sessionOrDbId: string, status: UserStatus) {
    const dbId = this.getDatabaseUserId(sessionOrDbId);
    this._userStatuses.set(dbId, status);
  }

  getUserStatus(sessionOrDbId: string): UserStatus {
    const dbId = this.getDatabaseUserId(sessionOrDbId);
    return this._userStatuses.get(dbId) || 'Offline';
  }

  getFriendsWithStatus(sessionOrDbId: string) {
    const dbId = this.getDatabaseUserId(sessionOrDbId);
    return this.getFriends(dbId).map(f => ({
      ...f,
      friendStatus: this.getUserStatus(f.friendId),
    }));
  }

  // ---------------------------------------------
  // MIGRATION SUPPORT (deprecated but kept for compatibility)
  // ---------------------------------------------
  migratePlayerFriends(oldId: string, newId: string, username: string) {
    this._usernameToPlayerId.set(username, newId);

    if (oldId === newId) return;

    const oldList = this._friends.get(oldId) || [];
    const newList = this._friends.get(newId) || [];

    for (const f of oldList) {
      if (!newList.some(x => x.friendId === f.friendId)) {
        newList.push({ ...f, userId: newId });
      }
    }

    this._friends.set(newId, newList);

    const oldStatus = this._userStatuses.get(oldId);
    if (oldStatus) this._userStatuses.set(newId, oldStatus);
  }

  getPlayerIdForUsername(name: string) {
    return this._usernameToPlayerId.get(name);
  }
}

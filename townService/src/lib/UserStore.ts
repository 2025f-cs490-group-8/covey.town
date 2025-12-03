import { nanoid } from 'nanoid';
import { connection } from '../api/SqlCalls';

export interface User {
  id: string;
  email: string;
  name: string;
  googleId?: string;
  createdAt: Date;
  lastLoginAt: Date;
}

/**
 * Singleton store for managing users
 * Uses in-memory storage (in a real app, this would be a database)
 */
export default class UserStore {
  private static _instance: UserStore;

  // Map from user ID to user data
  private _users: Map<string, User> = new Map();

  // Map from email to user ID (for quick lookup)
  private _emailToUserId: Map<string, string> = new Map();

  // Map from Google ID to user ID
  private _googleIdToUserId: Map<string, string> = new Map();

  // Map from username to database user ID
  private _usernameToDbId: Map<string, string> = new Map();

  static getInstance(): UserStore {
    if (UserStore._instance === undefined) {
      UserStore._instance = new UserStore();
    }
    return UserStore._instance;
  }

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Get a user's permanent ID from database by username
   */
  async getUserIdByUsername(username: string): Promise<string | null> {
    // Check cache first
    const cachedId = this._usernameToDbId.get(username);
    if (cachedId) {
      return cachedId;
    }

    try {
      const [rows] = await connection.execute<any[]>('SELECT id FROM Users WHERE userName = ?', [
        username,
      ]);

      if (rows && rows.length > 0) {
        const userId = rows[0].id.toString();
        // Cache it
        this._usernameToDbId.set(username, userId);
        return userId;
      }
      return null;
    } catch (err) {
      console.error('Error getting user ID by username:', err);
      return null;
    }
  }

  /**
   * Get a user's username by database ID
   */
  async getUsernameById(userId: string): Promise<string | null> {
    try {
      const [rows] = await connection.execute<any[]>('SELECT userName FROM Users WHERE id = ?', [
        userId,
      ]);

      if (rows && rows.length > 0) {
        return rows[0].userName;
      }
      return null;
    } catch (err) {
      console.error('Error getting username by ID:', err);
      return null;
    }
  }

  /**
   * Find or create a user by Google ID
   */
  findOrCreateByGoogleId(googleId: string, email: string, name: string): User {
    // Check if user exists by Google ID
    const existingUserId = this._googleIdToUserId.get(googleId);
    if (existingUserId) {
      const user = this._users.get(existingUserId);
      if (user) {
        // Update last login time
        user.lastLoginAt = new Date();
        return user;
      }
    }

    // Check if user exists by email (in case they used email/password before)
    const existingUserIdByEmail = this._emailToUserId.get(email);
    if (existingUserIdByEmail) {
      const user = this._users.get(existingUserIdByEmail);
      if (user) {
        // Link Google ID to existing user
        user.googleId = googleId;
        this._googleIdToUserId.set(googleId, user.id);
        user.lastLoginAt = new Date();
        return user;
      }
    }

    // Create new user
    const newUser: User = {
      id: nanoid(),
      email,
      name,
      googleId,
      createdAt: new Date(),
      lastLoginAt: new Date(),
    };

    this._users.set(newUser.id, newUser);
    this._emailToUserId.set(email, newUser.id);
    this._googleIdToUserId.set(googleId, newUser.id);

    return newUser;
  }

  /**
   * Get user by ID
   */
  getUserById(userId: string): User | undefined {
    return this._users.get(userId);
  }

  /**
   * Get user by email
   */
  getUserByEmail(email: string): User | undefined {
    const userId = this._emailToUserId.get(email);
    if (userId) {
      return this._users.get(userId);
    }
    return undefined;
  }

  /**
   * Get user by Google ID
   */
  getUserByGoogleId(googleId: string): User | undefined {
    const userId = this._googleIdToUserId.get(googleId);
    if (userId) {
      return this._users.get(userId);
    }
    return undefined;
  }
}

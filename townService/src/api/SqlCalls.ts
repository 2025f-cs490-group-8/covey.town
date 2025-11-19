import { createPool } from 'mysql2/promise';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Get current file directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '../../.env') });

async function constructBCRYPTHash(password: string) {
  const saltRounds = 10;
  const hash = await bcrypt.hash(password, saltRounds);
  return hash;
}

/**
 * Here I'm asserting that the port number will exist, this should be true but TS doesn't trust it.
 * It should only fail if .env isn't properly configured
 */
export const connection = createPool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT!, 10),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

process.on('SIGTERM', () => {
  console.log('Closing database connection pool...');
  connection.end();
});

/**
 * In case we want to split up this class into different files.
 */
export default connection;

export class QuerySQL {
  async getUser(uid: number) {
    try {
      const query = 'SELECT userName, email, status FROM Users WHERE id = ?';
      const [row] = await connection.execute<any[]>(query, [uid]);
      return row[0];
    } catch (error) {
      console.error('Error fetching user:', error);
      throw error;
    }
  }

  protected async getUserHash(uid: number) {
    try {
      const query = 'SELECT hash FROM Users WHERE id = ?';
      const [row] = await connection.execute<any[]>(query, [uid]);
      if (!row || row.length === 0) {
        return null;
      }
      return row[0];
    } catch (error) {
      console.error('Error fetching hash:', error);
      throw error;
    }
  }

  async passwordChallenge(userPassword: string, uid: number) {
    const hashRequest = await this.getUserHash(uid);
     if (!hashRequest) {
    return false;
    }
    const storedHash = hashRequest.hash;
    const match = await bcrypt.compare(userPassword, storedHash);
    return match;
  }

  async setUserStatus(uid: number, status: string) {
    try {
      const query = 'UPDATE Users SET status = ? WHERE id = ?';
      await connection.execute(query, [status, uid]);
    } catch (error) {
      console.error('Error updating user status:', error);
      throw error;
    }
  }

  /**
   * ID is taken care of through mysql and status has an offline default value.
   */
  async constructNewUser(userName: string, email: string, userPassword: string) {
    try {
      const hash = await constructBCRYPTHash(userPassword);
      const query = 'INSERT INTO Users (userName, email, hash) VALUES (?, ?, ?)';
      await connection.execute(query, [userName, email, hash]);
    } catch (error) {
      console.error('Error constructing user:', error);
      throw error;
    }
  }

  /**
   * Default pending status.
   */
  async constructNewFriendRequest(sender: number, receiver: number) {
    try {
      const query = 'INSERT INTO FriendRequests (sender, receiver) VALUES (?, ?)';
      await connection.execute(query, [sender, receiver]);
    } catch (error) {
      console.error('Error constructing friend request:', error);
      throw error;
    }
  }

  /**
   * There is probably a better solution to this that involves restructuring the database, as is returns id of friends.
   */
  async getFriendsList(uid: number) {
    try {
      const query =
        'SELECT sender, receiver FROM FriendRequests WHERE (sender = ? OR receiver = ?) AND status = ?';
      const [row] = await connection.execute<any[]>(query, [uid, uid, 'accepted']);
      const friendIDs = new Set<number>();
      for (const i of row) {
        friendIDs.add(i.sender);
        friendIDs.add(i.receiver);
      }
      friendIDs.delete(uid);
      return friendIDs;
    } catch (error) {
      console.error('Error fetching friends list:', error);
      throw error;
    }
  }

  async getFriendRequest(sender: number, receiver: number) {
    try {
      const query =
        'SELECT requestID, status, timeSent FROM FriendRequests WHERE sender = ? AND receiver = ?';
      const [row] = await connection.execute<any[]>(query, [sender, receiver]);
      return row[0];
    } catch (error) {
      console.error('Error fetching friend request:', error);
      throw error;
    }
  }

  async acceptFriendRequest(sender: number, receiver: number) {
    const request = await this.getFriendRequest(sender, receiver);
    const rID = request.requestID;
    try {
      const query = 'UPDATE FriendRequests SET status = ? WHERE requestID = ?';
      await connection.execute(query, ['accepted', rID]);
    } catch (error) {
      console.error('Error updating request status:', error);
      throw error;
    }
  }

  /**
   * This will directly delete the request from our database, can be used to unadd someone, if a user wishes to block a friend, call
   * blockUser() instead. Also implicitly deletes friend relation so it can be used to remove friends.
   */
  async declineFriendRequest(sender: number, receiver: number) {
    const request = await this.getFriendRequest(sender, receiver);
    const rID = request.requestID;
    try {
      const query = 'DELETE FROM FriendRequests WHERE requestID = ?';
      await connection.execute(query, [rID]);
    } catch (error) {
      console.error('Error declining request:', error);
      throw error;
    }
  }

  /**
   * If a user chooses to block someone during a friendrequest prompt only call declineFriendRequest() first then this or if they
   * wish to block them in general call declineFriendRequest first.
   */
  async blockUser(blocker: number, blocked: number) {
    try {
      const query = 'INSERT INTO BlockedUsers (blocker, blocked) VALUES (?, ?)';
      await connection.execute(query, [blocker, blocked]);
    } catch (error) {
      console.error('Error blocking user:', error);
      throw error;
    }
  }

  async getBlockedList(blocker: number) {
    try {
      const query = 'SELECT * FROM BlockedUsers WHERE blocker = ?';
      const [row] = await connection.execute<any[]>(query, [blocker]);
      return row;
    } catch (error) {
      console.error('Error fetching blocked list:', error);
      throw error;
    }
  }

  /**
   * Deletes blocked relationship from table.
   */
  async unblockUser(blocker: number, blocked: number) {
    try {
      const query = 'DELETE FROM BlockedUsers WHERE blocker = ? AND blocked = ?';
      await connection.execute(query, [blocker, blocked]);
    } catch (error) {
      console.error('Error unblocking user:', error);
      throw error;
    }
  }
}

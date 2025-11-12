
import { createPool } from 'mysql2/promise'; 
import * as bcrypt from 'bcrypt';

function constructBCRYPTHash(password: string) {
    const salt = 10;
    bcrypt.hash(password, salt, (err: Error | undefined, hash: string) => {
        if (err) {
            console.error('Error hashing password:', err);
            return;
        }
        return hash;
    });
}

export const connection = createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'admin',
    password: process.env.DB_PASSWORD || 'epicgamer12', 
    database: process.env.DB_NAME || 'COVEYTOWN',
});


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
            return row[0];
        } catch (error) {
            console.error('Error fetching hash:', error);
            throw error;
        } 
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
     * id is taken care of through mysql and status has on offline default value.
     */
    async constructNewUser(userName: string, email: string, userPassword: string) {
        try {
            const hash = constructBCRYPTHash(userPassword)
            const query = 'INSERT INTO Users (userName, email, hash) VALUES (?, ?, ?)'; 
            await connection.execute(query, [userName, email, hash]);
        } catch (error) {
            console.error('Error constructing user:', error);
            throw error;
        } 
    }
    /**
     * default pending status
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
     * There is probably a better solution to this that involves restructuring the database
     */
    async getFriendsList(uid: number){
        try {
            const query = 'SELECT sender, receiver FROM FriendRequests WHERE (sender = ? OR receiver = ?) AND status = ?'; 
            const [row] = await connection.execute<any[]>(query, [uid, uid, 'accepted']);
            const friendIDs = new Set<number>()
            for (const i of row){
                friendIDs.add(i.sender);
                friendIDs.add(i.receiver);
            }
            return friendIDs;
        } catch (error) {
            console.error('Error fetching friends list:', error);
            throw error;
        }
    }
    async getFriendRequest(sender: number, receiver: number){
        try {
            const query = 'SELECT requestID, status, timeSent FROM FriendRequests WHERE sender = ? AND receiver = ?';
            const [row] = await connection.execute<any[]>(query, [sender, receiver]);
            return row[0];
        } catch (error) {
            console.error('Error fetching friend request:', error);
            throw error;
        }
    }
    async acceptFriendRequest(sender: number, receiver: number){
        const request = await this.getFriendRequest(sender, receiver);
        const rID = request.requestID
        try {
            const query = 'UPDATE FriendRequests SET status = ? WHERE requestID = ?'; 
            await connection.execute(query, ['accepted', rID]);
        } catch (error) {
            console.error('Error updating request status:', error);
            throw error;
        }
    }
    /**
     * this will directly delete the request from our database, can be used to unadd someone, if a user wishes to block a friend, call
     * blockUser() instead.
     */
    async declineFriendRequest(requestID: number){
        return;
    }
    /**
     * if a user chooses to block someone during a friendrequest prompt only call blockuser it declines and deletes the request for you
     */
    async blockUser(){
        return;
    }
    /**
     * deletes blocked relationship from table
     */
    async unblockUser(){
        return;
    }
}

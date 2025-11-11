
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


export class UserRepository {
    async getUser(uid: number) {
        try {
            const query = 'SELECT userName, email, status FROM Users WHERE id = ' + uid; 
            const row = await connection.execute(query);
            return row;
        } catch (error) {
            console.error('Error fetching user:', error);
            throw error;
        } finally {
            await connection.end();
        }
    }

    protected async getUserHash(uid: number) {
        try {
            const query = 'SELECT hash FROM Users WHERE id = ' + uid; 
            const row = await connection.execute(query);
            return row;
        } catch (error) {
            console.error('Error fetching hash:', error);
            throw error;
        } finally {
            await connection.end();
        }
    }

    async setUserStatus(uid: number, status: string) {
        try {
            const query = 'UPDATE Users SET status = ' + status + ' WHERE id = ' + uid; 
            await connection.execute(query);
        } catch (error) {
            console.error('Error updating user status:', error);
            throw error;
        } finally {
            await connection.end();
        }
    }
    /**
     * id is taken care of through mysql and status has on offline default value.
     */
    async constructNewUser(userName: string, email: string, userPassword: string) {
        try {
            const hash = constructBCRYPTHash(userPassword)
            const query = 'INSERT INTO Users (userName, email, hash) VALUES (' + userName + ', ' + email + ', ' + hash + ')'; 
            await connection.execute(query);
        } catch (error) {
            console.error('Error constructing user:', error);
            throw error;
        } finally {
            await connection.end();
        }
    }
    /**
     * default pending status
     */
    async constructNewFriendRequest(sender: string, receiver: string) {
        try {
            const query = 'INSERT INTO FriendRequests (sender, receiver) VALUES (' + sender + ', ' + receiver + ')'; 
            await connection.execute(query);
        } catch (error) {
            console.error('Error constructing friend request:', error);
            throw error;
        } finally {
            await connection.end();
        }
    }
    /**
     * note for ryan: need to get block sender and reciever and run list operations on it should return status's as well for ease.
     */
    async getFriendsList(){
        return;
    }

    async acceptFriendRequest(){
        return;
    }
    /**
     * this will directly delete the request from our database, can be used to unadd someone, if a user wishes to clock a friend call
     * blockUser() instead.
     */
    async declineFriendRequest(){
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

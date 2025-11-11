
import { createPool } from 'mysql2/promise'; 
import * as CryptoJS from 'crypto-js';

function constructMD5Hash(password: string) {
    return CryptoJS.MD5(password).toString();
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
            console.error('Error fetching users:', error);
            throw error;
        }
    }

    async constructNewUser(userName: string, email: string, userPassword: string) {
        try {
            const hash = constructMD5Hash(userPassword)
            const query = 'INSERT INTO Users (userName, email, hash) VALUES (' + userName + ', ' + email + ', ' + hash + ')'; 
            const row = await connection.execute(query);
            return row;
        } catch (error) {
            console.error('Error fetching users:', error);
            throw error;
        }
    }
          
}

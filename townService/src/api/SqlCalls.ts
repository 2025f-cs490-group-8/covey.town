import sql from 'mssql' 
import dotenv from 'dotenv';

dotenv.config();

const config = {
    user: 'admin',
    password: 'epicgamer12',
    server: 'covey-town.c1e4guig85zc.us-east-2.rds.amazonaws.com',
    database: 'COVEYTOWN',
    options: {
        encrypt: true,
        trustServerCertificate: true
    }
};

async function connectToDB() {
    try {
        await sql.connect(config);
        console.log('SQL Connection Successful');
    } catch (err) {
        console.error('SQl Connection Failed:', err);
    }
    
}

connectToDB()
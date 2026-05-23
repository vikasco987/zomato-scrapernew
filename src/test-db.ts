import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

async function testConnection() {
    try {
        const websiteEnvPath = '/Users/vikas/Desktop/kravy-pos-website/.env';
        if (!fs.existsSync(websiteEnvPath)) {
            console.error('POS .env file not found.');
            return;
        }

        const envContent = fs.readFileSync(websiteEnvPath, 'utf8');
        const envConfig = dotenv.parse(envContent);
        const dbUrl = envConfig.DATABASE_URL;

        if (!dbUrl) {
            console.error('DATABASE_URL is missing in POS .env.');
            return;
        }

        console.log('🔌 Attempting connection to:', dbUrl.replace(/:([^@]+)@/, ':****@')); // Mask password
        const client = new MongoClient(dbUrl, {
            connectTimeoutMS: 5000,
            socketTimeoutMS: 5000
        });

        await client.connect();
        console.log('✅ Connection successful!');
        const db = client.db();
        const collections = await db.listCollections().toArray();
        console.log('Available collections:', collections.map(c => c.name));
        await client.close();
    } catch (err: any) {
        console.error('🚨 Connection failed:', err.message);
    }
}

testConnection();

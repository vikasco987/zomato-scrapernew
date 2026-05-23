import { MongoClient } from 'mongodb';
import fs from 'fs';
import dotenv from 'dotenv';

async function main() {
    const websiteEnvPath = '/Users/vikas/Desktop/kravy-pos-website/.env';
    if (!fs.existsSync(websiteEnvPath)) {
        console.error("Website .env not found");
        return;
    }
    const envContent = fs.readFileSync(websiteEnvPath, 'utf8');
    const envConfig = dotenv.parse(envContent);
    const dbUrl = envConfig.DATABASE_URL;
    if (!dbUrl) {
        console.error("DATABASE_URL not found");
        return;
    }

    const client = new MongoClient(dbUrl);
    await client.connect();
    const db = client.db();

    const users = ['user_36I5lxHihIHIpHURemGuQqelV9J', 'user_3DTiLIZYNnWI6wFzA9BIcZG8dNm'];
    const billCollection = db.collection('BillManager');

    for (const uid of users) {
        const count = await billCollection.countDocuments({ clerkUserId: uid });
        const isDeletedTrueCount = await billCollection.countDocuments({ clerkUserId: uid, isDeleted: true });
        const isDeletedFalseCount = await billCollection.countDocuments({ clerkUserId: uid, isDeleted: false });
        console.log(`Merchant ${uid}: Total=${count}, isDeleted:true=${isDeletedTrueCount}, isDeleted:false=${isDeletedFalseCount}`);
    }

    await client.close();
}

main().catch(console.error);

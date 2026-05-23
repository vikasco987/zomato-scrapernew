import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import fs from "fs";

// Load POS database URL
const websiteEnvPath = '/Users/vikas/Desktop/kravy-pos-website/.env';
let dbUrl = "";

if (fs.existsSync(websiteEnvPath)) {
    const envContent = fs.readFileSync(websiteEnvPath, 'utf8');
    const envConfig = dotenv.parse(envContent);
    dbUrl = envConfig.DATABASE_URL || "";
}

if (!dbUrl) {
    console.error("❌ Could not find DATABASE_URL in kravy-pos-website .env");
    process.exit(1);
}

async function main() {
    console.log(`🔌 Connecting to POS MongoDB: ${dbUrl}`);
    const client = new MongoClient(dbUrl);
    await client.connect();
    const db = client.db();
    
    const itemCollection = db.collection('Item');
    const targetUserId = "custom_1779350626310_n62qy";
    
    console.log("\n--- ITEMS BY clerkId ---");
    const itemsClerk = await itemCollection.find({ clerkId: targetUserId }).toArray();
    console.log(`Found ${itemsClerk.length} items by clerkId`);
    
    console.log("\n--- ITEMS BY userId ---");
    const itemsUser = await itemCollection.find({ userId: targetUserId }).toArray();
    console.log(`Found ${itemsUser.length} items by userId`);

    const itemsToPrint = itemsClerk.length > 0 ? itemsClerk : itemsUser;
    for (const it of itemsToPrint) {
        console.log(`- "${it.name}" (ID: ${it._id})`);
        console.log(`  Category ID: ${it.categoryId}, clerkId: ${it.clerkId}, userId: ${it.userId}`);
        console.log(`  Image: ${it.image || '❌ None'}, ImageUrl: ${it.imageUrl || '❌ None'}`);
    }

    await client.close();
}

main().catch(console.error);

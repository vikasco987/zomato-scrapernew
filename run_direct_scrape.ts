import { scrapeAndUpdateExternalMenu } from "./src/services/externalScraper.js";
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config({ path: '/Users/vikas/.gemini/antigravity-ide/scratch/kravy-pos-website/.env', override: true });

async function run() {
    // You can now put either a Clerk ID, Email, or Phone number here!
    const searchParam = "siraj.kravy@gmail.com"; 

    console.log(`🔍 Looking up merchant by: ${searchParam}`);

    let clerkId = searchParam;

    // Check if it looks like an email or phone number instead of a Clerk ID
    if (searchParam.includes('@') || /^\d{10}$/.test(searchParam)) {
        const client = new MongoClient(process.env.DATABASE_URL as string);
        await client.connect();
        const db = client.db();
        
        const users = await db.collection('User').find({
            $or: [
                { email: { $regex: new RegExp(searchParam.trim(), "i") } },
                { phone: { $regex: new RegExp(searchParam.trim(), "i") } }
            ]
        }).toArray();

        console.log(`Found ${users.length} raw matching users from DB.`);
        const validUser = users.find(u => u.clerkId);
        await client.close();

        if (!validUser) {
            console.error(`❌ ERROR: Could not find any merchant with email or phone: ${searchParam} that has a Clerk ID attached.`);
            process.exit(1);
        }
        
        clerkId = validUser.clerkId;
        console.log(`✅ Found Merchant! Name: ${validUser.name || 'Unknown'}, Clerk ID: ${clerkId}`);
    }

    console.log(`🚀 Starting direct scrape for ${clerkId}...`);
    // Bypass queue and run it directly in this process
    await scrapeAndUpdateExternalMenu(clerkId, null as any);
    console.log("✅ Direct scrape complete!");
}

run().catch(console.error);

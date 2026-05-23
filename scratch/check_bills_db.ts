import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import fs from "fs";

async function run() {
    const websiteEnvPath = '/Users/vikas/Desktop/kravy-pos-website/.env';
    if (!fs.existsSync(websiteEnvPath)) {
        console.error("❌ Env not found!");
        return;
    }
    const envContent = fs.readFileSync(websiteEnvPath, 'utf8');
    const envConfig = dotenv.parse(envContent);
    const dbUrl = envConfig.DATABASE_URL;

    if (!dbUrl) {
        console.error("❌ DATABASE_URL not defined!");
        return;
    }

    console.log("🔌 Connecting to:", dbUrl);
    const client = new MongoClient(dbUrl);
    await client.connect();
    const db = client.db();

    const billCollection = db.collection('BillManager');
    const userCollection = db.collection('User');

    // 1. Get total bill count
    const totalBills = await billCollection.countDocuments();
    console.log("📊 Total bills in DB:", totalBills);

    // 2. Get unique clerkUserIds in BillManager
    const uniqueClerkIds = await billCollection.distinct('clerkUserId');
    console.log("🆔 Unique clerkUserIds in BillManager:", uniqueClerkIds);

    // 3. Look for Level Up Caf'e user
    const users = await userCollection.find({ name: { $regex: "Level Up", $options: "i" } }).toArray();
    console.log("☕ Users matching 'Level Up':", users.map(u => ({ id: u._id, name: u.name, clerkId: u.clerkId })));

    // 4. If we have a clerk ID, let's see bills for it
    if (users.length > 0) {
        for (const u of users) {
            const clerkId = u.clerkId;
            const billsCountForClerk = await billCollection.countDocuments({ clerkUserId: clerkId });
            console.log(`🧾 Bills count for clerkId "${clerkId}":`, billsCountForClerk);
            
            // Let's print one sample bill if exists
            if (billsCountForClerk > 0) {
                const sample = await billCollection.findOne({ clerkUserId: clerkId });
                console.log("   Sample Bill:", sample);
            }
        }
    }

    await client.close();
}

run().catch(console.error);

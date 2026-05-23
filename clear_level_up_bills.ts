import { MongoClient } from 'mongodb';
import fs from 'fs';
import dotenv from 'dotenv';

async function main() {
    const websiteEnvPath = '/Users/vikas/Desktop/kravy-pos-website/.env';
    if (!fs.existsSync(websiteEnvPath)) {
        console.error("❌ Website .env not found at " + websiteEnvPath);
        return;
    }
    const envContent = fs.readFileSync(websiteEnvPath, 'utf8');
    const envConfig = dotenv.parse(envContent);
    const dbUrl = envConfig.DATABASE_URL;
    if (!dbUrl) {
        console.error("❌ DATABASE_URL not found in POS website .env");
        return;
    }

    console.log("🔌 Connecting to live POS database...");
    const client = new MongoClient(dbUrl);
    await client.connect();
    const db = client.db();

    const clerkId = 'user_3DTiLIZYNnWI6wFzA9BIcZG8dNm';
    const userCollection = db.collection('User');
    const billCollection = db.collection('BillManager');
    const orderCollection = db.collection('Order');
    const paymentCollection = db.collection('Payment');

    // Find the user to resolve exactly
    const user = await userCollection.findOne({ clerkId: { $regex: new RegExp("^" + clerkId + "$", "i") } });
    const resolvedClerkId = user ? user.clerkId : clerkId;
    console.log(`👤 Resolved Merchant ID: "${resolvedClerkId}" (Name: ${user ? user.name : 'Unknown'})`);

    // Fetch all bills to delete associated payments
    const bills = await billCollection.find({ clerkUserId: resolvedClerkId }).toArray();
    const billIds = bills.map(b => b._id);
    console.log(`🔍 Found ${bills.length} bills in BillManager for "${resolvedClerkId}"`);

    let paymentsDeleted = 0;
    if (billIds.length > 0) {
        console.log(`🧹 Deleting associated payments for ${billIds.length} bills...`);
        const paymentsResult = await paymentCollection.deleteMany({ billId: { $in: billIds } });
        paymentsDeleted = paymentsResult.deletedCount;
    }

    console.log(`🧹 Deleting all bills for clerkUserId "${resolvedClerkId}"...`);
    const billsResult = await billCollection.deleteMany({ clerkUserId: resolvedClerkId });

    console.log(`🧹 Deleting all orders for clerkUserId "${resolvedClerkId}"...`);
    const ordersResult = await orderCollection.deleteMany({ clerkUserId: resolvedClerkId });

    console.log(`\n🎉 DATABASE WIPE COMPLETED SUCCESSFULY!`);
    console.log(`   - Bills Deleted: ${billsResult.deletedCount}`);
    console.log(`   - Orders Deleted: ${ordersResult.deletedCount}`);
    console.log(`   - Payments Deleted: ${paymentsDeleted}`);

    await client.close();
}

main().catch(console.error);

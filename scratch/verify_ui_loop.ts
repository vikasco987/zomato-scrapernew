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

    const client = new MongoClient(dbUrl);
    await client.connect();
    const db = client.db();
    const billCollection = db.collection('BillManager');

    const clerkId = "user_3DTiLIZYNnWI6wFzA9BIcZG8dNm";
    const bills = await billCollection.find({ clerkUserId: clerkId }).sort({ createdAt: -1 }).toArray();
    console.log(`📊 Found ${bills.length} bills for clerkId ${clerkId}`);

    bills.forEach((bill, index) => {
        try {
            console.log(`\n--- Checking Bill #${index + 1} (${bill.billNumber || bill._id}) ---`);
            
            // 1. Check date parsing
            if (!bill.createdAt) {
                console.log("⚠️ bill.createdAt is missing or empty!");
            }
            const billDate = new Date(bill.createdAt).toLocaleString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            });
            console.log("✅ billDate parsed successfully:", billDate);

            // 2. Check items parsing
            let itemsSummary = '';
            const items = typeof bill.items === 'string' ? JSON.parse(bill.items) : bill.items;
            if (Array.isArray(items)) {
                itemsSummary = items.map(i => `${i.name || i.dishName || 'Item'} x${i.quantity || i.qty || 1}`).join(', ');
                if (itemsSummary.length > 50) {
                    itemsSummary = itemsSummary.substring(0, 47) + '...';
                }
            } else {
                itemsSummary = 'Invalid items format';
            }
            console.log("✅ items parsed successfully:", itemsSummary);

            // 3. Check customer name
            const custName = bill.customerName || 'Anonymous';
            console.log("✅ custName:", custName);

            // 4. Check total formatting
            const formattedTotal = (bill.total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            console.log("✅ formattedTotal:", formattedTotal);

        } catch (e: any) {
            console.error(`❌ CRITICAL EXCEPTION on Bill #${index + 1}:`, e.message);
        }
    });

    await client.close();
}

run().catch(console.error);

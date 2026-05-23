import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import fs from "fs";

async function main() {
    const envContent = fs.readFileSync('/Users/vikas/Desktop/kravy-pos-website/.env', 'utf8');
    const envConfig = dotenv.parse(envContent);
    const dbUrl = envConfig.DATABASE_URL;
    if (!dbUrl) throw new Error("No database URL");

    const client = new MongoClient(dbUrl);
    await client.connect();
    const db = client.db();
    const bills = await db.collection('BillManager').find({ clerkUserId: "user_3DTiLIZYNnWI6wFzA9BIcZG8dNm" }).toArray();
    console.log(`Found ${bills.length} bills.`);
    for (let i = 0; i < bills.length; i++) {
        const b = bills[i];
        console.log(`Bill ${i}: ID=${b._id}, createdAt=${b.createdAt} (${typeof b.createdAt}), items=${typeof b.items}, total=${b.total}`);
        if (b.items && Array.isArray(b.items)) {
            console.log(`  Items:`, b.items.map(it => it.name || it.dishName).join(", "));
        }
    }
    await client.close();
}
main().catch(err => console.error(err));

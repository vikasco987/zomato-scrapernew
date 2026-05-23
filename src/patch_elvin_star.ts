import { MongoClient, ObjectId } from "mongodb";
import dotenv from "dotenv";
import fs from "fs";
import { scrapeAndSaveFood } from "./index.js";
import { cleanDishName } from "./scraper/utils.js";

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

const CLERK_ID = "custom_1779350626310_n62qy";

async function main() {
    console.log(`🔌 [POS PATCH] Connecting directly to Kravy POS MongoDB: ${dbUrl}`);
    const client = new MongoClient(dbUrl);
    await client.connect();
    const db = client.db();
    
    const itemCollection = db.collection('Item');
    const categoryCollection = db.collection('Category');
    
    // Find all items for ELVIN STAR DHABA
    const items = await itemCollection.find({ clerkId: CLERK_ID }).toArray();
    console.log(`\n📋 [POS PATCH] Found ${items.length} items to update for ELVIN STAR DHABA.`);
    
    if (items.length === 0) {
        console.log("❌ No items found for this merchant clerkId in the database.");
        await client.close();
        process.exit(1);
    }
    
    // Fetch categories to get category names
    const categories = await categoryCollection.find({ clerkId: CLERK_ID }).toArray();
    const categoryMap: Record<string, string> = {};
    categories.forEach(cat => {
        categoryMap[cat._id.toString()] = cat.name;
    });

    console.log("\n--- STARTING LIVE IMAGE UPDATE PIPELINE ---");
    let successCount = 0;
    
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const rawName = item.name;
        // Clean name (e.g. "कढ़ी चावल (V)" -> "kadhi chawal" or "kadi chawal")
        const displayDishName = rawName.replace(/\(.*\)|\[.*\]|\d+\s*ml|\d+\s*lit/gi, "").trim();
        const catId = item.categoryId ? item.categoryId.toString() : "";
        const categoryName = categoryMap[catId] || "General";
        
        console.log(`\n[${i + 1}/${items.length}] 🔄 Processing: "${rawName}" (Category: "${categoryName}")`);
        console.log(`   👉 Clean Search Name: "${cleanDishName(displayDishName)}"`);
        
        try {
            // Call the core scrape and save pipeline
            // force=true ensures we re-scrape rather than returning cached duplicate image
            const record = await scrapeAndSaveFood(displayDishName, CLERK_ID, true, null, categoryName);
            
            if (record && record.cloudinaryUrl) {
                console.log(`   ⚡ Image found! CDN URL: ${record.cloudinaryUrl}`);
                
                // Update the POS database directly
                const updateResult = await itemCollection.updateOne(
                    { _id: item._id },
                    { 
                        $set: { 
                            imageUrl: record.cloudinaryUrl, 
                            image: record.cloudinaryUrl,
                            updatedAt: new Date()
                        } 
                    }
                );
                
                if (updateResult.modifiedCount > 0) {
                    console.log(`   ✅ DB Update Success for "${rawName}"!`);
                    successCount++;
                } else {
                    console.log(`   ℹ️ DB already up to date or no modifications made for "${rawName}".`);
                }
            } else {
                console.log(`   ❌ No quality image found for "${rawName}".`);
            }
        } catch (err: any) {
            console.error(`   🚨 Error processing "${rawName}":`, err.message);
        }
        
        // Add a small delay between items to be friendly to search engines
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log(`\n🏁 [POS PATCH] Image Sync Complete! Successfully updated ${successCount}/${items.length} items.`);
    await client.close();
}

main().catch(console.error);

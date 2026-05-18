import { scrapeAndSaveFood } from '../index.js';
import { scrapeAndUpdateExternalMenu } from '../services/externalScraper.js';

async function main() {
    const userId = "user_3DTiLIZYNnWI6wFzA9BIcZG8dNm";
    const failedItems = [
        { name: "Mushroom + Paneer", cat: "Pizza" },
        { name: "Capsicum + Red Paprika", cat: "Pizza" },
        { name: "Jalapeno + Red Paprika", cat: "Pizza" },
        { name: "Paneer + Corn", cat: "Pizza" },
        { name: "Onion + Corn", cat: "Pizza" },
        { name: "Onion + Tomato", cat: "Pizza" },
        { name: "Onion + Capsicum", cat: "Pizza" },
        { name: "Onion + Paneer", cat: "Pizza" },
        { name: "Mughlai Retreat Pizza", cat: "Pizza" },
        { name: "Karahi Paneer Pizza", cat: "Pizza" },
        { name: "Peri Peri Boom", cat: "Pizza" },
        { name: "Cheese Burst Pizza", cat: "Pizza" }
    ];

    console.log(`🚀 STARTING TARGETED SYNC FOR ${failedItems.length} PIZZA ITEMS...`);
    
    for (const item of failedItems) {
        console.log(`\n--------------------------------------------`);
        console.log(`👉 SYNCING: ${item.name} (${item.cat})`);
        await scrapeAndSaveFood(item.name, userId, true, null, item.cat);
    }
    
    console.log(`\n\n🌍 TRIGGERING BRIDGE UPDATE TO BILLING...`);
    await scrapeAndUpdateExternalMenu(userId);
    
    console.log(`🏁 TARGETED SYNC COMPLETE!`);
}

main().catch(console.error);

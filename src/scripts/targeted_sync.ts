import { scrapeAndSaveFood } from '../index.js';
import { scrapeAndUpdateExternalMenu } from '../services/externalScraper.js';

async function main() {
    const userId = "user_3DOkdP1FLCOvbL3vRfmYjdvghBg";
    const failedItems = [
        "Paneer Finger Chilli Style",
        "Paneer Finger",
        "Gobhi Manchurian",
        "Mushroom Manchurian Dry",
        "Mushroom Chilli Dry",
        "Paneer Pakoda",
        "Veg Pakoda",
        "Veg Manchurian Dry",
        "Paneer Manchurian",
        "Chilli Paneer Dry",
        "Chilli Potato",
        "French Fry",
        "Veg. Spring Roll"
    ];

    console.log(`🚀 STARTING TARGETED SYNC FOR ${failedItems.length} FAILED ITEMS...`);
    
    for (const item of failedItems) {
        console.log(`\n--------------------------------------------`);
        console.log(`👉 SYNCING: ${item}`);
        await scrapeAndSaveFood(item, userId, true);
    }
    
    console.log(`\n\n🌍 TRIGGERING BRIDGE UPDATE TO BILLING...`);
    await scrapeAndUpdateExternalMenu(userId);
    
    console.log(`🏁 TARGETED SYNC COMPLETE!`);
}

main().catch(console.error);

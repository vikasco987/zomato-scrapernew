import { scrapeAndSaveFood } from "../src/index.js";
import { prisma } from "../src/db/index.js";

async function testDrinks() {
    const userId = "user_3Cvl69fbsmasD1ayRaH3AxZxoJk";
    const drinks = [
        "Pepsi 500ml",
        "Coca-Cola 250ml Can",
        "Sprite 1L Bottle",
        "Red Bull Energy Drink 250ml",
        "Mountain Dew 500ml",
        "Maaza Mango Drink 600ml",
        "Frooti 200ml",
        "7Up 500ml"
    ];

    console.log(`\n🥤 INITIATING TEST SYNC FOR ${drinks.length} BEVERAGES...\n`);

    for (const drink of drinks) {
        console.log(`🧪 Testing: ${drink}...`);
        await scrapeAndSaveFood(drink, userId, true); // Force re-scrape to see new logic
    }

    console.log(`\n✅ TEST COMPLETE! Check your dashboard for these items.`);
}

testDrinks()
    .catch(console.error)
    .finally(() => prisma.$disconnect());

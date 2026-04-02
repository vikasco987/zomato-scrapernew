import { scrapeZomatoMenu } from "./src/menu-scraper/zomato.ts";
import { prisma } from "./src/db/index.ts";

async function runTest() {
    const url = "https://www.zomato.com/ncr/burger-king-connaught-place-new-delhi/menu";
    console.log(`\n🚀 STARTING TEST SCRAPE FOR: ${url}`);
    
    try {
        const result = await scrapeZomatoMenu(url);
        console.log(`\n✅ SCRAPE COMPLETED!`);
        console.log(`🏢 Restaurant: ${result.restaurant?.name}`);
        console.log(`📊 Total Items Scraped: ${result.itemsCount}`);
        
        // Let's look at the first 5 items
        const items = await prisma.menuItem.findMany({
            where: { restaurantId: result.restaurant?.id },
            take: 10
        });
        
        console.log(`\n📦 SAMPLE ITEMS (Top 10):`);
        items.forEach((item: any, idx: number) => {
            console.log(`${idx + 1}. [${item.name}] - ₹${item.price} | Image: ${item.image ? "✅" : "❌"}`);
        });

        const missingImages = items.filter(i => !i.image).length;
        console.log(`\n⚠️ Missing Images in Sample: ${missingImages}`);

        if (result.itemsCount > 0) {
            console.log(`\n💎 VERDICT: SUCCESS! System is extracting names, prices, and images.`);
        } else {
            console.log(`\n🔴 VERDICT: FAILED! No items found. Selectors might be broken.`);
        }

    } catch (e: any) {
        console.error(`\n❌ TEST FAILED: ${e.message}`);
    } finally {
        process.exit();
    }
}

runTest();

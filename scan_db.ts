import { prisma } from "./src/db/index.js";

async function scanDatabase() {
    console.log("🔍 [Database Scanner] Analyzing Item Status...");

    const itemsToScan = [
        "Lemon Soda", 
        "Butter Toast", 
        "Veg Cheese Sandwich",
        "Grill Veg Sandwich",
        "Egg Sandwich"
    ];

    for (const name of itemsToScan) {
        console.log(`\n--- Analyzing: ${name} ---`);
        
        // Check FoodImage table
        const foodImages = await prisma.foodImage.findMany({
            where: { foodName: { contains: name, mode: 'insensitive' } }
        });

        if (foodImages.length === 0) {
            console.log(`❌ No record found in FoodImage table for "${name}". (Never attempted?)`);
        } else {
            foodImages.forEach(f => {
                console.log(`📍 Found record: ID=${f.id}, Status=${f.status}, Retry=${f.retryCount}`);
                if (f.errorMessage) console.log(`   Error: ${f.errorMessage}`);
                if (f.cloudinaryUrl) console.log(`   Live URL: ${f.cloudinaryUrl}`);
            });
        }
    }

    console.log("\n--- General Statistics ---");
    const total = await prisma.foodImage.count();
    const completed = await prisma.foodImage.count({ where: { status: 'completed' } });
    const failed = await prisma.foodImage.count({ where: { status: 'failed' } });
    const pending = await prisma.foodImage.count({ where: { status: 'pending' } });

    console.log(`Total Records: ${total}`);
    console.log(`✅ Completed: ${completed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`⏳ Pending: ${pending}`);

    await prisma.$disconnect();
}

scanDatabase().catch(console.error);

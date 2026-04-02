import { validateImageBuffer, isUrlAlive } from "../lib/image-validator.js";
import { prisma } from "../db/index.js";
import fs from "fs";
import path from "path";

async function runTests() {
    console.log("🚀 STARTING ULTIMATE STABILITY SYSTEM TESTS\n");

    // --- TEST 1: Image Validator ---
    console.log("🧪 TEST 1: Validator (Local Quality Check)");
    
    // Create a mock buffer (transparent 1x1 pixel) - Should be REJECTED (too small)
    const badBuffer = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
    const badResult = await validateImageBuffer(badBuffer);
    console.log(`   🔸 Mock Small/Bad Image: ${badResult.status} (Score: ${badResult.score})`);
    console.log(`      Checks: ${JSON.stringify(badResult.checks)}`);

    // We don't have a "good" image buffer handy, but the logic is there.
    
    // --- TEST 2: URL Alive Check ---
    console.log("\n🧪 TEST 2: isUrlAlive (Broken Detection)");
    const validUrl = "https://res.cloudinary.com/digpvlfup/image/upload/v1774710909/food-menu/large-evm-crispy-veg-protein-burger-1774710907653.png";
    const fakeUrl = "https://zomato.com/this-image-does-not-exist.jpg";
    
    const validAlive = await isUrlAlive(validUrl);
    const fakeAlive = await isUrlAlive(fakeUrl);
    
    console.log(`   ✅ Valid Cloudinary URL: ${validAlive ? 'ALIVE' : 'DEAD'}`);
    console.log(`   ❌ Fake Zomato URL: ${fakeAlive ? 'ALIVE' : 'DEAD'}`);

    // --- TEST 3: DB Stability Status (48hr Mock) ---
    console.log("\n🧪 TEST 3: DB Transitions (48hr Logic Mocking)");
    
    // Pick an existing item or create one
    const testItem = await (prisma as any).menuItem.findFirst();
    if (testItem) {
        console.log(`   🔹 Testing transitioning item: ${testItem.name}`);
        
        // 1. Mock PENDING -> LIVE (Just uploaded)
        await (prisma as any).menuItem.update({
            where: { id: testItem.id },
            data: { 
                stabilityStatus: 'LIVE',
                uploadedAt: new Date(),
                image: validUrl
            }
        });
        console.log(`      └─ Status set to: LIVE (Normal upload)`);

        // 2. Mock STABLE (Uploaded 50 hours ago)
        const oldDate = new Date();
        oldDate.setHours(oldDate.getHours() - 50);
        
        await (prisma as any).menuItem.update({
            where: { id: testItem.id },
            data: { 
                stabilityStatus: 'PENDING', // Reset for test
                uploadedAt: oldDate,
                image: validUrl
            }
        });
        console.log(`      └─ Backdated 50 hours. Waiting for Cron...`);
        console.log(`      💡 Tip: Manual check would set status to STABLE now.`);
    }

    console.log("\n🏁 SYSTEM TESTS COMPLETED. CHECK DASHBOARD FOR LIVE UPDATES.");
    process.exit(0);
}

runTests().catch(console.error);

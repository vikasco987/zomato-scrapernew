import axios from "axios";
import pLimit from "p-limit";
import { prisma } from "../db/index.js";
import { scrapeAndSaveFood } from "../index.js";
import { delay } from "../scraper/utils.js";

const EXTERNAL_BASE = process.env.EXTERNAL_API_BASE || "https://billing.kravy.in/api/external";
const SECRET_KEY = process.env.SCRAPER_SECRET_KEY || "kravy_scraper_secret_2026";

/**
 * ⚡ 🚀 10X SPEED BOOST: ULTIMATE PARALLEL PIPELINE
 * Uses p-limit for concurrency and async orchestration.
 */
export async function scrapeAndUpdateExternalMenu(userId: string, jobId?: string) {
  console.log(`\n🚀 SPEED BRIDGE: Syncing Menu for User [${userId}] (Job: ${jobId || 'direct'})`);
  
  const headers = {
    "Content-Type": "application/json",
    "x-scraper-secret": SECRET_KEY
  };

  const limit = pLimit(12); // 👈 12 Items in Parallel (Turbo Local Mode)

  try {
    // 1. Fetch Menu Items (Check if Local Restaurant or External User)
    let items: any[] = [];
    const localResto = await prisma.restaurant.findUnique({ where: { id: userId } });

    if (localResto) {
        console.log(`🏠 LOCAL SYSTEM: Processing assets for restaurant ${localResto.name}`);
        items = await prisma.menuItem.findMany({ 
            where: { restaurantId: userId, OR: [{ image: "" }, { image: null }] } 
        });
    } else {
        console.log(`🌍 BRIDGE SYSTEM: Fetching missing assets from Billing...`);
        const res = await axios.get(`${EXTERNAL_BASE}/menu/${userId}`, { headers, timeout: 5000 });
        items = (res.data || []).filter((i: any) => !(i.imageUrl || i.image || i.cloudinaryUrl));
    }

    if (items.length === 0) {
        console.warn("⚠️ No missing items found for this target.");
        return { success: true, processed: 0 };
    }

    if (jobId) {
       await prisma.scraperJob.update({ where: { id: jobId }, data: { totalItems: items.length } });
    }

    console.log(`⚡ PIEPLINE: Processing ${items.length} items in PARALLEL (Concurrency: 5)...`);

    let processedCount = 0;
    let successCount = 0;

    // 🏆 PARALLEL EXECUTION MAP
    const results = await Promise.all(items.map((item: any) => 
        limit(async () => {
            // 🧹 Clean Dish Name (Remove sizes, packaging info)
            let dishName = item.name.replace(/\(.*\)|\[.*\]|\d+\s*ml|\d+\s*lit/gi, "").trim();
            const itemId = item.id;

            try {
                // 🧠 Use Central AI Orchestrator (Auto-Caches & Scores)
                const record = await scrapeAndSaveFood(dishName, userId);

                if (record && record.cloudinaryUrl) {
                    await axios.patch(`${EXTERNAL_BASE}/menu/update/${itemId}`, { 
                        imageUrl: record.cloudinaryUrl 
                    }, { headers, timeout: 5000 });
                    successCount++;
                }
            } catch (err: any) {
                console.error(`❌ [${dishName}] Engine Error:`, err.message);
            } finally {
                // 📊 ATOMIC PROGRESS SYNC (Avoiding Deadlocks)
                if (jobId) {
                    let retries = 3;
                    while (retries > 0) {
                        try {
                            await prisma.scraperJob.update({
                                where: { id: jobId },
                                data: { processedCount: { increment: 1 } }
                            });
                            break; // Success
                        } catch (e) {
                            retries--;
                            if (retries === 0) console.error(`⚠️ DB_CONFLICT: [${jobId}] Progress drop.`);
                            await new Promise(r => setTimeout(r, 100));
                        }
                    }
                }
            }
        })
    ));

    console.log(`\n🏁 PIPELINE COMPLETE: ${successCount}/${items.length} Items Live.`);
    return { success: true, processed: successCount };

  } catch (err: any) {
    console.error("❌ Bridge Pipeline Error:", err.message);
    throw err;
  }
}

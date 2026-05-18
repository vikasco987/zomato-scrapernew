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

  const limit = pLimit(8); // 👈 8 Items in Parallel (Optimized for Local + Browser Reuse)

  try {
    // 1. Fetch Menu Items (Check if Local Restaurant or External User)
    let items: any[] = [];
    const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(userId);
    console.log(`🔍 [Bridge] Validating ID: "${userId}" -> isValid: ${isValidObjectId}`);
    
    let localResto: any = null;
    if (isValidObjectId) {
        console.log(`🏠 [Bridge] Attempting local DB lookup for ${userId}`);
        localResto = await (prisma as any).restaurant.findUnique({ where: { id: userId } });
    } else {
        console.log(`🌍 [Bridge] Non-ObjectID detected. Skipping Local DB lookup.`);
    }

    if (localResto) {
        console.log(`🏠 LOCAL SYSTEM: Processing assets for restaurant ${localResto.name}`);
        items = await prisma.menuItem.findMany({ 
            where: { restaurantId: userId } 
        });
    } else {
        console.log(`🌍 BRIDGE SYSTEM: Fetching missing assets from Billing for [${userId}]...`);
        const res = await axios.get(`${EXTERNAL_BASE}/menu/${userId}`, { headers, timeout: 30000 });
        
        // Handle both array and { pending, completed } or other formats
        const rawData = res.data;
        if (Array.isArray(rawData)) {
            items = rawData.filter((i: any) => i.name || i.foodName);
        } else if (rawData && typeof rawData === 'object') {
            const pending = Array.isArray(rawData.pending) ? rawData.pending : [];
            const completed = Array.isArray(rawData.completed) ? rawData.completed : [];
            items = [...pending, ...completed].filter((i: any) => i.name || i.foodName);
        }
    }

    if (jobId) {
        // Essential: Sync actual count to DB for UI
        await prisma.scraperJob.update({ 
            where: { id: jobId }, 
            data: { totalItems: items.length } 
        });
    }

    if (items.length === 0) {
        console.warn("⚠️ No items found for this target.");
        return { success: true, processed: 0 };
    }

    // 🧼 GROUP BY BASE DISH (Ensures variants like Full/Half get the EXACT SAME image)
    const dishGroups = new Map<string, any[]>();
    items.forEach((item: any) => {
        const baseName = item.name.replace(/\(.*\)|\[.*\]|\d+\s*ml|\d+\s*lit|[-/]\s*[HFhfrR]\b|\b(half|full|quarter|small|large|medium|regular)\b/gi, "").trim();
        const key = baseName.toLowerCase();
        if (!dishGroups.has(key)) dishGroups.set(key, []);
        dishGroups.get(key)?.push(item);
    });

    console.log(`⚡ PIPELINE: Processing ${dishGroups.size} Unique Dishes (Managing ${items.length} total variants)...`);

    let successCount = 0;
    const baseNames = Array.from(dishGroups.keys());

    // 🏆 PARALLEL EXECUTION OVER UNIQUE DISHES
    await Promise.all(baseNames.map((baseNameKey: string) => 
        limit(async () => {
            const variants = dishGroups.get(baseNameKey) || [];
            const displayDishName = variants[0].name.replace(/\(.*\)|\[.*\]|\d+\s*ml|\d+\s*lit/gi, "").trim();
            
            try {
                const categoryName = variants[0].category?.name || "";
                // 🧠 Scrape with FORCE to ensure we pick up the new typo fixes and retry failed ones
                const record = await scrapeAndSaveFood(displayDishName, userId, true, null, categoryName);

                if (record && record.cloudinaryUrl) {
                    // ✅ Apply the same image to ALL variants (Full, Half, etc.)
                    await Promise.all(variants.map(async (v) => {
                        try {
                            const res = await axios.patch(`${EXTERNAL_BASE}/menu/update/${v.id}`, { 
                                imageUrl: record.cloudinaryUrl 
                            }, { headers, timeout: 10000 });
                            console.log(`✅ [Bridge] Update Success: ${v.name} -> ${record.cloudinaryUrl}`);
                        } catch (e: any) {
                            console.error(`⚠️ [Bridge] Update Failed for variant ${v.name} (${v.id}): ${e.message}`);
                        }
                    }));
                    successCount += variants.length;
                }
            } catch (err: any) {
                console.error(`❌ [${displayDishName}] Sync Error:`, err.message);
            } finally {
                if (jobId) {
                    // Increment by the number of variants processed
                    await prisma.scraperJob.update({
                        where: { id: jobId },
                        data: { processedCount: { increment: variants.length } }
                    }).catch(() => {});
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

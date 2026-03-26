import axios from "axios";
import pLimit from "p-limit";
import { prisma } from "../db/index.js";
import { scrapeFoodImages } from "../scraper/index.js";
import { pickBestImage } from "../lib/scoring.js";
import { uploadImageFromUrl } from "../lib/uploader.js";

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

  const limit = pLimit(5); // 👈 5 Items in Parallel (Optimal Balance)

  try {
    // 1. Fetch Menu Items (External Project)
    const res = await axios.get(`${EXTERNAL_BASE}/menu/${userId}`, { headers, timeout: 5000 });
    const items = res.data;

    if (!items || items.length === 0) {
        console.warn("⚠️ No items without images found.");
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
            const dishName = item.name;
            const itemId = item.id;

            try {
                // 🔍 AI SEARCH
                const searchResult = await scrapeFoodImages(dishName);
                if (searchResult.success && searchResult.candidates.length > 0) {
                    const winner = pickBestImage(searchResult.candidates, dishName);
                    if (winner) {
                        const cdnUrl = await uploadImageFromUrl(winner.url, dishName);
                        if (cdnUrl) {
                            await axios.patch(`${EXTERNAL_BASE}/menu/update/${itemId}`, { 
                                imageUrl: cdnUrl 
                            }, { headers, timeout: 5000 });
                            successCount++;
                        }
                    }
                } else {
                    console.warn(`⚠️ [${dishName}] Search empty. Candidates: 0`);
                }
            } catch (err: any) {
                console.error(`❌ Item [${dishName}] error:`, err.message);
            } finally {
                processedCount++;
                if (jobId) {
                    await prisma.scraperJob.update({
                        where: { id: jobId },
                        data: { processedCount }
                    });
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

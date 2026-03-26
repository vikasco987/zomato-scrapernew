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

    // 🏆 PARALLEL EXECUTION MAP
    const results = await Promise.all(items.map((item: any) => 
        limit(async () => {
            const dishName = item.name;
            const itemId = item.id;

            // 🛑 CHECK FOR CANCELLATION
            if (jobId) {
                const currentJob = await prisma.scraperJob.findUnique({ where: { id: jobId } });
                if (currentJob?.error === "Cancelled by User") return { status: 'cancelled' };
            }

            try {
                // 🔍 SHARP SEARCH (indian food hd query)
                const optimizedQuery = `${dishName} food dish realistic hd`;
                const searchResult = await scrapeFoodImages(optimizedQuery);

                if (searchResult.success && searchResult.candidates.length > 0) {
                    const winner = pickBestImage(searchResult.candidates, dishName);
                    
                    if (winner) {
                        // ☁️ CLOUDINARY UPLOAD (Optimized Auto:Eco)
                        const cdnUrl = await uploadImageFromUrl(winner.url, dishName);
                        
                        if (cdnUrl) {
                            // 📬 UPDATE EXTERNAL DB
                            await axios.patch(`${EXTERNAL_BASE}/menu/update/${itemId}`, { 
                                imageUrl: cdnUrl 
                            }, { headers, timeout: 5000 });

                            processedCount++;
                            
                            // 📊 Update Progress
                            if (jobId) {
                                await prisma.scraperJob.update({
                                    where: { id: jobId },
                                    data: { processedCount }
                                });
                            }
                            // Less noisy logging (Mod 5)
                            if (processedCount % 5 === 0) console.log(`✨ Progress: ${processedCount}/${items.length} Done.`);
                            return { status: 'done', dishName };
                        }
                    }
                }
                return { status: 'failed', dishName };
            } catch (err: any) {
                console.error(`❌ Item [${dishName}] failed:`, err.message);
                return { status: 'error', dishName };
            }
        })
    ));

    const totalDone = results.filter(r => r.status === 'done').length;
    console.log(`\n🏁 PIPELINE COMPLETE: ${totalDone}/${items.length} Items Live. 🔥 Speed Up Success!`);
    return { success: true, processed: totalDone };

  } catch (err: any) {
    console.error("❌ Bridge Pipeline Error:", err.message);
    throw err;
  }
}

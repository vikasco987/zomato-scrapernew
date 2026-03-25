import axios from "axios";
import { prisma } from "../db/index.js";
import { scrapeFoodImages } from "../scraper/index.js";
import { pickBestImage } from "../lib/scoring.js";
import { uploadImageFromUrl } from "../lib/uploader.js";
import { delay } from "../scraper/utils.js";

const EXTERNAL_BASE = process.env.EXTERNAL_API_BASE || "https://billing.kravy.in/api/external";
const SECRET_KEY = process.env.SCRAPER_SECRET_KEY || "kravy_scraper_secret_2026";

/**
 * 🌉 THE EXTERNAL BRIDGE (NOW PRO WITH PROGRESS TRACKING)
 * Syncs images from the Scraper project into the billing.kravy.in project.
 */
export async function scrapeAndUpdateExternalMenu(userId: string, jobId?: string) {
  console.log(`\n🌉 BRIDGE START: Syncing Menu for User [${userId}] (Job: ${jobId || 'direct'})`);
  
  const headers = {
    "Content-Type": "application/json",
    "x-scraper-secret": SECRET_KEY
  };

  try {
    // 1. Fetch Menu Items (External Project)
    console.log(`🔍 Fetching menu from: ${EXTERNAL_BASE}/menu/${userId}`);
    const res = await axios.get(`${EXTERNAL_BASE}/menu/${userId}`, { headers });
    const items = res.data;

    if (!items || items.length === 0) {
      console.warn("⚠️ No items without images found for this user.");
      return { success: true, processed: 0 };
    }

    // 📊 Update Progress: Total Items
    if (jobId) {
       await prisma.scraperJob.update({
         where: { id: jobId },
         data: { totalItems: items.length }
       });
    }

    console.log(`📦 Found ${items.length} items to update. Initiating AI Scraper...`);

    let updatedCount = 0;

    for (const item of items) {
      // 🛑 EMERGENCY CHECK: Was this job cancelled?
      if (jobId) {
        const currentJob = await prisma.scraperJob.findUnique({ where: { id: jobId } });
        if (currentJob?.error === "Cancelled by User") {
            console.warn(`🛑 Job ${jobId} was manually cancelled. Aborting...`);
            return { success: false, error: "Cancelled" };
        }
      }

      const dishName = item.name;
      const itemId = item.id;

      if (!dishName) continue;

      console.log(`\n🚀 AI Sync: [${dishName}]`);

      // 🔍 Multi-Candidate Search (Scoring + Pick)
      const searchResult = await scrapeFoodImages(dishName);
      if (searchResult.success && searchResult.candidates.length > 0) {
         const winner = pickBestImage(searchResult.candidates, dishName);
         
         if (winner) {
            // ☁️ Direct Cloud Fetching
            const cdnUrl = await uploadImageFromUrl(winner.url, dishName);
            
            if (cdnUrl) {
                // 💾 UPDATE EXTERNAL DB
                console.log(`📬 Updating External DB for [${dishName}] ID: ${itemId}...`);
                await axios.patch(`${EXTERNAL_BASE}/menu/update/${itemId}`, {
                    imageUrl: cdnUrl
                }, { headers });

                updatedCount++;
                
                // 📊 Update Progress: Processed Count
                if (jobId) {
                   await prisma.scraperJob.update({
                     where: { id: jobId },
                     data: { processedCount: updatedCount }
                   });
                }

                console.log(`✅ [${dishName}] Successfully Updated & Live!`);
            }
         }
      }

      await delay(2000); 
    }

    console.log(`\n✨ BRIDGE SYNC COMPLETE: ${updatedCount}/${items.length} Items Live. 🥂`);
    return { success: true, processed: updatedCount };

  } catch (err: any) {
    console.error("❌ Bridge Sync Exception:", err.message);
    throw err;
  }
}

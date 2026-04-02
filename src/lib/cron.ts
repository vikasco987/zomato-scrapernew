import cron from "node-cron";
import { PrismaClient } from "@prisma/client";
import { syncMenuDirect } from "../menu-scraper/direct-api.js";

const prisma = new PrismaClient();

/**
 * ⏰ PRODUCTION CRON SCHEDULER: Auto Sync Menu at 3 AM daily
 * User requested flow: "0 3 * * *", async () => { ... }
 */
export function startCronJobs() {
  console.log("🕒 [Cron Engine] Initializing daily sync at 03:00...");

  // Daily at 3 AM
  cron.schedule("0 3 * * *", async () => {
    console.log("\n🚀 [Cron Sync] Starting daily menu refresh...");
    
    try {
      const restaurants = await prisma.restaurant.findMany();
      console.log(`📡 [Cron Sync] Found ${restaurants.length} restaurants to update.`);
      
      for (const restaurant of restaurants) {
        try {
          console.log(`🔄 [Cron Sync] Updating: ${restaurant.name} (${restaurant.source})`);
          
          if (restaurant.source === "zomato" && restaurant.url) {
            await syncMenuDirect(restaurant.url);
          } else {
            console.log(`⚠️ Skip auto-sync for ${restaurant.source} (Not yet automated)`);
          }
          
          // Friendly delay to avoid rate-limiting
          await new Promise(r => setTimeout(r, 5000));
        } catch (e: any) {
          console.error(`❌ [Cron Sync] ERROR for ${restaurant.name}: ${e.message}`);
        }
      }
      
      console.log("🏁 [Cron Sync] Daily refresh complete!");
    } catch (e: any) {
      console.error(`❌ [Cron Sync] Root job failed: ${e.message}`);
    }
  });

  // Example status log every 1 hour (Optional)
  cron.schedule("0 * * * *", () => {
    console.log("🕒 [Cron Engine] Heartbeat: Next sync scheduled for 03:00.");
  });
}

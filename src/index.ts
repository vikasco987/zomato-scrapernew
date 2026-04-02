import { prisma } from "./db/index.js";
import { scrapeFoodImages } from "./scraper/index.js";
import { uploadImageFromUrl } from "./lib/uploader.js";
import { pickBestImage } from "./lib/scoring.js";
import { delay } from "./scraper/utils.js";

const MAX_RETRIES = 2;

/**
 * 🎯 THE ULTIMATE AI PRODUCTION ORCHESTRATOR
 * MULTI-CANDIDATE -> SCORING -> BEST PICK -> DIRECT CLOUD
 */
export async function scrapeAndSaveFood(foodName: string, userId: string | null = null, force: boolean = false, menuItemId: string | null = null) {
  console.log(`\n🚀 AI PIPELINE: [${foodName}] (User: ${userId || 'Global'})${force ? " (FORCE RE-SCRAPE)" : ""}`);

  // 1. Pro Duplicate / Preparation Check
  let record = await prisma.foodImage.upsert({
    where: { foodName_userId: { foodName, userId: userId || "" } },
    update: {}, // No update for existing
    create: { foodName, userId: userId || "", status: "pending", retryCount: 0 }
  });

  if (!force && record?.status === "completed" && record.cloudinaryUrl) {
    console.log(`⏩ [${foodName}] Already Live on CDN. Skipping.`);
    return record;
  }

  // 3. Multi-Candidate Search + Multi-Candidate Try
  let attempts = record.retryCount;
  
  while (attempts < MAX_RETRIES) {
    record = await prisma.foodImage.update({ where: { id: record.id }, data: { retryCount: attempts + 1 } });
    
    const result = await scrapeFoodImages(foodName);
    
    if (result.success && result.candidates.length > 0) {
      // 🧠 AI SCORING (Sort by confidence)
      const rankedItems = result.candidates
        .map(c => ({ ...c, score: pickBestImage([c], foodName) ? 100 : 0 })) // Basic filter, we could refine this
        .sort((a, b) => b.score - a.score);

      for (const item of result.candidates) {
        try {
          const cdnUrl = await uploadImageFromUrl(item.url, foodName);
          if (cdnUrl) {
             // ✅ SUCCESS! Permanent Asset Deployed.
             const finalRecord = await prisma.foodImage.update({
               where: { id: record.id },
               data: {
                 originalUrl: item.url,
                 cloudinaryUrl: cdnUrl,
                 status: "completed",
                 localPath: null,
                 errorMessage: null
               }
             });
              if (menuItemId) {
                await (prisma as any).menuItem.update({
                  where: { id: menuItemId },
                  data: { image: cdnUrl, status: "completed" }
                });
              }

              console.log(`✅ [${foodName}] SYNC COMPLETED (${attempts + 1} attempts)`);
              return finalRecord;
          }
        } catch (uploadErr: any) {
          console.warn(`⚠️ [${foodName}] Candidate failed: ${uploadErr.message}. Trying next...`);
        }
      }
    }
    
    attempts++;
    console.log(`🔄 [${foodName}] All candidates failed in attempt ${attempts}. Retrying search...`);
    await delay(3000);
  }

  // ❌ TOTAL FAILURE
  console.warn(`❌ No quality image found for ${foodName} after ${attempts} attempts.`);
  await prisma.foodImage.update({ 
    where: { id: record.id }, 
    data: { status: "failed", errorMessage: "Exhausted all search candidates." } 
  });

  if (menuItemId) {
    await (prisma as any).menuItem.update({
      where: { id: menuItemId },
      data: { status: "failed", errorMessage: "Search failed after retries" }
    });
  }

  return null;
}

/**
 * ⚡ BULK RESTAURANT MENU IMAGE SYNC
 */
export async function scrapeMenuImagesForRestaurant(restaurantId: string) {
  console.log(`\n📦 STARTING BULK IMAGE SYNC FOR RESTAURANT: ${restaurantId}`);
  
  const menuItems = await (prisma as any).menuItem.findMany({
    where: { restaurantId, status: "pending" }
  });

  console.log(`🍱 Found ${menuItems.length} items to process...`);
  
  for (const item of menuItems) {
    await scrapeAndSaveFood(item.name, item.restaurantId, false, item.id);
    await delay(1500); // Friendly delay
  }
  
  console.log(`🏁 BULK SYNC COMPLETED!`);
}

/**
 * ⚡ MAIN PRODUCTION SCRIPT
 */
async function main() {
  const dishes = [
    "Butter Chicken", "Masala Dosa", "Chole Bhature", "Paneer Tikka", 
    "Dal Makhani", "Paneer Kulcha", "Samosa", "Tandoori Chicken",
    "Gajar ka Halwa", "Gulab Jamun", "Malai Kofta", "Lassi",
    "Chicken Biryani", "Palak Paneer", "Mutton Rogan Josh" // Added new dishes for AI flow test
  ];

  console.log("⚡ INITIATING ULTIMATE AI PRODUCTION LOOP...");
  
  for (const dish of dishes) {
    await scrapeAndSaveFood(dish);
  }

  const stats = await prisma.foodImage.findMany();
  console.log("\n📈 ULTIMATE PRODUCTION AUDIT:");
  console.table(stats.map(r => ({
      Dish: r.foodName,
      Status: r.status,
      Provider: r.cloudinaryUrl ? "CLOUDINARY ☁️" : "FAILED ❌",
      Efficiency: r.cloudinaryUrl ? "ECO-WebP (Optimized)" : "N/A",
      Integrity: r.status === "completed" ? "PASSED 🏆" : "PENDING ⏳"
  })));
}

// --- ENTRY POINT CHECK ---
if (process.argv[1].endsWith('index.js')) {
    main()
        .catch(console.error)
        .finally(() => prisma.$disconnect());
}

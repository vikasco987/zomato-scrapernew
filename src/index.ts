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
async function processFoodItem(foodName: string) {
  console.log(`\n🚀 AI PIPELINE: [${foodName}]`);

  // 1. Pro Duplicate Check
  let record = await prisma.foodImage.findUnique({ where: { foodName } });
  if (record?.status === "completed" && record.cloudinaryUrl) {
    console.log(`⏩ [${foodName}] Already Live on CDN. Skipping.`);
    return record;
  }

  // 2. Prep Record
  if (!record) {
    record = await prisma.foodImage.create({ data: { foodName, status: "pending" } });
  }

  // 3. Multi-Candidate Search (Up to 5 images)
  let attempts = record.retryCount;
  let winner: { url: string; width?: number; height?: number } | null = null;

  while (attempts < MAX_RETRIES) {
    record = await prisma.foodImage.update({ where: { id: record.id }, data: { retryCount: attempts + 1 } });
    
    const result = await scrapeFoodImages(foodName);
    
    if (result.success && result.candidates.length > 0) {
      // 🧠 AI SCORING + SELECTION (THE CROWN JEWEL)
      winner = pickBestImage(result.candidates, foodName);
      if (winner) break;
    }
    
    attempts++;
    await delay(3000);
  }

  if (!winner) {
    console.warn(`❌ No quality image found for ${foodName} after ${attempts} attempts.`);
    await prisma.foodImage.update({ where: { id: record.id }, data: { status: "failed", errorMessage: "No good candidates found." } });
    return null;
  }

  // 4. 🔥 DIRECT CLOUD PUSH (Zero local latency)
  try {
     const cdnUrl = await uploadImageFromUrl(winner.url, foodName);
     if (!cdnUrl) throw new Error("CloudLink Handshake failed.");

     // 5. Update Database with Permanent Asset
     const finalRecord = await prisma.foodImage.update({
       where: { id: record.id },
       data: {
         originalUrl: winner.url,
         cloudinaryUrl: cdnUrl,
         status: "completed",
         localPath: null, // Zero local storage logic!
         errorMessage: null
       }
     });

     console.log(`✅ DISH DEPLOYED: ${foodName} (Scored & Optimized 🏅)`);
     return finalRecord;

  } catch (err: any) {
     console.error(`❌ [${foodName}] Pipeline Exception: ${err.message}`);
     await prisma.foodImage.update({ where: { id: record.id }, data: { status: "failed", errorMessage: err.message } });
     return null;
  }
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
    await processFoodItem(dish);
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

main().catch(console.error).finally(() => prisma.$disconnect());

import { prisma } from "./db/index.js";
import { scrapeZomatoImage } from "./scraper/index.js";
import { downloadImage } from "./downloader/index.js";
import { delay } from "./scraper/utils.js";

const MAX_RETRIES = 3;

/**
 * The '1-Click' Orchestrator
 */
async function fetchAndStoreFoodImage(foodName: string) {
  console.log(`🚀 Starting image fetch for: ${foodName}...`);

  // 1. Check if we already have it in DB
  let record = await prisma.foodImage.findUnique({
    where: { foodName }
  });

  if (record?.status === "completed") {
    console.log(`✅ Already completed: ${record.localPath}`);
    return record;
  }

  // Create initial record if it doesn't exist
  if (!record) {
    record = await prisma.foodImage.create({
      data: { foodName, status: "pending" }
    });
  }

  // 2. Scraping with Retries
  let attempts = record.retryCount;
  let imageUrl: string | null = record.originalUrl;
  let lastError: string | null = null;

  while (attempts < MAX_RETRIES) {
    record = await prisma.foodImage.update({
        where: { id: record.id },
        data: { retryCount: attempts + 1 }
    });

    console.log(`🔍 Attempt ${attempts + 1} for ${foodName}...`);
    const result = await scrapeZomatoImage(foodName);

    if (result.success && result.imageUrl) {
        imageUrl = result.imageUrl;
        break;
    } else {
        lastError = result.error || "Unknown error during scraping";
        console.warn(`⚠️ Attempt ${attempts + 1} failed: ${lastError}`);
        attempts++;
        await delay(2000 * (attempts + 1)); // Exponential backoff
    }
  }

  // 3. Update DB with Scraping result
  if (!imageUrl) {
    await prisma.foodImage.update({
      where: { id: record.id },
      data: { status: "failed", errorMessage: lastError || "Max retries reached" }
    });
    console.error(`❌ Failed to fetch image for ${foodName} after ${MAX_RETRIES} attempts.`);
    return null;
  }

  // 4. Download and Store image
  try {
     console.log(`📥 Downloading image: ${imageUrl.substring(0, 50)}...`);
     const localPath = await downloadImage(imageUrl, foodName);

     // 5. Final DB update
     const finalRecord = await prisma.foodImage.update({
       where: { id: record.id },
       data: {
         originalUrl: imageUrl,
         localPath: localPath,
         status: "completed",
         errorMessage: null
       }
     });

     console.log(`✨ DONE: Image saved at ${localPath}`);
     return finalRecord;

  } catch (downloadError: any) {
     console.error(`❌ Download failed for ${foodName}: ${downloadError.message}`);
     await prisma.foodImage.update({
       where: { id: record.id },
       data: { status: "failed", errorMessage: `Download error: ${downloadError.message}` }
     });
     return null;
  }
}

/**
 * Example: Running for multiple food items
 */
async function main() {
  const foods = ["Butter Chicken", "Masala Dosa", "Chole Bhature"];

  for (const food of foods) {
    await fetchAndStoreFoodImage(food);
  }

  const allRecords = await prisma.foodImage.findMany();
  console.log("\n📊 Final Status Summary:");
  console.table(allRecords.map(r => ({
      name: r.foodName,
      status: r.status,
      path: r.localPath || "N/A",
      retries: r.retryCount
  })));
}

main()
  .catch(async (e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

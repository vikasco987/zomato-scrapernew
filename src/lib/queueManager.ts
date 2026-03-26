import { prisma } from "../db/index.js";
import { scrapeAndUpdateExternalMenu } from "../services/externalScraper.js";
import { delay } from "../scraper/utils.js";

/**
 * 🚀 QUEUE MANAGER
 * Sequential processing of scraping jobs to avoid rate limits & crashes.
 */
class QueueManager {
  private isProcessing = false;

  async addJob(userId: string) {
    const job = await prisma.scraperJob.create({
      data: { userId, status: "queued" }
    });
    
    console.log(`📡 Job [${job.id}] Queued for User: ${userId}`);
    
    // Trigger worker if not already running
    this.processQueue();
    
    return job;
  }

  async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (true) {
      // 1. Find the next queued job
      const nextJob = await prisma.scraperJob.findFirst({
        where: { status: "queued" },
        orderBy: { createdAt: "asc" }
      });

      if (!nextJob) {
        console.log("🏁 Queue empty. Worker standing by...");
        this.isProcessing = false;
        break;
      }

      // 2. Set as Processing
      console.log(`⚙️ Processing Job [${nextJob.id}] for User: ${nextJob.userId}`);
      await prisma.scraperJob.update({
        where: { id: nextJob.id },
        data: { status: "processing" }
      });

      try {
        // 3. Execute the Scraper (Now with progress tracking)
        await scrapeAndUpdateExternalMenu(nextJob.userId, nextJob.id);

        // 4. Mark as Completed
        await prisma.scraperJob.update({
          where: { id: nextJob.id },
          data: { status: "completed" }
        });
        console.log(`✅ Job [${nextJob.id}] DONE! ✨`);

      } catch (err: any) {
        console.error(`❌ Job [${nextJob.id}] FAILED: ${err.message}`);
        await prisma.scraperJob.update({
          where: { id: nextJob.id },
          data: { status: "failed", error: err.message }
        });
      }

      await delay(2000); // Cool down before next job
    }
  }
  async getJobs() {
    return await prisma.scraperJob.findMany({
      orderBy: { createdAt: "desc" },
      take: 20
    });
  }
}

export const queueManager = new QueueManager();

import { prisma } from "../db/index.js";
import { scrapeAndUpdateExternalMenu } from "../services/externalScraper.js";
import { delay } from "../scraper/utils.js";
import { emitUpdate } from "./socket.js";

/**
 * 🚀 QUEUE MANAGER
 * Sequential processing of scraping jobs with Real-world Jitter.
 */
class QueueManager {
  private isProcessing = false;

  async addJob(userId: string) {
    const job = await prisma.scraperJob.create({
      data: { userId, status: "queued" }
    });
    
    emitUpdate("job_update", job);
    this.processQueue();
    return job;
  }

  async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (true) {
      const nextJob = await prisma.scraperJob.findFirst({
        where: { status: "queued" },
        orderBy: { createdAt: "asc" }
      });

      if (!nextJob) {
        this.isProcessing = false;
        break;
      }

      // Update Processing State
      const updatedJob = await prisma.scraperJob.update({
        where: { id: nextJob.id },
        data: { status: "processing" }
      });
      emitUpdate("job_update", updatedJob);

      try {
        await scrapeAndUpdateExternalMenu(nextJob.userId, nextJob.id);
        const finalJob = await prisma.scraperJob.update({
          where: { id: nextJob.id },
          data: { status: "completed" }
        });
        emitUpdate("job_update", finalJob);
      } catch (err: any) {
        const errorJob = await prisma.scraperJob.update({
          where: { id: nextJob.id },
          data: { status: "failed", error: err.message }
        });
        emitUpdate("job_update", errorJob);
      }
      await delay(2000);
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

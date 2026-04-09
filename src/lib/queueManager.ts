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

  async addJob(userId: string, totalItems?: number) {
    console.log(`🆕 [Queue] Adding job for User: ${userId}`);
    const job = await prisma.scraperJob.create({
      data: { userId, status: "queued", totalItems: totalItems || 0 }
    });
    
    emitUpdate("job_update", job);
    this.processQueue();
    return job;
  }

  /**
   * 🛡️ RECOVERY: Mark 'processing' jobs as 'queued' on startup
   */
  async recoverJobs() {
    console.log(`🔍 [Queue Recovery] Checking for stuck jobs...`);
    const result = await prisma.scraperJob.updateMany({
        where: { status: "processing" },
        data: { status: "queued" }
    });
    if (result.count > 0) console.log(`♻️ [Queue Recovery] Re-queued ${result.count} stuck jobs.`);
    this.processQueue();
  }

  async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    console.log(`🚀 [Queue] Start Processing Loop...`);

    try {
      while (true) {
        const nextJob = await prisma.scraperJob.findFirst({
          where: { status: "queued" },
          orderBy: { createdAt: "asc" }
        });

        if (!nextJob) break;

        // Update Processing State
        const updatedJob = await prisma.scraperJob.update({
          where: { id: nextJob.id },
          data: { status: "processing" }
        });
        emitUpdate("job_update", updatedJob);

        console.log(`🔌 [Queue] Running Job [${nextJob.id}] for User [${nextJob.userId}]`);

        try {
          await scrapeAndUpdateExternalMenu(nextJob.userId, nextJob.id);
          
          await prisma.scraperJob.update({
            where: { id: nextJob.id },
            data: { status: "completed" }
          });
        } catch (err: any) {
          console.error(`❌ [Queue] Job [${nextJob.id}] FAILED: ${err.message}`);
          await prisma.scraperJob.update({
            where: { id: nextJob.id },
            data: { status: "failed", error: err.message }
          });
        }

        const finalJob = await prisma.scraperJob.findUnique({ where: { id: nextJob.id } });
        if (finalJob) emitUpdate("job_update", finalJob);

        await delay(2000);
      }
    } catch (loopErr: any) {
        console.error(`🚨 [Queue] LOOP CRITICAL ERROR: ${loopErr.message}`);
    } finally {
      this.isProcessing = false;
      console.log(`🏁 [Queue] Loop Exited.`);
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

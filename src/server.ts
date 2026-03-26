import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { createServer } from "http";
import multer from "multer";
import { prisma } from "./db/index.js";
import { queueManager } from "./lib/queueManager.js";
import { scrapeAndSaveFood } from "./index.js";
import { v2 as cloudinary } from "cloudinary";
import axios from "axios";
import { initSocket } from "./lib/socket.js";

const app = express();
const httpServer = createServer(app);
initSocket(httpServer);
app.use(express.json());
app.use(cors());

// Configure Multer for local temporary storage
const upload = multer({ dest: "temp/uploads/" });

// Serve frontend
const __dirname = path.resolve();
app.use(express.static(path.join(__dirname, "public")));

const EXTERNAL_BASE = process.env.EXTERNAL_API_BASE || "https://billing.kravy.in/api/external";
const SECRET_KEY = process.env.SCRAPER_SECRET_KEY || "kravy_scraper_secret_2026";

/**
 * 🍔 LIST FOODS
 */
app.get("/api/foods", async (req, res) => {
  const { userId } = req.query;
  const where = userId ? { userId: userId as string } : {};
  const foods = await prisma.foodImage.findMany({ 
    where,
    orderBy: { createdAt: "desc" } 
  });
  res.json(foods);
});

/**
 * ⚡ SINGLE ITEM SYNC
 */
app.post("/api/scrape-single", async (req, res) => {
  const { dish, userId, externalId } = req.body;
  try {
    const record = await scrapeAndSaveFood(dish, userId);
    if (record && record.cloudinaryUrl) {
      if (externalId) {
        await axios.patch(`${EXTERNAL_BASE}/menu/update/${externalId}`, { 
          imageUrl: record.cloudinaryUrl 
        }, { headers: { "x-scraper-secret": SECRET_KEY }, timeout: 5000 });
      }
      return res.json({ success: true, url: record.cloudinaryUrl, record });
    }
    res.status(404).json({ success: false, error: "No image found" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 🔄 RE-SCRAPE API
 */
app.post("/api/rescrape/:id", async (req, res) => {
  try {
    const record = await prisma.foodImage.findUnique({ where: { id: req.params.id as string } });
    if (!record) return res.status(404).json({ error: "Dish not found" });
    
    console.log(`\n🔄 MANUAL RE-SCRAPE TRIGGERED: ${record.foodName}`);
    const updated = await scrapeAndSaveFood(record.foodName, record.userId, true); // Force = true
    
    if(!updated) throw new Error("Scraper failed to produce a result");
    res.json(updated);
  } catch (error: any) {
    console.error(`❌ RE-SCRAPE FAILED: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 📤 MANUAL UPLOAD
 */
app.post("/api/upload-manual/:id", upload.single("image"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: "No image provided" });
    const record = await prisma.foodImage.findUnique({ where: { id: req.params.id as string } });
    if (!record) return res.status(404).json({ error: "Dish not found" });

    const result = await cloudinary.uploader.upload(file.path, {
        folder: "manual-uploads",
        public_id: `${record.foodName.toLowerCase().replace(/\s+/g, '-')}-manual`
    });

    const updated = await prisma.foodImage.update({
        where: { id: record.id },
        data: { cloudinaryUrl: result.secure_url, isManual: true, confidence: 100, status: "completed" }
    });
    res.json({ success: true, url: result.secure_url, updated });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 🌉 EXTERNAL BRIDGE
 */
app.get("/api/external-users", async (req, res) => {
  try {
    const response = await axios.get(`${EXTERNAL_BASE}/users`, { headers: { "x-scraper-secret": SECRET_KEY } });
    res.json(response.data);
  } catch (e) { res.status(500).json({ error: "Billing server unreachable" }); }
});

app.get("/api/external-menu/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    // 1. Fetch current "Pending" items from Billing Server
    const response = await axios.get(`${EXTERNAL_BASE}/menu/${userId}`, { headers: { "x-scraper-secret": SECRET_KEY } });
    const externalPending = response.data; // Items that need images

    // 2. Fetch "Completed" items from our Local Cache/DB
    const localCompleted = await prisma.foodImage.findMany({
      where: { userId, status: "completed" }
    });

    // 3. Return Merged View
    // We send both so frontend can show "Queue" vs "History" or a unified list
    res.json({
      pending: externalPending,
      completed: localCompleted,
      stats: {
        totalPending: externalPending.length,
        totalCompleted: localCompleted.length
      }
    });
  } catch (e) { res.status(500).json({ error: "Billing server unreachable" }); }
});

/**
 * 🚀 JOBS
 */
app.post("/api/scrape-external", async (req, res) => {
  const { userId } = req.body;
  const job = await queueManager.addJob(userId);
  res.json({ success: true, jobId: job.id });
});

app.get("/api/jobs", async (req, res) => {
  const jobs = await queueManager.getJobs();
  res.json(jobs);
});

app.post("/api/cancel-job/:jobId", async (req, res) => {
  try {
    const job = await prisma.scraperJob.update({
      where: { id: req.params.jobId as string },
      data: { status: "failed", error: "Cancelled by User" }
    });
    res.json({ message: "Job cancelled successfully!", job });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to cancel job" });
  }
});

/**
 * 🗑️ JOB MANAGEMENT: Remove specific job
 */
app.delete("/api/jobs/:id", async (req, res) => {
  try {
    await prisma.scraperJob.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: "Job trashed! 🗑️" });
  } catch (e) {
    res.status(500).json({ error: "Job already gone or error." });
  }
});

/**
 * 💥 JOB MANAGEMENT: Clear ALL history
 */
app.delete("/api/jobs/clear-all", async (req, res) => {
  try {
    await prisma.scraperJob.deleteMany({});
    res.json({ success: true, message: "History Purged! 🌊" });
  } catch (e) {
    res.status(500).json({ error: "Clear failed." });
  }
});

/**
 * 🔄 JOB MANAGEMENT: Retry a failed/stuck job
 */
app.post("/api/jobs/retry/:id", async (req, res) => {
  try {
    const job = await prisma.scraperJob.update({
      where: { id: req.params.id },
      data: { status: "queued", error: null }
    });
    // Trigger worker
    queueManager.processQueue();
    res.json({ success: true, message: "Job re-queued! 🚀" });
  } catch (e) {
    res.status(500).json({ error: "Retry failed." });
  }
});

app.get("/api/test-scraper", async (req, res) => {
  try {
    console.log("🧪 DIAGNOSTICS: Starting AI Engine test...");
    const { scrapeFoodImages } = await import("./scraper/index.js");
    const testResult = await scrapeFoodImages("Cold Coffee");
    
    if (testResult.success) {
      return res.json({
        status: "HEALTHY 🟢",
        engine: "Puppeteer Stealth",
        discovery: "Success",
        sampleItems: testResult.candidates.length,
        environment: process.env.NODE_ENV || "production"
      });
    } else {
      throw new Error(testResult.error || "Scraper returned 0 candidates.");
    }
  } catch (error: any) {
    console.error("❌ DIAGNOSTICS FAILED:", error.message);
    res.status(500).json({ 
      status: "UNHEALTHY 🔴", 
      error: error.message,
      tip: "Ensure 'Puppeteer Buildpack' or Chrome is available on Render." 
    });
  }
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`\n🔱 KRAVY DASHBOARD: Running on http://localhost:${PORT}`);
});

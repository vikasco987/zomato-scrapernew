import express from "express";
import path from "path";
import cors from "cors";
import { prisma } from "./db/index.js";
import { scrapeAndUpdateExternalMenu } from "./services/externalScraper.js";
import { queueManager } from "./lib/queueManager.js";

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// 🗂️ Serve Static Files (Dashboard + Local Images)
app.use(express.static("public"));
app.use("/images", express.static("images"));

/**
 * 📊 PRO DASHBOARD API (The missing link!)
 * Provides real-time JSON data to the Frontend gallery.
 */
app.get("/api/foods", async (req, res) => {
  try {
    const foods = await prisma.foodImage.findMany({
      orderBy: { updatedAt: "desc" },
    });
    
    if (foods.length > 0) {
      console.log("🔍 DIAGNOSTIC: Keys of first record:", Object.keys(foods[0]));
      console.log("🔍 DIAGNOSTIC: cloudinaryUrl of first record:", (foods[0] as any).cloudinaryUrl);
    }

    res.json(foods);
  } catch (error: any) {
    console.error("❌ API Error:", error.message);
    res.status(500).json({ error: "Failed to fetch data from MongoDB" });
  }
});

/**
 * 🔍 EXTERNAL MENU FETCH API
 * Fetches the current menu from the external system before scraping.
 */
app.get("/api/external-menu/:userId", async (req, res) => {
  const { userId } = req.params;
  const EXTERNAL_BASE = process.env.EXTERNAL_API_BASE || "https://billing.kravy.in/api/external";
  const SECRET_KEY = process.env.SCRAPER_SECRET_KEY || "kravy_scraper_secret_2026";
  
  try {
    const response = await fetch(`${EXTERNAL_BASE}/menu/${userId}`, {
      headers: { "x-scraper-secret": SECRET_KEY }
    });
    const items = await response.json();
    res.json(items);
  } catch (error: any) {
    console.error("❌ External Fetch Error:", error.message);
    res.status(500).json({ error: "Failed to fetch menu from external system" });
  }
});

/**
 * 👥 EXTERNAL USERS LIST API
 * Fetches all active restaurants/users from billing.kravy.in.
 */
app.get("/api/external-users", async (req, res) => {
  const EXTERNAL_BASE = process.env.EXTERNAL_API_BASE || "https://billing.kravy.in/api/external";
  const SECRET_KEY = process.env.SCRAPER_SECRET_KEY || "kravy_scraper_secret_2026";
  
  try {
    const response = await fetch(`${EXTERNAL_BASE}/users`, {
      headers: { "x-scraper-secret": SECRET_KEY }
    });
    const users = await response.json();
    res.json(users);
  } catch (error: any) {
    console.error("❌ User List Fetch Error:", error.message);
    res.status(500).json({ error: "Failed to fetch user list" });
  }
});

/**
 * 🔍 EXTERNAL MENU FETCH API
 * Add a scraping job to the persistent queue.
 */
app.post("/api/scrape-external", async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: "userId is required" });

  try {
    const job = await queueManager.addJob(userId);
    res.json({ message: "Job Queued Successfully!", jobId: job.id });
  } catch (error: any) {
    console.error("❌ Queue Error:", error.message);
    res.status(500).json({ error: "Failed to queue job" });
  }
});

/**
 * 📊 JOB STATUS API
 */
app.get("/api/job-status/:jobId", async (req, res) => {
  try {
    const job = await prisma.scraperJob.findUnique({
      where: { id: req.params.jobId }
    });
    if (!job) return res.status(404).json({ error: "Job not found" });
    res.json(job);
  } catch (error: any) {
    res.status(500).json({ error: "Failed to fetch job status" });
  }
});

/**
 * 🛑 CANCEL JOB API
 */
app.post("/api/cancel-job/:jobId", async (req, res) => {
  try {
    const job = await prisma.scraperJob.update({
      where: { id: req.params.jobId },
      data: { status: "failed", error: "Cancelled by User" }
    });
    res.json({ message: "Job cancelled successfully!", job });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to cancel job" });
  }
});

/**
 * 🛰️ ALL JOBS API
 * Returns all recent scraping jobs.
 */
app.get("/api/jobs", async (req, res) => {
  try {
    const jobs = await prisma.scraperJob.findMany({
      orderBy: { createdAt: "desc" }
    });
    res.json(jobs);
  } catch (error: any) {
    res.status(500).json({ error: "Failed to fetch jobs" });
  }
});

/**
 * 🎨 MAIN DASHBOARD (Fallback)
 */
app.get("/", (req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`\n🚀 ULTIMATE PRO DASHBOARD ACTIVE: http://localhost:${PORT}`);
  console.log(`📈 API Endpoint: http://localhost:${PORT}/api/foods\n`);
});

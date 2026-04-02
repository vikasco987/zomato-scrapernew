import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { createServer } from "http";
import { Server as SocketServer } from "socket.io";
import { prisma } from "./db/index.js";
import { startStabilityTracker } from "./lib/stability-cron.js";
import { queueManager } from "./lib/queueManager.js";
import { scrapeZomatoMenu } from "./menu-scraper/zomato.js";
import { syncMenuDirect } from "./menu-scraper/direct-api.js";
import { initSocket, emitUpdate } from "./lib/socket.js";
import { isUrlAlive } from "./lib/image-validator.js";
import { runZomatoUploadBot, runSingleItemUploadBot } from "./lib/zomato-bot.js";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = initSocket(httpServer);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

// --- CLOUDINARY CONFIG ---
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "digpvlfup",
  api_key: process.env.CLOUDINARY_API_KEY || "895312762269925",
  api_secret: process.env.CLOUDINARY_API_SECRET || "s2jIsM57m_x2Ww2D23p4VjYpXoQ"
});

const storage = multer.memoryStorage();
const upload = multer({ storage });

/**
 * 🌉 BRIDGE SYSTEM: Fetch User Data from Billing
 */
app.get("/api/external-users", async (req, res) => {
  const EXTERNAL_BASE = process.env.EXTERNAL_API_BASE || "https://billing.kravy.in/api/external";
  const SECRET_KEY = process.env.SCRAPER_SECRET_KEY || "kravy_scraper_secret_2026";
  
  try {
    const response = await fetch(`${EXTERNAL_BASE}/users`, {
      headers: { "x-scraper-secret": SECRET_KEY }
    });
    const users = await response.json();
    
    // Also include local restaurants so user can sync them too
    const localRestaurants = await prisma.restaurant.findMany();
    const formattedLocal = localRestaurants.map(r => ({
        id: r.id,
        name: r.name,
        isLocal: true,
        missingImages: 0 // Will be calculated in menu view
    }));

    res.json([...users, ...formattedLocal]);
  } catch (e) { 
    // Fallback if billing server is down
    const localRestaurants = await prisma.restaurant.findMany();
    res.json(localRestaurants.map(r => ({ id: r.id, name: r.name, isLocal: true })));
  }
});

app.get("/api/external-menu/:userId", async (req, res) => {
  const { userId } = req.params;
  const EXTERNAL_BASE = process.env.EXTERNAL_API_BASE || "https://billing.kravy.in/api/external";
  const SECRET_KEY = process.env.SCRAPER_SECRET_KEY || "kravy_scraper_secret_2026";

  try {
    let externalItems = [];
    
    // Check if it's a local restaurant ID first
    const localResto = await prisma.restaurant.findUnique({ where: { id: userId } });
    if (localResto) {
        externalItems = await prisma.menuItem.findMany({ where: { restaurantId: userId } });
    } else {
        const response = await fetch(`${EXTERNAL_BASE}/menu/${userId}`, {
            headers: { "x-scraper-secret": SECRET_KEY }
        });
        externalItems = await response.json();
    }

    const localCompleted = await prisma.foodImage.findMany({
      where: { userId, status: "completed" }
    });

    const pendingWithImages = externalItems.map((i: any) => {
      const match = localCompleted.find(lc => lc.foodName.toLowerCase() === (i.name || i.foodName || "").toLowerCase());
      if (match && match.cloudinaryUrl) {
          return { ...i, imageUrl: match.cloudinaryUrl, _isLocalMatch: true };
      }
      return i;
    });

    const pending = pendingWithImages.filter((i: any) => !i.imageUrl && !(i.image || i.cloudinaryUrl));
    const completed = pendingWithImages.filter((i: any) => i.imageUrl || i.image || i.cloudinaryUrl);

    res.json({
      pending: pending,
      completed: completed,
      stats: {
        totalPending: pending.length,
        totalCompleted: completed.length,
        totalMenu: externalItems.length
      }
    });
  } catch (e: any) { 
    res.json({ pending: [], completed: [], stats: { totalPending: 0, totalCompleted: 0 } }); 
  }
});

app.post("/api/scrape-external", async (req, res) => {
    const { userId } = req.body;
    if(!userId) return res.status(400).json({ error: "User ID required" });
    
    // Get item count for the job record
    let count = 0;
    const localResto = await prisma.restaurant.findUnique({ where: { id: userId } });
    if (localResto) {
        count = await prisma.menuItem.count({ where: { restaurantId: userId } });
    } else {
        // Just a placeholder, queueManager will update it during execution
        count = 0;
    }

    const job = await queueManager.addJob(userId, count);
    res.json({ success: true, jobId: job.id });
});

/**
 * 🚜 ZOMATO IMPORT HUB Logic
 */
app.post("/api/sync-menu", async (req, res) => {
    const { url } = req.body;
    if(!url) return res.status(400).json({ error: "URL Required" });
    
    const { emitUpdate } = (await import("./lib/socket.js"));
    console.log(`🚜 [Scraper Console] Initiating: ${url}`);
    
    try {
        emitUpdate('scraper:log', { message: `🚜 LAUNCHING HEADLESS BROWSER...`, status: 'primary' });
        emitUpdate('scraper:log', { message: `🌐 TARGET: ${url}`, status: 'primary' });
        
        const menuData = await scrapeZomatoMenu(url);
        
        emitUpdate('scraper:log', { message: `✅ EXTRACTION SUCCESSFUL: Found ${menuData.restaurant?.name}`, status: 'success' });
        emitUpdate('scraper:log', { message: `📊 ITEMS DISCOVERED: ${menuData.itemsCount}`, status: 'success' });

        // Dispatch to background queue for images - PASS REAL ID AND COUNT
        const job = await queueManager.addJob(menuData.restaurant?.id || "unknown", menuData.itemsCount);
        
        emitUpdate('scraper:log', { message: `🚢 SYNC JOB DISPATCHED [ID: ${job.id}]`, status: 'primary' });
        res.json({ success: true, jobId: job.id, data: menuData });
    } catch(e: any) {
        console.error(`❌ SCRAPER FAILED: ${e.message}`);
        emitUpdate('scraper:log', { message: `❌ IMPORT FAILED: ${e.message}`, status: 'error' });
        res.status(500).json({ error: e.message });
    }
});

app.post("/api/sync-direct", async (req, res) => {
    const { url } = req.body;
    if(!url) return res.status(400).json({ error: "URL Required" });
    
    console.log(`📡 [Direct API Hub] Initiating: ${url}`);
    
    try {
        emitUpdate('scraper:log', { message: `📡 [DIRECT-API] CONNECTING TO TARGET GATEWAY...`, status: 'primary' });
        emitUpdate('scraper:log', { message: `🌐 [DIRECT-API] TARGET: ${url}`, status: 'primary' });
        
        const result = await syncMenuDirect(url);
        
        emitUpdate('scraper:log', { message: `✅ [DIRECT-API] SYNC FINISHED: Found ${result.restaurant?.name}`, status: 'success' });
        emitUpdate('scraper:log', { message: `📊 [DIRECT-API] ITEMS SAVED: ${result.itemsCount}`, status: 'success' });

        res.json(result);
    } catch(e: any) {
        console.error(`❌ [DIRECT-API] FAILED: ${e.message}`);
        emitUpdate('scraper:log', { message: `❌ [DIRECT-API] FAILED: ${e.message}`, status: 'error' });
        res.status(500).json({ error: e.message });
    }
});

app.get("/api/jobs", async (req, res) => {
    res.json(await queueManager.getJobs());
});

app.delete("/api/jobs/:id", async (req, res) => {
    await prisma.scraperJob.delete({ where: { id: req.params.id } });
    res.json({ success: true });
});

app.post("/api/force-score/:id", async (req, res) => {
    const { id } = req.params;
    console.log(`⚡ [Force Score] Initiating Deep Test for Resto: ${id}`);
    
    emitUpdate('scraper:log', { message: `⚡ INITIATING DEEP SCAN FOR RESTO: ${id}`, status: 'primary' });
    
    const items = await prisma.menuItem.findMany({ where: { restaurantId: id } });
    let approved = 0;
    let checked = 0;

    // Process in parallel with a concurrency limit
    const CHUNK_SIZE = 10;
    for(let i = 0; i < items.length; i += CHUNK_SIZE) {
        const chunk = items.slice(i, i + CHUNK_SIZE);
        await Promise.all(chunk.map(async (item) => {
            if(!item.image) return;
            const alive = await isUrlAlive(item.image);
            if(alive) {
                await prisma.menuItem.update({
                    where: { id: item.id },
                    data: { stabilityStatus: 'STABLE', updatedAt: new Date() }
                });
                approved++;
            }
            checked++;
        }));
        emitUpdate('scraper:log', { message: `🔍 SCANNED ${checked}/${items.length} ITEMS...`, status: 'primary' });
    }
    
    emitUpdate('scraper:log', { message: `✅ DEEP TEST COMPLETE. PROMOTED ${approved} ASSETS TO VERIFIED HUB.`, status: 'success' });
    res.json({ success: true, approved });
});

app.post("/api/auto-upload", async (req, res) => {
    const { sourceId, targetId } = req.body;
    console.log(`🤖 [Auto-Upload] Mapping: ${sourceId} -> ${targetId}`);
    
    // Background the bot run with mapped IDs
    runZomatoUploadBot(sourceId, targetId).catch(err => {
        console.error(`🚨 [Auto-Upload] Mapping Failed: ${err.message}`);
    });
    
    res.json({ success: true, message: `Deployment Mapped: ${sourceId} -> ${targetId}` });
});

app.post("/api/auto-upload-single", async (req, res) => {
    const { targetId, name, price, desc } = req.body;
    console.log(`🤖 [Auto-Upload-Single] Pushing: ${name} (₹${price}) -> ${targetId}`);
    
    // Background the bot run for a single item
    runSingleItemUploadBot(targetId, { name, price, description: desc }).catch((err: any) => {
        console.error(`🚨 [Auto-Upload-Single] Push Failed: ${err.message}`);
    });
    
    res.json({ success: true, message: `Single Asset Queued: ${name} -> ${targetId}` });
});

app.get("/api/best-assets", async (req, res) => {
    const assets = await prisma.menuItem.findMany({
        where: { 
            stabilityStatus: "STABLE",
            image: { not: null }
        },
        orderBy: { updatedAt: 'desc' },
        take: 100
    });
    res.json(assets);
});

app.get("/api/zomato-items", async (req, res) => {
    // Returns all items tagged with source 'zomato' or that have been uploaded
    const items = await prisma.menuItem.findMany({
        where: { 
            OR: [
                { source: 'zomato' },
                { uploadedAt: { not: null } }
            ]
        },
        orderBy: { updatedAt: 'desc' },
        take: 50,
        include: { restaurant: true }
    });
    res.json(items);
});

app.post("/api/verify-zomato/:id", async (req, res) => {
    const { id } = req.params;
    // Mocking verification logic for now. In a real scenario, this would call Zomato API 
    // or use Puppeteer to check the item status on the partner portal.
    const item = await prisma.menuItem.findUnique({ where: { id } });
    if (!item) return res.status(404).json({ error: "Item not found" });

    // Simulate verification process
    const isApproved = Math.random() > 0.3; // 70% chance of approval for demo
    const status = isApproved ? 'LIVE' : 'REJECTED';

    const updated = await prisma.menuItem.update({
        where: { id },
        data: { 
            stabilityStatus: status,
            updatedAt: new Date()
        }
    });

    emitUpdate('zomato:update', updated);
    res.json(updated);
});

httpServer.listen(3005, () => {
    console.log("\n🔱 KRAVY DASHBOARD LIVE ON PORT 3005");
    startStabilityTracker(); // Start Guardian Monitor
});

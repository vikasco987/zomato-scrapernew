import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { MongoClient, ObjectId } from "mongodb";
import bcrypt from "bcryptjs";
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
import axios from "axios";
import ExcelJS from "exceljs";

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
    
    // Normalize users to ensure they have an 'id' that the frontend can use
    const normalizedUsers = users.map((u: any) => ({
        ...u,
        id: u.id || u.clerkId || (u._id?.$oid) || u._id
    }));
    
    console.log(`🌉 [Bridge] Fetched ${normalizedUsers.length} external users.`);
    const shepabi = normalizedUsers.find((u: any) => (u.name || "").includes("SHEPABI"));
    if (shepabi) {
        console.log(`✅ [Bridge] SHEPABI found in normalization: ${shepabi.id}`);
    } else {
        console.log(`❌ [Bridge] SHEPABI NOT found in normalization!`);
    }
    
    // Also include local restaurants so user can sync them too
    const localRestaurants = await prisma.restaurant.findMany();
    const formattedLocal = localRestaurants.map(r => ({
        id: r.id,
        name: r.name,
        isLocal: true,
        missingImages: 0 // Will be calculated in menu view
    }));

    const combined = [...normalizedUsers, ...formattedLocal].sort((a, b) => 
        (a.name || "").toLowerCase().localeCompare((b.name || "").toLowerCase())
    );

    res.json(combined);
  } catch (e) { 
    // Fallback if billing server is down
    const localRestaurants = await prisma.restaurant.findMany();
    const fallback = localRestaurants.map(r => ({ id: r.id, name: r.name, isLocal: true }))
        .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    
    res.json(fallback);
  }
});

app.get("/api/external-menu/:userId", async (req, res) => {
  const { userId } = req.params;
  const EXTERNAL_BASE = process.env.EXTERNAL_API_BASE || "https://billing.kravy.in/api/external";
  const SECRET_KEY = process.env.SCRAPER_SECRET_KEY || "kravy_scraper_secret_2026";

  try {
    let externalItems = [];
    
    // 🛡️ Validate if userId is a valid MongoDB ObjectId
    const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(userId);
    
    if (isValidObjectId) {
        const localResto = await prisma.restaurant.findUnique({ where: { id: userId } });
        if (localResto) {
            externalItems = await prisma.menuItem.findMany({ where: { restaurantId: userId } });
        }
    }

    // If no local items found, fetch from external billing
    if (externalItems.length === 0) {
        const response = await fetch(`${EXTERNAL_BASE}/menu/${userId}`, {
            headers: { "x-scraper-secret": SECRET_KEY }
        });
        externalItems = await response.json();
    }

    const localCompleted = await prisma.foodImage.findMany({
      where: { userId, status: "completed" }
    });

    const pendingWithImages = externalItems.map((i: any) => {
      const rawName = i.name || i.foodName || "";
      const cleanedName = rawName.replace(/\(.*\)|\[.*\]|\d+\s*ml|\d+\s*lit/gi, "").trim();
      const match = localCompleted.find(lc => lc.foodName.toLowerCase() === cleanedName.toLowerCase() || lc.foodName.toLowerCase() === rawName.toLowerCase());
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
    try {
        const { userId } = req.body;
        if(!userId) return res.status(400).json({ error: "User ID required" });
        
        let count = 0;
        const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(userId);

        if (isValidObjectId) {
            try {
                const localResto = await (prisma as any).restaurant.findUnique({ where: { id: userId } });
                if (localResto) {
                    count = await (prisma as any).menuItem.count({ where: { restaurantId: userId } });
                }
            } catch (dbErr: any) {
                console.error(`[Server DB Error] findUnique/count failed: ${dbErr.message}`);
            }
        } else {
            // 🌍 Fetch count from External Billing for atomic UI progress
            try {
                const EXTERNAL_BASE = process.env.EXTERNAL_API_BASE || "https://billing.kravy.in/api/external";
                const fetchRes = await fetch(`${EXTERNAL_BASE}/menu/${userId}`, {
                    headers: { "x-scraper-secret": process.env.SCRAPER_SECRET_KEY || "kravy_scraper_secret_2026" }
                });
                const items: any = await fetchRes.json();
                
                if (Array.isArray(items)) {
                    count = items.length;
                } else if (items && typeof items === 'object') {
                    // Handle { pending: [], completed: [] } format
                    const pendingCount = Array.isArray(items.pending) ? items.pending.length : 0;
                    const completedCount = Array.isArray(items.completed) ? items.completed.length : 0;
                    count = pendingCount + completedCount;
                }
            } catch (err: any) {
                console.error(`[Bridge Count Fetch] Failed: ${err.message}`);
            }
        }

        const job = await queueManager.addJob(userId, count);
        res.json({ success: true, jobId: job.id });
    } catch (e: any) {
        console.error(`🚨 [Scraper Bridge] Failed to Queue Job: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

import { scrapeLeads } from './services/leadScraper.js';

app.post("/api/scrape-leads", (req, res) => {
    try {
        const { location, source } = req.body;
        if (!location || !source) {
            return res.status(400).json({ error: "Location and Source are required." });
        }
        
        // Start Scraping in Background
        scrapeLeads(location, source.toLowerCase()).catch(err => {
            console.error(`🚨 [Background Scraper] Job Failed: ${err.message}`);
        });
        
        res.json({ success: true, message: "Scraping started in background" });
    } catch (e: any) {
        console.error(`🚨 [Lead Scraper] Error: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

app.get("/api/leads/export", async (req, res) => {
    try {
        // Fetch all leads from the database
        const leads = await (prisma as any).restaurantLead.findMany({
            orderBy: { createdAt: 'desc' }
        });
        res.json(leads);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.get("/api/leads/history", async (req, res) => {
    try {
        const history = await (prisma as any).scrapingSession.findMany({
            orderBy: { createdAt: 'desc' }
        });
        res.json(history);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.get("/api/leads/session/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const leads = await (prisma as any).restaurantLead.findMany({
            where: { sessionId: id },
            orderBy: { createdAt: 'desc' }
        });
        res.json(leads);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
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
    
    // 🛡️ Guard against malformed ObjectID
    const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(id);
    if (!isValidObjectId) {
      return res.json({ success: true, approvedCount: 0, totalChecked: 0, message: "External ID skipped" });
    }

    const items = await (prisma as any).menuItem.findMany({ where: { restaurantId: id } });
    let approved = 0;
    let checked = 0;

    // Process in parallel with a concurrency limit
    const CHUNK_SIZE = 10;
    for(let i = 0; i < items.length; i += CHUNK_SIZE) {
        const chunk = items.slice(i, i + CHUNK_SIZE);
        await Promise.all(chunk.map(async (item: any) => {
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

app.get("/api/foods", async (req, res) => {
    try {
        const foods = await prisma.foodImage.findMany({
            orderBy: { updatedAt: 'desc' },
            take: 100
        });
        res.json(foods);
    } catch (e) {
        res.status(500).json({ error: "Failed to fetch food images" });
    }
});

app.get("/api/best-assets", async (req, res) => {
    const assets = await (prisma as any).menuItem.findMany({
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

// --- INDIVIDUAL ASSET CONTROLS ---

app.post("/api/rescrape/:id", async (req, res) => {
    const { id } = req.params;
    const { scrapeAndSaveFood } = await import("./index.js");

    try {
        const food = await prisma.foodImage.findUnique({ where: { id: id as string } });
        if (!food) return res.status(404).json({ error: "Asset not found" });

        console.log(`⚡ [Re-scrape] Forcing update for: ${food.foodName}`);
        const updated = await scrapeAndSaveFood(food.foodName, food.userId, true);
        res.json(updated);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post("/api/upload-manual/:id", upload.single('image'), async (req, res) => {
    const { id } = req.params;
    if (!req.file) return res.status(400).json({ error: "No image uploaded" });

    try {
        const food = await prisma.foodImage.findUnique({ where: { id: id as string } });
        if (!food) return res.status(404).json({ error: "Asset not found" });

        console.log(`📤 [Manual Upload] Updating asset: ${food.foodName}`);

        // Upload buffer to Cloudinary
        const result = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
                { folder: "food-menu", public_id: `${food.foodName.replace(/\s+/g, '-')}-${Date.now()}` },
                (error, result) => {
                    if (error) reject(error);
                    else resolve(result);
                }
            );
            stream.end(req.file?.buffer);
        });

        const cdnUrl = (result as any).secure_url;

        const updated = await prisma.foodImage.update({
            where: { id: id as string },
            data: { 
                cloudinaryUrl: cdnUrl, 
                status: "completed", 
                isManual: true,
                updatedAt: new Date() 
            }
        });

        res.json({ success: true, url: cdnUrl });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post("/api/verify-zomato/:id", async (req, res) => {
    const { id } = req.params;
    
    // 🛡️ Guard against malformed ObjectID (Internal Items Only)
    const isValidId = /^[0-9a-fA-F]{24}$/.test(id);
    if (!isValidId) return res.status(400).json({ error: "Invalid Item ID format" });

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

// --- MULTIMODAL MENU AI OCR ENGINE ---
app.post("/api/menu/upload-ocr", upload.single("menuFile"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No menu file uploaded." });
        }

        const apiKey = process.env.GOOGLE_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: "GOOGLE_API_KEY is not configured in the server's .env file." });
        }

        const fileBuffer = req.file.buffer;
        const mimeType = req.file.mimetype;
        const base64Data = fileBuffer.toString("base64");

        console.log(`📡 [Menu AI OCR Engine] Processing uploaded file: Name = ${req.file.originalname}, Mime = ${mimeType}, Size = ${fileBuffer.length} bytes`);

        // Fallback models to try in case of 503 or 429 quota limits
        const modelsToTry = [
            "gemini-2.0-flash",
            "gemini-2.5-flash",
            "gemini-2.5-flash-lite",
            "gemini-2.0-flash-lite",
            "gemini-3.5-flash"
        ];

        const prompt = `
You are a highly advanced AI system designed to digitize restaurant menus from images and PDFs with elite precision.
Your job is to read this menu document and extract EVERY single item with 100% precision.

Also, please search the top/header/footer of the document to extract the restaurant contact details if present:
- Restaurant Name
- Address
- Timings
- Phone number

Please return a structured JSON response matching the following structure:
{
  "restaurantName": "Name of the restaurant (or a default name based on the menu like 'AI Scraped Restaurant' if not found)",
  "address": "Restaurant address if found (or 'Delhi NCR' if not found)",
  "timings": "Timings if found (or '11:00 AM - 11:00 PM' if not found)",
  "phone": "Phone number if found (or '+91 99999 99999' if not found)",
  "menu": [
    {
      "category": "Logical Category Name (e.g. Dal & Lentils, Paneer Items, Rice, Roti & Parantha, Veg Specials, Egg Specials, Chicken Specials, Breads, Raita, Desserts, Beverages)",
      "name": "Formatted Item Name, e.g. 'Paneer Tikka (V) (F)' or 'Butter Chicken (NV) (H)'. ALWAYS add the (V) or (NV) badge after the dish name, followed by its size code in brackets: (H) Half, (M) Medium, (F) Full, (R) Regular, (L) Large.",
      "price": 250, // Extract the price as a number. Crucial: If one item has multiple sizes/prices (e.g. Half 150 / Full 280), you MUST create a SEPARATE row for each size in this list.
      "type": "Pure Veg", // Veg items MUST be 'Pure Veg'. Chicken/mutton/fish/meat MUST be 'Non-Veg'. Egg items MUST be 'Non-Veg (Egg)'.
      "description": "A unique, highly attractive, gourmet 1-line description for this individual row. Crucial: Every single row must have a completely unique description. No two descriptions must be identical, even for different sizes of the same dish!"
    }
  ]
}

Strictly follow these rules:
1. Return ONLY the raw JSON object inside the JSON block. Do not add any conversational text or explanation.
2. Group items under correct logical categories.
3. Normalize all spelling and format.
4. Ensure the output is valid JSON.
5. TRANSLATE & TRANSLITERATE TO ENGLISH: If the menu contains Hindi script (Devanagari, e.g. 'रोटी', 'दाल मखनी', 'चाय') or any other regional/non-English language, you MUST translate or transliterate it strictly to standard English alphabet characters (e.g. 'Roti', 'Dal Makhani', 'Chai'). Do NOT output Devanagari/Hindi characters or regional script. Every single word in 'restaurantName', 'category', 'name', and 'description' MUST consist strictly of plain English text, numbers, standard spaces, brackets, and punctuation. Do not use special characters or Hindi scripts, as thermal printers fail to print them and customer software displays require standard English text.
`;

        let textResponse = "";
        let selectedModel = "";
        let lastError: any = null;

        for (const model of modelsToTry) {
            try {
                console.log(`🤖 [Menu AI OCR Engine] Trying model: ${model}...`);
                const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

                const response = await axios.post(geminiUrl, {
                    contents: [
                        {
                            parts: [
                                { text: prompt },
                                {
                                    inlineData: {
                                        mimeType: mimeType,
                                        data: base64Data
                                    }
                                }
                            ]
                        }
                    ],
                    generationConfig: {
                        responseMimeType: "application/json"
                    }
                });

                textResponse = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (textResponse) {
                    selectedModel = model;
                    console.log(`✅ [Menu AI OCR Engine] Successfully retrieved response using model: ${selectedModel}`);
                    break;
                }
            } catch (err: any) {
                const errMsg = err.response?.data?.error?.message || err.message;
                console.warn(`⚠️ [Menu OCR AI Engine] Model ${model} failed: ${errMsg}`);
                lastError = err;
            }
        }

        if (!textResponse) {
            const finalErrorMsg = lastError?.response?.data || lastError?.message || "No response content from any Gemini OCR model.";
            console.error("🚨 [Menu OCR AI Engine] All models failed in fallback chain.");
            throw new Error(`All Gemini OCR models failed or exceeded quota. Last error: ${JSON.stringify(finalErrorMsg)}`);
        }

        // Parse returned JSON from Gemini
        const parsedMenu = JSON.parse(textResponse);
        console.log(`✅ [Menu AI OCR Engine] Extracted ${parsedMenu.menu?.length || 0} items successfully for ${parsedMenu.restaurantName} using model ${selectedModel}!`);
        res.json({ 
            success: true, 
            restaurantName: parsedMenu.restaurantName || "AI Scraped Restaurant",
            address: parsedMenu.address || "Delhi NCR",
            timings: parsedMenu.timings || "11:00 AM - 11:00 PM",
            phone: parsedMenu.phone || "+91 99999 99999",
            menu: parsedMenu.menu || [] 
        });

    } catch (e: any) {
        console.error("🚨 [Menu OCR AI Engine] Failed:", e.response?.data || e.message);
        res.status(500).json({ error: e.message, details: e.response?.data || null });
    }
});

// --- ELITE FORMATTED EXCEL EXPORTER ENGINE ---
app.post("/api/menu/export-formatted", async (req, res) => {
    try {
        const { restaurantName, address, timings, phone, menu } = req.body;
        console.log(`📊 [Formatted Menu Builder] Building premium sheet for: ${restaurantName}`);

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet("Menu Sheet", {
            views: [{ state: 'frozen', ySplit: 5 }] // Freeze top 5 rows (Title + Header)
        });

        // 1. Restaurant Title & Info Rows (Rows 1 to 4)
        worksheet.mergeCells('A1:E1');
        const rNameCell = worksheet.getCell('A1');
        rNameCell.value = (restaurantName || "AI SCRAPED RESTAURANT").toUpperCase();
        rNameCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
        rNameCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF333333' } }; // Dark carbon for title
        rNameCell.alignment = { horizontal: 'center', vertical: 'middle' };

        worksheet.mergeCells('A2:E2');
        const rAddressCell = worksheet.getCell('A2');
        rAddressCell.value = `📍 Address: ${address || "Delhi NCR"}`;
        rAddressCell.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FFFFFFFF' } };
        rAddressCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF333333' } };
        rAddressCell.alignment = { horizontal: 'center', vertical: 'middle' };

        worksheet.mergeCells('A3:E3');
        const rDetailsCell = worksheet.getCell('A3');
        rDetailsCell.value = `🕒 Timings: ${timings || "11:00 AM - 11:00 PM"}   |   📞 Contact: ${phone || "+91 99999 99999"}`;
        rDetailsCell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        rDetailsCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF333333' } };
        rDetailsCell.alignment = { horizontal: 'center', vertical: 'middle' };

        // Row heights for header title block
        worksheet.getRow(1).height = 32;
        worksheet.getRow(2).height = 20;
        worksheet.getRow(3).height = 20;
        worksheet.getRow(4).height = 10; // Empty spacer row

        // 2. Main Columns Headers (Row 5)
        const headers = ["Item Name", "Price (₹)", "Category", "Type", "Description"];
        worksheet.getRow(5).values = headers;
        worksheet.getRow(5).height = 30;

        // Header Styling
        const headerRow = worksheet.getRow(5);
        headerRow.eachCell((cell: any) => {
            cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF800000' } }; // Dark red header row
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.border = {
                top: { style: 'thin', color: { argb: 'FF595959' } },
                left: { style: 'thin', color: { argb: 'FF595959' } },
                bottom: { style: 'medium', color: { argb: 'FF000000' } },
                right: { style: 'thin', color: { argb: 'FF595959' } }
            };
        });

        // 3. Populate Data Rows (Row 6 onwards)
        const items = menu || [];
        items.forEach((item: any, idx: number) => {
            const rowNumber = idx + 6;
            const isVeg = item.type === "Pure Veg";
            
            worksheet.getRow(rowNumber).values = [
                item.name || "",
                Number(item.price) || 0,
                item.category || "",
                item.type || "Pure Veg",
                item.description || ""
            ];

            const row = worksheet.getRow(rowNumber);
            row.height = 30; // Row height: 30 for data rows

            // Determine alternating row bg color: light green for Veg (#E2F0D9), light orange/red for Non-Veg (#FCE4D6)
            const rowBgColor = isVeg ? 'FFE2F0D9' : 'FFFCE4D6';

            row.eachCell({ includeEmpty: true }, (cell: any, colNumber: any) => {
                cell.font = { name: 'Arial', size: 10 };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBgColor } };
                cell.alignment = { vertical: 'middle' };
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FFBFBFBF' } },
                    left: { style: 'thin', color: { argb: 'FFBFBFBF' } },
                    bottom: { style: 'thin', color: { argb: 'FFBFBFBF' } },
                    right: { style: 'thin', color: { argb: 'FFBFBFBF' } }
                };

                // Bold centered Price column (Col 2)
                if (colNumber === 2) {
                    cell.font = { name: 'Arial', size: 10, bold: true };
                    cell.alignment = { horizontal: 'center', vertical: 'middle' };
                    cell.numFmt = '₹#,##0';
                }

                // Bold Type column (Col 4) with green/red font coloring
                if (colNumber === 4) {
                    const isPureVeg = cell.value === "Pure Veg";
                    cell.font = { 
                        name: 'Arial', 
                        size: 10, 
                        bold: true, 
                        color: { argb: isPureVeg ? 'FF385723' : 'FFC00000' } // Green for Veg, Red for Non-Veg
                    };
                    cell.alignment = { horizontal: 'center', vertical: 'middle' };
                }
            });
        });

        // 4. Auto-filter enabled on all columns
        const totalRows = items.length + 5;
        worksheet.autoFilter = {
            from: { row: 5, column: 1 },
            to: { row: totalRows, column: 5 }
        };

        // 5. Column Widths: Item Name=28, Price=12, Category=18, Type=12, Description=55
        worksheet.getColumn(1).width = 28;
        worksheet.getColumn(2).width = 12;
        worksheet.getColumn(3).width = 18;
        worksheet.getColumn(4).width = 12;
        worksheet.getColumn(5).width = 55;

        // 6. Write workbook to response stream
        res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        res.setHeader(
            "Content-Disposition",
            "attachment; filename=" + `Formatted_AI_Menu_${Date.now()}.xlsx`
        );

        await workbook.xlsx.write(res);
        res.end();

    } catch (e: any) {
        console.error("🚨 [Formatted Menu Builder] Failed:", e.message);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/merchant/onboard', async (req: any, res: any) => {
    try {
        const { email, phone, password, name, restaurantName, address, timings, contactPhone, menu } = req.body;

        if (!email || !phone || !password || !restaurantName) {
            return res.status(400).json({ error: "Missing required fields: email, phone, password, and restaurantName are mandatory." });
        }

        const cleanEmail = email.trim().toLowerCase();
        const cleanPhone = phone.replace(/\D/g, '');

        if (cleanPhone.length !== 10) {
            return res.status(400).json({ error: "Phone number must be a valid 10-digit number." });
        }

        // 1. Read POS DB connection string dynamically
        const websiteEnvPath = '/Users/vikas/Desktop/kravy-pos-website/.env';
        if (!fs.existsSync(websiteEnvPath)) {
            return res.status(500).json({ error: `Kravy POS Website .env not found at ${websiteEnvPath}` });
        }

        const envContent = fs.readFileSync(websiteEnvPath, 'utf8');
        const envConfig = dotenv.parse(envContent);
        const dbUrl = envConfig.DATABASE_URL;

        if (!dbUrl) {
            return res.status(500).json({ error: "DATABASE_URL is not defined in the Kravy POS Website .env file." });
        }

        // 2. Connect to POS MongoDB using native mongodb driver
        console.log("🔌 [Merchant Onboarding API] Connecting to POS database...");
        const client = new MongoClient(dbUrl);
        await client.connect();
        const db = client.db();

        const userCollection = db.collection('User');
        const profileCollection = db.collection('BusinessProfile');
        const categoryCollection = db.collection('Category');
        const itemCollection = db.collection('Item');

        // 3. Check if user already exists
        const existingUser = await userCollection.findOne({
            $or: [
                { email: cleanEmail },
                { phone: cleanPhone }
            ]
        });

        if (existingUser) {
            await client.close();
            return res.status(400).json({ error: `A merchant with this email (${cleanEmail}) or phone (${cleanPhone}) already exists in the POS database.` });
        }

        // 4. Hash password using bcryptjs
        const hashedPassword = await bcrypt.hash(password, 10);
        const clerkId = `custom_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        const userOid = new ObjectId();

        // 5. Create User
        console.log(`👤 [Merchant Onboarding API] Creating User in POS DB...`);
        const userDoc = {
            _id: userOid,
            name: name || restaurantName,
            email: cleanEmail,
            phone: cleanPhone,
            password: hashedPassword,
            clerkId: clerkId,
            isVerified: true, // Mark verified directly!
            role: "SELLER",    // Match merchant standard registration role
            imageUrl: null,
            secondaryEmails: [],
            secondaryPhones: [],
            isDisabled: false,
            allowedPaths: [],
            publicMetadata: {},
            privateMetadata: {},
            unsafeMetadata: {},
            uiPreferences: {},
            createdAt: new Date()
        };
        await userCollection.insertOne(userDoc);

        // Parse operating hours string (e.g. "11:00 AM - 11:00 PM") into openingTime and closingTime
        let openingTime = "00:00";
        let closingTime = "23:59";
        if (timings && typeof timings === 'string') {
            const parts = timings.split(/[-–to]/i);
            if (parts.length === 2) {
                const parseTime = (str: string) => {
                    str = str.trim().toUpperCase();
                    const match = str.match(/(\d+):?(\d+)?\s*(AM|PM)?/);
                    if (match) {
                        let hours = parseInt(match[1]);
                        const minutes = match[2] ? parseInt(match[2]) : 0;
                        const ampm = match[3];
                        if (ampm === "PM" && hours < 12) hours += 12;
                        if (ampm === "AM" && hours === 12) hours = 0;
                        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
                    }
                    return null;
                };
                const start = parseTime(parts[0]);
                const end = parseTime(parts[1]);
                if (start) openingTime = start;
                if (end) closingTime = end;
            }
        }

        // 6. Create Business Profile
        console.log(`🏢 [Merchant Onboarding API] Creating Business Profile in POS DB with parsed timings: ${openingTime} - ${closingTime}...`);
        const profileOid = new ObjectId();
        const profileDoc = {
            _id: profileOid,
            userId: clerkId, // links to clerkId
            businessName: restaurantName,
            businessAddress: address || "Delhi NCR",
            businessEmail: cleanEmail,
            contactPersonName: name || restaurantName,
            contactPersonPhone: contactPhone || cleanPhone,
            contactPersonEmail: cleanEmail,
            businessTagLine: "",
            isOnline: true,
            openingTime: openingTime,
            closingTime: closingTime,
            offlineMessage: "Restaurant is currently closed or not accepting orders.",
            upiQrEnabled: true,
            menuLinkEnabled: true,
            perProductTaxEnabled: false,
            taxEnabled: false,
            taxRate: 5.0,
            gstType: "PRODUCT",
            collectCustomerName: true,
            requireCustomerName: false,
            collectCustomerPhone: true,
            requireCustomerPhone: false,
            collectCustomerAddress: false,
            requireCustomerAddress: false,
            greetingMessage: "Thank You 🙏 Visit Again!",
            businessNameSize: "large",
            tokenNumberSize: 22,
            businessAddressSize: 12,
            fssaiNumber: null,
            fssaiEnabled: false,
            hsnEnabled: false,
            trialStartedAt: new Date(),
            isPremium: false,
            showPremiumPopup: false,
            isFrozen: false,
            posCashEnabled: true,
            posUpiEnabled: true,
            posCardEnabled: true,
            posCounterEnabled: true,
            posWalletEnabled: true,
            posHoldEnabled: true,
            posSaveEnabled: true,
            posPreviewEnabled: true,
            posKotEnabled: true,
            phonePrefixType: "TEXT",
            printSettings: "{}"
        };
        await profileCollection.insertOne(profileDoc);

        // 7. Sync Categories & Menu Items
        let categoriesCreatedCount = 0;
        let itemsCreatedCount = 0;

        if (menu && Array.isArray(menu) && menu.length > 0) {
            console.log(`🚀 [Merchant Onboarding API] Syncing ${menu.length} menu items...`);
            
            // Map to track category Oids
            const categoryOidMap: Record<string, ObjectId> = {};

            for (const item of menu) {
                const catName = (item.category || "General").trim();
                
                // Get or create category
                let catOid = categoryOidMap[catName];
                if (!catOid) {
                    // Check if category already exists for this user in POS DB
                    const existingCat = await categoryCollection.findOne({
                        name: catName,
                        clerkId: clerkId
                    });

                    if (existingCat) {
                        catOid = existingCat._id;
                    } else {
                        catOid = new ObjectId();
                        const catDoc = {
                            _id: catOid,
                            name: catName,
                            clerkId: clerkId,
                            createdAt: new Date(),
                            updatedAt: new Date()
                        };
                        await categoryCollection.insertOne(catDoc);
                        categoriesCreatedCount++;
                    }
                    categoryOidMap[catName] = catOid;
                }

                // Parse details
                const priceVal = parseFloat(item.price) || 0.0;
                const itemType = (item.type || "Pure Veg").trim();
                const isVeg = itemType === "Pure Veg" || itemType === "Veg";
                const isEgg = itemType === "Non-Veg (Egg)";

                // Insert Item
                const itemOid = new ObjectId();
                const itemDoc = {
                    _id: itemOid,
                    name: item.name,
                    description: item.description || null,
                    price: priceVal,
                    sellingPrice: priceVal,
                    gst: null,
                    unit: "pcs",
                    barcode: null,
                    taxStatus: "With Tax",
                    imageUrl: null,
                    image: null,
                    categoryId: catOid,
                    clerkId: clerkId,
                    userId: userOid,
                    isActive: true,
                    openingStock: 0,
                    currentStock: 0,
                    reorderLevel: 0,
                    isVeg: isVeg,
                    isEgg: isEgg,
                    isBestseller: false,
                    isRecommended: false,
                    isNew: false,
                    spiciness: null,
                    rating: 4.5,
                    tags: [],
                    zones: [],
                    packagingCharges: 0,
                    gstType: null,
                    taxRate: null,
                    addonGroupIds: [],
                    createdAt: new Date(),
                    updatedAt: new Date()
                };
                await itemCollection.insertOne(itemDoc);
                itemsCreatedCount++;
            }
        }

        // Close connection
        await client.close();

        // 🚀 DISPATCH TO SEQUENTIAL QUEUE MANAGER FOR LIVE DASHBOARD PROGRESS
        if (menu && Array.isArray(menu) && menu.length > 0) {
            try {
                await queueManager.addJob(clerkId, menu.length);
                console.log(`🚢 [Merchant Onboarding API] Scraper Job successfully queued for Clerk ID: ${clerkId}`);
            } catch (queueErr: any) {
                console.error("⚠️ [Merchant Onboarding API] Failed to queue scraper job:", queueErr.message);
            }
        }

        console.log(`✅ [Merchant Onboarding API] Merchant onboarded successfully! User: ${cleanEmail}`);

        res.status(200).json({
            success: true,
            message: "Merchant onboarded successfully directly into Kravy POS!",
            merchant: {
                id: userOid.toString(),
                name: userDoc.name,
                email: cleanEmail,
                phone: cleanPhone,
                clerkId: clerkId,
                categoriesSynced: categoriesCreatedCount,
                itemsSynced: itemsCreatedCount
            }
        });

    } catch (e: any) {
        console.error("🚨 [Merchant Onboarding API] Crash:", e.message);
        res.status(500).json({ error: "Failed to onboard merchant: " + e.message });
    }
});

// 🧹 SAFE CLEAR MENU ENDPOINT (Keeps user/profile intact, deletes items & categories)
app.post('/api/merchant/clear-menu', async (req: any, res: any) => {
    try {
        const { clerkId } = req.body;

        if (!clerkId) {
            return res.status(400).json({ error: "clerkId is mandatory to clear a restaurant menu." });
        }

        // 1. Read POS DB connection string dynamically
        const websiteEnvPath = '/Users/vikas/Desktop/kravy-pos-website/.env';
        if (!fs.existsSync(websiteEnvPath)) {
            return res.status(500).json({ error: `Kravy POS Website .env not found at ${websiteEnvPath}` });
        }

        const envContent = fs.readFileSync(websiteEnvPath, 'utf8');
        const envConfig = dotenv.parse(envContent);
        const dbUrl = envConfig.DATABASE_URL;

        if (!dbUrl) {
            return res.status(500).json({ error: "DATABASE_URL is not defined in the Kravy POS Website .env file." });
        }

        // 2. Connect to POS MongoDB using native mongodb driver
        console.log(`🔌 [Merchant Menu Clear API] Connecting to POS database for Clerk ID: ${clerkId}...`);
        const client = new MongoClient(dbUrl);
        await client.connect();
        const db = client.db();

        const userCollection = db.collection('User');
        const categoryCollection = db.collection('Category');
        const itemCollection = db.collection('Item');

        // Find user case-insensitively to resolve exact clerkId casing
        const matchedUser = await userCollection.findOne({ clerkId: { $regex: new RegExp("^" + clerkId + "$", "i") } });
        const resolvedClerkId = matchedUser ? matchedUser.clerkId : clerkId;

        // 3. Safe Delete: Clear items and categories using resolved case-insensitive Clerk ID
        console.log(`🧹 [Merchant Menu Clear API] Clearing items and categories for Clerk ID: ${resolvedClerkId}...`);
        const itemsDeleted = await itemCollection.deleteMany({ clerkId: resolvedClerkId });
        const categoriesDeleted = await categoryCollection.deleteMany({ clerkId: resolvedClerkId });
        console.log(`🧹 [Merchant Menu Clear API] Cleared ${itemsDeleted.deletedCount} items and ${categoriesDeleted.deletedCount} categories.`);

        await client.close();

        res.status(200).json({
            success: true,
            message: "Menu items and categories cleared successfully from Kravy POS!",
            clerkId,
            itemsCleared: itemsDeleted.deletedCount,
            categoriesCleared: categoriesDeleted.deletedCount
        });

    } catch (e: any) {
        console.error("🚨 [Merchant Menu Clear API] Crash:", e.message);
        res.status(500).json({ error: "Failed to clear menu: " + e.message });
    }
});

// 📋 GET MERCHANT BILLS ENDPOINT
app.get('/api/merchant/bills/:clerkId', async (req: any, res: any) => {
    try {
        const { clerkId } = req.params;

        if (!clerkId) {
            emitUpdate('merchant:log', { message: `❌ [Server] Error: clerkId is mandatory to fetch bills.`, status: 'error' });
            return res.status(400).json({ error: "clerkId is mandatory to fetch bills." });
        }

        emitUpdate('merchant:log', { message: `⚙️ [Server] Initializing POS connection string check for Merchant ID: ${clerkId}...`, status: 'primary' });

        // 1. Read POS DB connection string dynamically
        const websiteEnvPath = '/Users/vikas/Desktop/kravy-pos-website/.env';
        if (!fs.existsSync(websiteEnvPath)) {
            const err = `Kravy POS Website .env not found at ${websiteEnvPath}`;
            emitUpdate('merchant:log', { message: `❌ [Server] Error: ${err}`, status: 'error' });
            return res.status(500).json({ error: err });
        }

        const envContent = fs.readFileSync(websiteEnvPath, 'utf8');
        const envConfig = dotenv.parse(envContent);
        const dbUrl = envConfig.DATABASE_URL;

        if (!dbUrl) {
            const err = "DATABASE_URL is not defined in the Kravy POS Website .env file.";
            emitUpdate('merchant:log', { message: `❌ [Server] Error: ${err}`, status: 'error' });
            return res.status(500).json({ error: err });
        }

        emitUpdate('merchant:log', { message: `🔌 [Server] Connecting to MongoDB POS database...`, status: 'primary' });

        // 2. Connect to POS MongoDB using native mongodb driver
        console.log(`🔌 [Merchant Bills Fetch API] Connecting to POS database for Clerk ID: ${clerkId}...`);
        const client = new MongoClient(dbUrl);
        await client.connect();
        const db = client.db();

        emitUpdate('merchant:log', { message: `✅ [Server] MongoDB connected successfully.`, status: 'success' });

        const userCollection = db.collection('User');
        const billCollection = db.collection('BillManager');

        // Find user case-insensitively to resolve exact clerkId casing
        emitUpdate('merchant:log', { message: `👤 [Server] Resolving case-insensitive Merchant ID: "${clerkId}"...`, status: 'primary' });
        const matchedUser = await userCollection.findOne({ clerkId: { $regex: new RegExp("^" + clerkId + "$", "i") } });
        const resolvedClerkId = matchedUser ? matchedUser.clerkId : clerkId;
        
        emitUpdate('merchant:log', { message: `👤 [Server] Merchant ID casing resolved to: "${resolvedClerkId}"`, status: 'success' });

        // Fetch bills for resolved Clerk ID sorted by createdAt desc (excluding marked deleted where applicable, but fetch all for audit/bridge purposes)
        emitUpdate('merchant:log', { message: `🔍 [Server] Querying BillManager database collection...`, status: 'primary' });
        const bills = await billCollection.find({ clerkUserId: resolvedClerkId }).sort({ createdAt: -1 }).toArray();

        // Calculate statistics
        const totalCount = bills.length;
        const totalRevenue = bills.reduce((sum, bill) => sum + (bill.total || 0), 0);
        
        // Payments breakdown
        const paymentsBreakdown: Record<string, number> = {};
        bills.forEach(bill => {
            const mode = bill.paymentMode || 'UNKNOWN';
            paymentsBreakdown[mode] = (paymentsBreakdown[mode] || 0) + (bill.total || 0);
        });

        emitUpdate('merchant:log', { message: `📊 [Server] POS Query Successful: Found ${totalCount} bills, Total Revenue: ₹${totalRevenue.toFixed(2)}`, status: 'success' });

        await client.close();
        emitUpdate('merchant:log', { message: `🔌 [Server] MongoDB database connection closed.`, status: 'primary' });

        res.status(200).json({
            success: true,
            bills,
            stats: {
                totalCount,
                totalRevenue,
                paymentsBreakdown
            }
        });

    } catch (e: any) {
        console.error("🚨 [Merchant Bills Fetch API] Crash:", e.message);
        emitUpdate('merchant:log', { message: `🚨 [Server] POS Fetch API Crash: ${e.message}`, status: 'error' });
        res.status(500).json({ error: "Failed to fetch bills: " + e.message });
    }
});

// 🗑️ SAFE CLEAR ALL BILLS ENDPOINT (Deletes all orders, bills, and associated payments)
app.post('/api/merchant/clear-bills', async (req: any, res: any) => {
    try {
        const { clerkId } = req.body;

        if (!clerkId) {
            return res.status(400).json({ error: "clerkId is mandatory to clear bills." });
        }

        // 1. Read POS DB connection string dynamically
        const websiteEnvPath = '/Users/vikas/Desktop/kravy-pos-website/.env';
        if (!fs.existsSync(websiteEnvPath)) {
            return res.status(500).json({ error: `Kravy POS Website .env not found at ${websiteEnvPath}` });
        }

        const envContent = fs.readFileSync(websiteEnvPath, 'utf8');
        const envConfig = dotenv.parse(envContent);
        const dbUrl = envConfig.DATABASE_URL;

        if (!dbUrl) {
            return res.status(500).json({ error: "DATABASE_URL is not defined in the Kravy POS Website .env file." });
        }

        // 2. Connect to POS MongoDB using native mongodb driver
        console.log(`🔌 [Merchant Bills Clear API] Connecting to POS database for Clerk ID: ${clerkId}...`);
        const client = new MongoClient(dbUrl);
        await client.connect();
        const db = client.db();

        const userCollection = db.collection('User');
        const billCollection = db.collection('BillManager');
        const orderCollection = db.collection('Order');
        const paymentCollection = db.collection('Payment');

        // Find user case-insensitively to resolve exact clerkId casing
        const matchedUser = await userCollection.findOne({ clerkId: { $regex: new RegExp("^" + clerkId + "$", "i") } });
        const resolvedClerkId = matchedUser ? matchedUser.clerkId : clerkId;

        // Find all bills for resolved merchant to get their IDs
        const merchantBills = await billCollection.find({ clerkUserId: resolvedClerkId }, { projection: { _id: 1 } }).toArray();
        const billIds = merchantBills.map(b => b._id);

        console.log(`🧹 [Merchant Bills Clear API] Deleting bills, orders, and payments for Clerk ID: ${resolvedClerkId}...`);
        
        // 1. Delete associated payments
        let paymentsDeleted = 0;
        if (billIds.length > 0) {
            const paymentsResult = await paymentCollection.deleteMany({ billId: { $in: billIds } });
            paymentsDeleted = paymentsResult.deletedCount;
        }

        // 2. Delete all bills (BillManager)
        const billsResult = await billCollection.deleteMany({ clerkUserId: resolvedClerkId });
        
        // 3. Delete all orders (Order)
        const ordersResult = await orderCollection.deleteMany({ clerkUserId: resolvedClerkId });

        console.log(`🧹 [Merchant Bills Clear API] Cleared ${billsResult.deletedCount} bills, ${ordersResult.deletedCount} orders, and ${paymentsDeleted} payments.`);

        await client.close();

        res.status(200).json({
            success: true,
            message: "Bills, orders, and payments cleared successfully from Kravy POS!",
            clerkId,
            billsCleared: billsResult.deletedCount,
            ordersCleared: ordersResult.deletedCount,
            paymentsCleared: paymentsDeleted
        });

    } catch (e: any) {
        console.error("🚨 [Merchant Bills Clear API] Crash:", e.message);
        res.status(500).json({ error: "Failed to clear bills: " + e.message });
    }
});


// 📋 GET MERCHANT PROFILE (To fetch Business Profile details like logoUrl)
app.get('/api/merchant/profile/:clerkId', async (req: any, res: any) => {
    try {
        const { clerkId } = req.params;

        if (!clerkId) {
            return res.status(400).json({ error: "clerkId is mandatory to fetch profile." });
        }

        // 1. Read POS DB connection string dynamically
        const websiteEnvPath = '/Users/vikas/Desktop/kravy-pos-website/.env';
        if (!fs.existsSync(websiteEnvPath)) {
            return res.status(500).json({ error: `Kravy POS Website .env not found at ${websiteEnvPath}` });
        }

        const envContent = fs.readFileSync(websiteEnvPath, 'utf8');
        const envConfig = dotenv.parse(envContent);
        const dbUrl = envConfig.DATABASE_URL;

        if (!dbUrl) {
            return res.status(500).json({ error: "DATABASE_URL is not defined in the Kravy POS Website .env file." });
        }

        // 2. Connect to POS MongoDB using native mongodb driver
        const client = new MongoClient(dbUrl);
        await client.connect();
        const db = client.db();

        const userCollection = db.collection('User');
        const profileCollection = db.collection('BusinessProfile');

        // Resolve user case-insensitively
        const matchedUser = await userCollection.findOne({ clerkId: { $regex: new RegExp("^" + clerkId + "$", "i") } });
        const resolvedClerkId = matchedUser ? matchedUser.clerkId : clerkId;

        // Fetch profile
        const profile = await profileCollection.findOne({ userId: resolvedClerkId });

        await client.close();

        if (!profile) {
            return res.status(404).json({ error: "Business Profile not found for this merchant." });
        }

        res.status(200).json({
            success: true,
            profile: {
                userId: profile.userId,
                businessName: profile.businessName,
                logoUrl: profile.logoUrl,
                businessAddress: profile.businessAddress,
                contactPersonPhone: profile.contactPersonPhone,
                contactPersonEmail: profile.contactPersonEmail
            }
        });

    } catch (e: any) {
        console.error("🚨 [Merchant Profile Fetch API] Crash:", e.message);
        res.status(500).json({ error: "Failed to fetch profile: " + e.message });
    }
});

// 📤 UPLOAD MERCHANT LOGO
app.post('/api/merchant/profile/logo', upload.single('logo'), async (req: any, res: any) => {
    try {
        const { clerkId } = req.body;
        if (!clerkId) {
            return res.status(400).json({ error: "clerkId is mandatory to upload logo." });
        }
        if (!req.file) {
            return res.status(400).json({ error: "No image file uploaded." });
        }

        // 1. Read POS DB connection string dynamically
        const websiteEnvPath = '/Users/vikas/Desktop/kravy-pos-website/.env';
        if (!fs.existsSync(websiteEnvPath)) {
            return res.status(500).json({ error: `Kravy POS Website .env not found at ${websiteEnvPath}` });
        }

        const envContent = fs.readFileSync(websiteEnvPath, 'utf8');
        const envConfig = dotenv.parse(envContent);
        const dbUrl = envConfig.DATABASE_URL;

        if (!dbUrl) {
            return res.status(500).json({ error: "DATABASE_URL is not defined in the Kravy POS Website .env file." });
        }

        console.log(`📤 [Merchant Logo Upload API] Uploading logo to Cloudinary for clerkId: ${clerkId}...`);

        // 2. Upload buffer to Cloudinary
        const cloudinaryResult: any = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
                { folder: "restaurant-logos", public_id: `logo-${clerkId.replace(/\s+/g, '-')}-${Date.now()}` },
                (error, result) => {
                    if (error) reject(error);
                    else resolve(result);
                }
            );
            stream.end(req.file?.buffer);
        });

        const logoUrl = cloudinaryResult.secure_url;
        console.log(`✅ [Merchant Logo Upload API] Cloudinary Success: ${logoUrl}`);

        // 3. Connect to POS MongoDB using native mongodb driver
        const client = new MongoClient(dbUrl);
        await client.connect();
        const db = client.db();

        const userCollection = db.collection('User');
        const profileCollection = db.collection('BusinessProfile');

        // Resolve user case-insensitively
        const matchedUser = await userCollection.findOne({ clerkId: { $regex: new RegExp("^" + clerkId + "$", "i") } });
        const resolvedClerkId = matchedUser ? matchedUser.clerkId : clerkId;

        // Update profile logoUrl
        console.log(`🏢 [Merchant Logo Upload API] Updating BusinessProfile.logoUrl in database...`);
        const result = await profileCollection.updateOne(
            { userId: resolvedClerkId },
            { $set: { logoUrl: logoUrl, updatedAt: new Date() } }
        );

        await client.close();

        if (result.matchedCount === 0) {
            return res.status(404).json({ error: "Business Profile not found for this merchant. Cannot update logo." });
        }

        res.status(200).json({
            success: true,
            message: "Merchant logo updated successfully!",
            logoUrl
        });

    } catch (e: any) {
        console.error("🚨 [Merchant Logo Upload API] Crash:", e.message);
        res.status(500).json({ error: "Failed to upload logo: " + e.message });
    }
});

// 🗑️ DELETE MERCHANT LOGO
app.delete('/api/merchant/profile/logo', async (req: any, res: any) => {
    try {
        const { clerkId } = req.body;
        if (!clerkId) {
            return res.status(400).json({ error: "clerkId is mandatory to delete logo." });
        }

        // 1. Read POS DB connection string dynamically
        const websiteEnvPath = '/Users/vikas/Desktop/kravy-pos-website/.env';
        if (!fs.existsSync(websiteEnvPath)) {
            return res.status(500).json({ error: `Kravy POS Website .env not found at ${websiteEnvPath}` });
        }

        const envContent = fs.readFileSync(websiteEnvPath, 'utf8');
        const envConfig = dotenv.parse(envContent);
        const dbUrl = envConfig.DATABASE_URL;

        if (!dbUrl) {
            return res.status(500).json({ error: "DATABASE_URL is not defined in the Kravy POS Website .env file." });
        }

        // 2. Connect to POS MongoDB using native mongodb driver
        const client = new MongoClient(dbUrl);
        await client.connect();
        const db = client.db();

        const userCollection = db.collection('User');
        const profileCollection = db.collection('BusinessProfile');

        // Resolve user case-insensitively
        const matchedUser = await userCollection.findOne({ clerkId: { $regex: new RegExp("^" + clerkId + "$", "i") } });
        const resolvedClerkId = matchedUser ? matchedUser.clerkId : clerkId;

        // Reset profile logoUrl to null
        console.log(`🗑️ [Merchant Logo Delete API] Resetting BusinessProfile.logoUrl to null in database...`);
        const result = await profileCollection.updateOne(
            { userId: resolvedClerkId },
            { $set: { logoUrl: null, updatedAt: new Date() } }
        );

        await client.close();

        if (result.matchedCount === 0) {
            return res.status(404).json({ error: "Business Profile not found for this merchant. Cannot delete logo." });
        }

        res.status(200).json({
            success: true,
            message: "Merchant logo deleted successfully from database!"
        });

    } catch (e: any) {
        console.error("🚨 [Merchant Logo Delete API] Crash:", e.message);
        res.status(500).json({ error: "Failed to delete logo: " + e.message });
    }
});


// 🪄 AI RESTAURANT PROFILE AUTO-FILL via Multimodal Image Processing
app.post('/api/merchant/profile/auto-fill', upload.single('profileImage'), async (req: any, res: any) => {
    try {
        const { clerkId } = req.body;
        if (!clerkId) {
            return res.status(400).json({ error: "clerkId is mandatory to auto-fill profile." });
        }
        if (!req.file) {
            return res.status(400).json({ error: "No profile image/screenshot uploaded." });
        }

        const apiKey = process.env.GOOGLE_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: "GOOGLE_API_KEY is not configured in the server's .env file." });
        }

        const fileBuffer = req.file.buffer;
        const mimeType = req.file.mimetype;
        const base64Data = fileBuffer.toString("base64");

        console.log(`📡 [AI Profile Auto-Fill] Processing uploaded file for clerkId: ${clerkId}...`);

        const modelsToTry = [
            "gemini-2.0-flash",
            "gemini-2.5-flash",
            "gemini-2.5-flash-lite",
            "gemini-2.0-flash-lite",
            "gemini-3.5-flash"
        ];

        const prompt = `
You are a highly advanced AI system designed to read images of restaurants, business cards, menu headers, screenshots, or receipts and extract EVERY single business profile detail with elite precision.

Please extract:
1. Restaurant/Business Name
2. Phone number (or contact number)
3. Address (full physical address)
4. Operating hours / Timings (extract the Opening Time and Closing Time in standard "HH:mm" 24-hour format, e.g., '11:00' and '23:00'. If opening time is not found, default to '09:00'. If closing time is not found, default to '23:00').
5. Email (if present)

Please return a structured JSON response matching the following structure:
{
  "businessName": "Name of the restaurant",
  "contactPersonPhone": "Contact/Phone number if found, normalized to simple numbers without spaces or special symbols, e.g., '9876543210'",
  "businessAddress": "Restaurant address if found",
  "openingTime": "HH:mm format opening hour, e.g., '11:00'",
  "closingTime": "HH:mm format closing hour, e.g., '23:00'",
  "businessEmail": "Email address if found (or null if not present)"
}

Strictly follow these rules:
1. Return ONLY the raw JSON object inside the JSON block. Do not add any conversational text or explanation.
2. Normalize all spelling and format.
3. Ensure the output is valid JSON.
4. If a field is not found, make a best guess or use a sensible default (e.g. standard Noida/Delhi address or '09:00' to '23:00' hours). Do not leave them blank.
5. Translate or transliterate any Hindi or non-English script into standard English characters (e.g. 'Biryani' instead of 'बिरयानी').
`;

        let textResponse = "";
        let selectedModel = "";
        let lastError: any = null;

        for (const model of modelsToTry) {
            try {
                console.log(`🤖 [AI Profile Auto-Fill] Trying model: ${model}...`);
                const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

                const response = await axios.post(geminiUrl, {
                    contents: [
                        {
                            parts: [
                                { text: prompt },
                                {
                                    inlineData: {
                                        mimeType: mimeType,
                                        data: base64Data
                                    }
                                }
                            ]
                        }
                    ],
                    generationConfig: {
                        responseMimeType: "application/json"
                    }
                });

                textResponse = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (textResponse) {
                    selectedModel = model;
                    console.log(`✅ [AI Profile Auto-Fill] Successfully retrieved response using model: ${selectedModel}`);
                    break;
                }
            } catch (err: any) {
                const errMsg = err.response?.data?.error?.message || err.message;
                console.warn(`⚠️ [AI Profile Auto-Fill] Model ${model} failed: ${errMsg}`);
                lastError = err;
            }
        }

        if (!textResponse) {
            const finalErrorMsg = lastError?.response?.data || lastError?.message || "No response content from any Gemini OCR model.";
            throw new Error(`All Gemini OCR models failed or exceeded quota. Last error: ${JSON.stringify(finalErrorMsg)}`);
        }

        const parsedResult = JSON.parse(textResponse);
        console.log(`✅ [AI Profile Auto-Fill] Extracted details for ${parsedResult.businessName || 'Merchant'}!`);

        // 1. Read POS DB connection string dynamically
        const websiteEnvPath = '/Users/vikas/Desktop/kravy-pos-website/.env';
        if (!fs.existsSync(websiteEnvPath)) {
            return res.status(500).json({ error: `Kravy POS Website .env not found at ${websiteEnvPath}` });
        }

        const envContent = fs.readFileSync(websiteEnvPath, 'utf8');
        const envConfig = dotenv.parse(envContent);
        const dbUrl = envConfig.DATABASE_URL;

        if (!dbUrl) {
            return res.status(500).json({ error: "DATABASE_URL is not defined in the Kravy POS Website .env file." });
        }

        // 2. Upload card/banner to Cloudinary
        console.log(`📤 [AI Profile Auto-Fill] Uploading card/banner to Cloudinary for clerkId: ${clerkId}...`);
        const cloudinaryResult: any = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
                { folder: "restaurant-profiles", public_id: `profile-${clerkId.replace(/\s+/g, '-')}-${Date.now()}` },
                (error, result) => {
                    if (error) reject(error);
                    else resolve(result);
                }
            );
            stream.end(req.file?.buffer);
        });

        const profileImageUrl = cloudinaryResult.secure_url;
        console.log(`✅ [AI Profile Auto-Fill] Cloudinary Success: ${profileImageUrl}`);

        // 3. Connect to POS MongoDB using native mongodb driver
        const client = new MongoClient(dbUrl);
        await client.connect();
        const db = client.db();

        const userCollection = db.collection('User');
        const profileCollection = db.collection('BusinessProfile');

        // Resolve user case-insensitively
        const matchedUser = await userCollection.findOne({ clerkId: { $regex: new RegExp("^" + clerkId + "$", "i") } });
        const resolvedClerkId = matchedUser ? matchedUser.clerkId : clerkId;

        // Update profile details
        console.log(`🏢 [AI Profile Auto-Fill] Updating BusinessProfile in database...`);
        const updateFields: any = {
            businessName: parsedResult.businessName || "AI Scraped Restaurant",
            contactPersonName: parsedResult.businessName || "AI Scraped Restaurant",
            contactPersonPhone: parsedResult.contactPersonPhone || "+91 99999 99999",
            businessAddress: parsedResult.businessAddress || "Delhi NCR",
            openingTime: parsedResult.openingTime || "00:00",
            closingTime: parsedResult.closingTime || "23:59",
            profileImageUrl: profileImageUrl,
            updatedAt: new Date()
        };

        if (parsedResult.businessEmail) {
            updateFields.businessEmail = parsedResult.businessEmail;
            updateFields.contactPersonEmail = parsedResult.businessEmail;
        }

        const result = await profileCollection.updateOne(
            { userId: resolvedClerkId },
            { $set: updateFields }
        );

        await client.close();

        if (result.matchedCount === 0) {
            return res.status(404).json({ error: "Business Profile not found for this merchant. Cannot auto-fill details." });
        }

        res.status(200).json({
            success: true,
            message: "Restaurant profile auto-filled and updated successfully directly in POS database!",
            profile: {
                userId: resolvedClerkId,
                ...updateFields
            }
        });

    } catch (e: any) {
        console.error("🚨 [AI Profile Auto-Fill API] Crash:", e.message);
        res.status(500).json({ error: "Failed to auto-fill business profile: " + e.message });
    }
});


// 🔄 SAFE UPDATE MENU ENDPOINT (Safe clears and inserts new items & categories)
app.post('/api/merchant/update-menu', async (req: any, res: any) => {
    try {
        const { clerkId, menu } = req.body;

        if (!clerkId || !menu || !Array.isArray(menu) || menu.length === 0) {
            return res.status(400).json({ error: "Missing required fields: clerkId and a non-empty menu array are mandatory." });
        }

        // 1. Read POS DB connection string dynamically
        const websiteEnvPath = '/Users/vikas/Desktop/kravy-pos-website/.env';
        if (!fs.existsSync(websiteEnvPath)) {
            return res.status(500).json({ error: `Kravy POS Website .env not found at ${websiteEnvPath}` });
        }

        const envContent = fs.readFileSync(websiteEnvPath, 'utf8');
        const envConfig = dotenv.parse(envContent);
        const dbUrl = envConfig.DATABASE_URL;

        if (!dbUrl) {
            return res.status(500).json({ error: "DATABASE_URL is not defined in the Kravy POS Website .env file." });
        }

        // 2. Connect to POS MongoDB using native mongodb driver
        console.log(`🔌 [Merchant Menu Update API] Connecting to POS database for Clerk ID: ${clerkId}...`);
        const client = new MongoClient(dbUrl);
        await client.connect();
        const db = client.db();

        const userCollection = db.collection('User');
        const categoryCollection = db.collection('Category');
        const itemCollection = db.collection('Item');

        // 3. Find the existing user case-insensitively
        const existingUser = await userCollection.findOne({ clerkId: { $regex: new RegExp("^" + clerkId + "$", "i") } });
        if (!existingUser) {
            await client.close();
            return res.status(404).json({ error: `Merchant with Clerk ID (${clerkId}) not found in the POS database.` });
        }

        const userOid = existingUser._id;
        const resolvedClerkId = existingUser.clerkId; // use exact casing

        // 4. Safe Delete: Clear old categories and items using resolved Clerk ID
        console.log(`🧹 [Merchant Menu Update API] Safe clearing old items and categories for Clerk ID: ${resolvedClerkId}...`);
        const itemsDeleted = await itemCollection.deleteMany({ clerkId: resolvedClerkId });
        const categoriesDeleted = await categoryCollection.deleteMany({ clerkId: resolvedClerkId });
        console.log(`🧹 [Merchant Menu Update API] Cleared ${itemsDeleted.deletedCount} items and ${categoriesDeleted.deletedCount} categories.`);

        // 5. Sync Categories & Menu Items
        let categoriesCreatedCount = 0;
        let itemsCreatedCount = 0;
        const categoryOidMap: Record<string, ObjectId> = {};

        for (const item of menu) {
            const catName = (item.category || "General").trim();
            
            // Get or create category
            let catOid = categoryOidMap[catName];
            if (!catOid) {
                const existingCat = await categoryCollection.findOne({
                    name: catName,
                    clerkId: resolvedClerkId
                });

                if (existingCat) {
                    catOid = existingCat._id;
                } else {
                    catOid = new ObjectId();
                    const catDoc = {
                        _id: catOid,
                        name: catName,
                        clerkId: resolvedClerkId,
                        createdAt: new Date(),
                        updatedAt: new Date()
                    };
                    await categoryCollection.insertOne(catDoc);
                    categoriesCreatedCount++;
                }
                categoryOidMap[catName] = catOid;
            }

            // Parse details
            const priceVal = parseFloat(item.price) || 0.0;
            const itemType = (item.type || "Pure Veg").trim();
            const isVeg = itemType === "Pure Veg" || itemType === "Veg";
            const isEgg = itemType === "Non-Veg (Egg)";

            // Insert Item
            const itemOid = new ObjectId();
            const itemDoc = {
                _id: itemOid,
                name: item.name,
                description: item.description || null,
                price: priceVal,
                sellingPrice: priceVal,
                gst: null,
                unit: "pcs",
                barcode: null,
                taxStatus: "With Tax",
                imageUrl: null,
                image: null,
                categoryId: catOid,
                clerkId: resolvedClerkId,
                userId: userOid,
                isActive: true,
                openingStock: 0,
                currentStock: 0,
                reorderLevel: 0,
                isVeg: isVeg,
                isEgg: isEgg,
                isBestseller: false,
                isRecommended: false,
                isNew: false,
                spiciness: null,
                rating: 4.5,
                tags: [],
                zones: [],
                packagingCharges: 0,
                gstType: null,
                taxRate: null,
                addonGroupIds: [],
                createdAt: new Date(),
                updatedAt: new Date()
            };
            await itemCollection.insertOne(itemDoc);
            itemsCreatedCount++;
        }

        // Close connection
        await client.close();

        // 🚀 DISPATCH TO SEQUENTIAL QUEUE MANAGER FOR LIVE IMAGE SCRAPING
        try {
            await queueManager.addJob(resolvedClerkId, menu.length);
            console.log(`🚢 [Merchant Menu Update API] Scraper Job successfully queued for Clerk ID: ${resolvedClerkId}`);
        } catch (queueErr: any) {
            console.error("⚠️ [Merchant Menu Update API] Failed to queue scraper job:", queueErr.message);
        }

        res.status(200).json({
            success: true,
            message: "Menu cleared and updated successfully directly in Kravy POS!",
            clerkId: resolvedClerkId,
            categoriesCleared: categoriesDeleted.deletedCount,
            itemsCleared: itemsDeleted.deletedCount,
            categoriesSynced: categoriesCreatedCount,
            itemsSynced: itemsCreatedCount
        });

    } catch (e: any) {
        console.error("🚨 [Merchant Menu Update API] Crash:", e.message);
        res.status(500).json({ error: "Failed to update menu: " + e.message });
    }
});


const PORT = process.env.PORT || 3005;
httpServer.listen(PORT, async () => {
    console.log(`\n🔱 KRAVY DASHBOARD LIVE ON PORT ${PORT}`);
    startStabilityTracker(); // Start Guardian Monitor
    
    // 🛡️ RECOVER STUCK JOBS
    await queueManager.recoverJobs();
});

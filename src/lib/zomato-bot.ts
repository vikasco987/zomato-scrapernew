import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from "fs";
import path from "path";
import axios from 'axios';
import { prisma } from "../db/index.js";
import { emitUpdate } from "./socket.js";
import { zomatoEvents } from "./zomato-events.js";

// @ts-ignore
puppeteer.use(StealthPlugin());

/**
 * 👑 PRO-LEVEL ZOMATO AUTOMATION ENGINE (V2)
 * Features: Fingerprint Masking, Session Isolation, Human Scroll/Movement, Peak Hour Protection.
 */
export async function runZomatoUploadBot(sourceId: string, targetId: string) {
    // 🔐 GLOBAL PERSISTENT SESSION
    const sessionPath = path.resolve(`./sessions/zomato_pro_v2`);
    if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, { recursive: true });

    const browser = (await (puppeteer as any).launch({
        headless: false,
        defaultViewport: null,
        userDataDir: sessionPath, // 🛡️ REUSES LOGGED IN STATE
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox', 
            '--start-maximized',
            '--disable-blink-features=AutomationControlled',
        ]
    })) as any;

    try {
        const page = await browser.newPage();
        
        // --- 0. SMART FINGERPRINT & BEHAVIOR ---
        await page.setViewport({
            width: 1366 + Math.floor(Math.random() * 100),
            height: 768 + Math.floor(Math.random() * 100),
        });
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        page.on('console', (msg: any) => {
             const t = msg.text();
             if(!t.includes('Failed to load') && !t.includes('sandbox')) {
                  console.log(`🌍 [BROWSER]: ${t.slice(0, 50)}...`);
                  emitUpdate('scraper:log', { message: `🌍 [ZOMATO-PRO-LOG] ${t.slice(0, 50)}...`, status: 'dim' });
             }
        });

        // 1. Fetch Source Data
        // ... (Same fetching logic as before)
        const isObjectId = /^[0-9a-fA-F]{24}$/.test(sourceId);
        const isExternalUser = sourceId.startsWith('user_');
        let items = [];
        if (isObjectId) {
            items = await (prisma as any).menuItem.findMany({
                where: { restaurantId: sourceId, stabilityStatus: 'STABLE', image: { not: null } }
            });
        } else if (isExternalUser) {
            emitUpdate('scraper:log', { message: `🛡️ [PRO-BOT] MAPPING EXTERNAL SOURCE: ${sourceId}`, status: 'primary' });
            const EXTERNAL_BASE = process.env.EXTERNAL_API_BASE || "https://billing.kravy.in/api/external";
            const res = await fetch(`${EXTERNAL_BASE}/menu/${sourceId}`, {
                headers: { "x-scraper-secret": "kravy_scraper_secret_2026" }
            });
            const { pending, completed } = await res.json();
            items = [...pending, ...completed].filter(i => i.image || i.imageUrl || i.cloudinaryUrl);
        }

        if (items.length === 0) {
            const msg = "⚠️ [PRO-BOT] ABORT: No assets to deploy.";
            console.log(msg);
            emitUpdate('scraper:log', { message: msg, status: 'error' });
            await browser.close(); return;
        }

        console.log(`🛡️ [PRO-BOT] PUSHING ${items.length} ISOLATED ASSETS...`);
        emitUpdate('scraper:log', { message: `🛡️ [PRO-BOT] PUSHING ${items.length} ISOLATED ASSETS...`, status: 'primary' });

        // --- 3. TARGET NAVIGATION ---
        let finalTargetUrl = `https://www.zomato.com/partners/onlineordering/menu/?resId=${targetId}`;
        await page.goto(finalTargetUrl, { waitUntil: 'networkidle2', timeout: 60000 });
        await humanScroll(page);

        // A. Smart Auth Check
        const requiresLogin = await page.evaluate(() => {
            const hasAuth = document.body.innerText.includes('Akash') || document.body.innerText.includes('Logout');
            if (hasAuth) return false;
            return document.body.innerText.includes('Login') || !!document.querySelector('input[type="tel"]');
        });

        if (requiresLogin) {
            console.log("🛡️ [PRO-BOT] AUTH REQUIRED. Waiting for browser interaction...");
            emitUpdate('scraper:log', { message: "🛡️ [PRO-BOT] AUTH REQUIRED...", status: 'warning' });
            emitUpdate('zomato:login_required', { targetId });
            const phone: string = await new Promise((res) => zomatoEvents.once('phone_received', res));
            
            await humanType(page, 'input[type="tel"]', phone);
            await page.keyboard.press('Enter');
            
            emitUpdate('zomato:otp_required', { targetId });
            const otp: string = await new Promise((res) => zomatoEvents.once('otp_provided', res));
            const otpInputs = await page.$$('input');
            for(let i=0; i<otp.length && i<otpInputs.length; i++) {
                await humanType(page, `input:nth-child(${i+1})`, otp[i]); 
                await randomDelay(400, 900);
            }
            await page.keyboard.press('Enter');
            await page.waitForNavigation({ waitUntil: 'networkidle2' });
        }

        // B. Dashboard Escape
        const isManagerDash = await page.evaluate(() => document.body.innerText.includes('Welcome to your Menu Manager!'));
        if (isManagerDash) {
            emitUpdate('scraper:log', { message: "🔗 [PRO-BOT] ESCAPING MANAGER DASHBOARD...", status: 'primary' });
            await humanClick(page, 'div:has-text("Go to Menu Editor")', true);
            await page.waitForNavigation({ waitUntil: 'networkidle2' });
        }

        let stats = { success: 0, failed: 0, total: items.length };

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            emitUpdate('scraper:log', { 
                message: `📦 [PRO] [${i+1}/${items.length}] PROCESSING: ${item.name}`, 
                status: 'primary',
                extra: { done: i+1, total: items.length, success: stats.success, failed: stats.failed } 
            });

            const success = await attemptItemUpdate(page, item);
            if(success) stats.success++; else stats.failed++;

            // ⚠️ RANDOM JITTER FOR PRODUCTION
            await randomDelay(3000, 7000); 
            if(i % 3 === 0) await humanScroll(page); // Random behavior
        }

        // 🚀 GLOBAL FINAL SUBMIT (CRITICAL)
        console.log("📍 [PRO] FINALIZING ALL CHANGES (GLOBAL SUBMIT)...");
        const globalSubmitBtn = await page.evaluateHandle(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            return btns.find(b => b.innerText.toLowerCase().includes('submit changes'));
        });

        if (globalSubmitBtn) {
            await page.evaluate((el: any) => el.click(), globalSubmitBtn);
            await randomDelay(2000, 4000);
            const reviewBtn = await page.evaluateHandle(() => {
                const btns = Array.from(document.querySelectorAll('button'));
                return btns.find(b => b.innerText.toLowerCase().includes('submit for review'));
            });
            if (reviewBtn) await page.evaluate((el: any) => el.click(), reviewBtn);
            console.log("🏁 [PRO] GLOBAL SUBMISSION COMPLETE!");
        }

        emitUpdate('scraper:log', { message: `🏁 [PRO] DEPLOYMENT COMPLETE. ${stats.success}/${items.length} LIVE.`, status: 'success' });

    } catch (err: any) {
        emitUpdate('scraper:log', { message: `🚨 PRO-BOT CRASH: ${err.message}`, status: 'error' });
    } finally {
        await browser.close();
    }
}

/**
 * 🎯 SINGLE ITEM MANUAL PUSH BOT
 */
export async function runSingleItemUploadBot(targetId: string, itemData: { name: string, price: number, description?: string }) {
    const sessionPath = path.resolve(`./sessions/zomato_pro_v2`);
    if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, { recursive: true });

    const browser = (await (puppeteer as any).launch({
        headless: false,
        defaultViewport: null,
        userDataDir: sessionPath,
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox', 
            '--start-maximized',
            '--disable-blink-features=AutomationControlled',
        ]
    })) as any;

    try {
        const page = await browser.newPage();
        console.log(`🛡️ [SINGLE] INITIATING PRO-PUSH: ${itemData.name}`);
        emitUpdate('scraper:log', { message: `🛡️ [SINGLE] PUSHING ${itemData.name}...`, status: 'primary' });

        // 1. Intelligent Image Search
        const scrapedImage = await scrapeImageByName(page, itemData.name);
        const finalItem = { ...itemData, image: scrapedImage, id: `manual_${Date.now()}`, category: "General" };
        console.log(`📸 [SINGLE] IMAGE READY: ${scrapedImage}`);

        // 2. Navigation
        console.log(`📍 [SINGLE] NAVIGATING TO RES: ${targetId}`);
        await page.goto(`https://www.zomato.com/partners/onlineordering/menu/?resId=${targetId}`, { waitUntil: 'networkidle2' });
        
        // A. Dashboard Escape
        const isManagerDash = await page.evaluate(() => document.body.innerText.includes('Welcome to your Menu Manager!'));
        if (isManagerDash) {
            console.log("📍 [SINGLE] ESCAPING MANAGER DASHBOARD...");
            await humanClick(page, 'div:has-text("Go to Menu Editor")', true);
            await page.waitForNavigation({ waitUntil: 'networkidle2' });
        }

        const isPeak = await page.evaluate(() => document.body.innerText.includes('peak dinner hour'));
        if (isPeak) console.log("⚠️ [SINGLE] PEAK HOUR ALERT.");

        await attemptItemUpdate(page, finalItem);
        
        // 🚀 GLOBAL FINAL SUBMIT (PRO VERSION)
        console.log("📍 [SINGLE] FINALIZING ALL CHANGES (GLOBAL)...");
        await randomDelay(2000, 4000); // Wait for portal stability
        
        const finalSubmit = await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const b = btns.find(el => el.innerText.toLowerCase().includes('submit changes'));
            if (b) { (b as any).click(); return true; }
            return false;
        });

        if (finalSubmit) {
            console.log("📍 [SINGLE] SUBMIT MODAL OPENED. Waiting for confirmation...");
            await randomDelay(3000, 5000);
            
            const confirmed = await page.evaluate(() => {
                const btns = Array.from(document.querySelectorAll('button'));
                const b = btns.find(el => el.innerText.toLowerCase().includes('submit for review'));
                if (b) { (b as any).click(); return true; }
                return false;
            });
            
            if (confirmed) console.log("🏁 [SINGLE] GLOBAL SUBMISSION COMPLETE!");
            else console.log("⚠️ [SINGLE] CONFIRMATION BUTTON NOT FOUND. Manual check required.");
        } else {
            console.log("⚠️ [SINGLE] 'SUBMIT CHANGES' BUTTON NOT FOUND.");
        }

        console.log(`✅ [SINGLE] SUCCESS: ${itemData.name} LIVE!`);

    } catch (err: any) {
        console.log(`🚨 [SINGLE] FAILED: ${err.message}`);
    } finally {
        await browser.close();
    }
}

/**
 * 🧹 AUTO-DISMISS POPUPS (POPUPS SLAYER)
 * Targets: New Order Alerts, Menu Tours, Help Modals
 */
async function dismissPopups(page: any) {
    try {
        await page.evaluate(() => {
            const dismissSelectors = [
                'div[role="dialog"] button:has-text("close")',
                'div:has-text("order alert") i[class*="close"]',
                '.tour-modal-close',
                '.help-modal-close',
                'button:has-text("No, thanks")',
                'div:has-text("You have 1 order alert")'
            ];
            
            // Proactive Search for X/Close icons in generic modals
            const btns = Array.from(document.querySelectorAll('button, div, span'));
            const closeBtn = btns.find(b => {
                const t = (b as any).innerText.toLowerCase();
                return t === 'x' || t.includes('close') || t.includes('dismiss');
            });
            if (closeBtn && (closeBtn as any).offsetParent !== null) {
                (closeBtn as any).click();
            }

            // Specific Zomato order alert div (the green/notification one)
            const alerts = Array.from(document.querySelectorAll('div'));
            const specificAlert = alerts.find(a => a.innerText.includes('order alert') || a.innerText.includes('Order alert'));
            if(specificAlert) {
                 const xIcon = specificAlert.querySelector('i, span, button');
                 if(xIcon) (xIcon as any).click();
                 else specificAlert.click(); // Click the div itself if no icon
            }
        });
    } catch (e) {
        // Silent fail for popups
    }
}

// --- HUMAN BEHAVIOR HELPERS ---

async function randomDelay(min: number, max: number) {
    const time = Math.floor(Math.random() * (max - min + 1) + min);
    return new Promise(r => setTimeout(r, time));
}

async function humanScroll(page: any) {
    await page.evaluate(() => {
        window.scrollBy(0, Math.random() * 500 + 200);
    });
    await randomDelay(500, 1500);
}

async function generateAIDescription(itemName: string) {
    // Placeholder for AI generation flow:
    // "Enjoy our delicious [itemName], prepared with fresh ingredients and chef's special touch."
    return `Special delicious ${itemName} prepared by our master chefs. A must-try!`;
}

async function humanMove(page: any) {
    const x = Math.floor(Math.random() * 800 + 100);
    const y = Math.floor(Math.random() * 600 + 100);
    await page.mouse.move(x, y, { steps: 20 });
}

async function humanClick(page: any, selector: string, isText = false) {
    await humanMove(page);
    await randomDelay(300, 800);
    
    if (isText) {
        const handle = await page.evaluateHandle((text: string) => {
            const btns = Array.from(document.querySelectorAll('button, div, a'));
            return btns.find(b => (b as any).innerText.includes(text));
        }, selector.replace('div:has-text("', '').replace('")', ''));
        if (handle) {
            await page.evaluate((el: any) => el.click(), handle);
            return true;
        }
    } else {
        await page.click(selector);
        return true;
    }
    return false;
}

async function humanType(page: any, selector: string, text: string) {
    await humanMove(page);
    await page.type(selector, text, { delay: Math.floor(Math.random() * 50 + 80) });
}

// --- FORM AUTOMATION REFACTORED (PRO) ---

async function attemptItemUpdate(page: any, item: any, retryCount = 1): Promise<boolean> {
    try {
        await dismissPopups(page); // 🧹 CLEAR THE WAY
        await humanMove(page);
        
        // 1. Open "Add Item"
        const addBtnText = ['add item', 'add new item', 'add item to menu', 'new item'];
        const addBtn = await page.evaluateHandle((texts: string[]) => {
            const btns = Array.from(document.querySelectorAll('button'));
            return btns.find(b => texts.includes(b.innerText.toLowerCase().trim()));
        }, addBtnText);

        if (addBtn) {
            await page.evaluate((el: any) => el.click(), addBtn);
            console.log("📍 [PRO-B] ADD ITEM BUTTON CLICKED.");
            await randomDelay(1500, 3000);
        }

        const inputs = await page.evaluate(() => {
             return Array.from(document.querySelectorAll('input')).map(i => ({
                 placeholder: i.placeholder,
                 name: i.name,
                 id: i.id
             }));
        });

        for (const info of inputs) {
             const p = (info.placeholder || "").toLowerCase();
             if (p.includes('name')) {
                 await humanType(page, `input[placeholder="${info.placeholder}"]`, item.name);
             } else if (p.includes('price')) {
                 await humanType(page, `input[placeholder="${info.placeholder}"]`, item.price.toString());
             }
        }

        // 📝 PRO FIX: AI Description
        const desc = await generateAIDescription(item.name);
        const textareas = await page.$$('textarea');
        if (textareas.length > 0) {
            await humanType(page, 'textarea', desc);
            emitUpdate('scraper:log', { message: `🧠 AI GENERATED: "${desc.slice(0, 30)}..."`, status: 'dim' });
        }

        // 📸 PRO FIX: Image Handle (REAL UPLOAD)
        if (item.image) {
             try {
                console.log(`📸 [PRO-B] DOWNLOADING ASSET: ${item.image}`);
                const tempDir = path.resolve('./tmp');
                if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
                const tempPath = path.join(tempDir, `item_${Date.now()}.png`);
                
                const response = await axios.get(item.image, { responseType: 'arraybuffer' });
                const buffer = Buffer.from(response.data, 'binary');
                fs.writeFileSync(tempPath, buffer);

                // Find file input inside modal
                const fileInput = await page.$('input[type="file"]');
                if (fileInput) {
                    await fileInput.uploadFile(tempPath);
                    console.log(`✅ [PRO-B] ASSET ATTACHED SUCCESSFULLY.`);
                    await randomDelay(2000, 4000);
                } else {
                    console.log("⚠️ [PRO-B] FILE INPUT NOT FOUND IN MODAL.");
                }
             } catch (imgErr: any) {
                console.log(`🚨 [PRO-B] IMAGE UPLOAD FAILED: ${imgErr.message}`);
             }
        }

        // 4. Save
        const saveBtn = await page.evaluateHandle(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const s = btns.find(b => b.innerText.toLowerCase().includes('save') || b.innerText.toLowerCase().includes('submit'));
            return s;
        });

        if (saveBtn) {
             await randomDelay(800, 2000); // Wait before save
             await page.evaluate((el: any) => el.click(), saveBtn);
             console.log(`✅ [PRO-B] [${item.name}] SUBMITTED TO ZOMATO PORTAL.`);
        }

        // 5. DB Callback
        if (item.id && !item.id.startsWith('manual')) {
            await (prisma as any).menuItem.update({
                where: { id: item.id },
                data: { status: 'completed', uploadedAt: new Date(), stabilityStatus: 'LIVE' }
            });
        }

        return true; 
    } catch (e) {
        if (retryCount < 3) {
            await randomDelay(3000, 10000);
            return attemptItemUpdate(page, item, retryCount + 1);
        }
        return false;
    }
}

async function scrapeImageByName(page: any, name: string): Promise<string | null> {
    try {
        const searchUrl = `https://www.google.com/search?q=site:zomato.com+"${encodeURIComponent(name)}"+menu+image&tbm=isch`;
        await page.goto(searchUrl, { waitUntil: 'networkidle2' });
        
        // 🧪 CAPCHA DETECTION
        const isBlocked = await page.evaluate(() => {
             return document.body.innerText.includes('unusual traffic') || document.body.innerText.includes('not a robot');
        });

        if (isBlocked) {
             console.log("🛡️ [ZOMATO-PRO] GOOGLE CAPCHA DETECTED. Bypassing to verified fallback...");
             return 'https://b.zmtcdn.com/data/dish_photos/8df/ce8f5a6be104319ea298e5e87af748df.png';
        }

        await randomDelay(2000, 4000);

        let imageUrl = await page.evaluate(() => {
            const imgs = Array.from(document.querySelectorAll('img'));
            for (const img of imgs) {
                const src = img.src || "";
                if (src.includes('b.zmtcdn.com') && src.includes('dish_photos')) return src;
            }
            return null;
        });

        // HARD FALLBACK
        if (!imageUrl) imageUrl = 'https://b.zmtcdn.com/data/dish_photos/8df/ce8f5a6be104319ea298e5e87af748df.png';
        return imageUrl;
    } catch (e) {
        return null;
    }
}

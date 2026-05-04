import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import path from 'path';
import fs from 'fs';
import { emitUpdate } from '../lib/socket.js';

// @ts-ignore
puppeteer.use(StealthPlugin());

/**
 * 🏢 OUTLET DISCOVERY ENGINE
 * Automatically finds all managed outlets in your Zomato Partner Dashboard.
 */
export async function scrapeManagedOutlets() {
    const sessionPath = path.resolve('./zomato-session');
    if (!fs.existsSync(sessionPath)) {
        throw new Error("❌ SESSION NOT FOUND! Please run 'npm run zomato:login' first.");
    }

    const browser = await (puppeteer as any).launch({
        headless: false,
        defaultViewport: null,
        userDataDir: sessionPath,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--start-maximized',
            '--disable-blink-features=AutomationControlled'
        ]
    });

    try {
        const page = await browser.newPage();
        emitUpdate('scraper:log', { message: "🏢 [OUTLET-SCAN] OPENING PARTNER DASHBOARD...", status: 'primary' });
        
        // 1. Go to dashboard (Try both partner and partners)
        await page.goto('https://www.zomato.com/partner/dashboard', { waitUntil: 'networkidle2', timeout: 60000 });
        
        // 🛡️ AUTH CHECK
        const isLoggedOut = await page.evaluate(() => {
            return document.body.innerText.includes('Login') && !document.body.innerText.includes('Logout');
        });
        if (isLoggedOut) {
            throw new Error("🔐 SESSION EXPIRED! Please re-login using 'npm run zomato:login'.");
        }

        console.log("👉 SCANNING FOR OUTLETS (Waiting 10s for full load)...");
        emitUpdate('scraper:log', { message: "👉 SCANNING FOR OUTLETS...", status: 'primary' });

        // Wait to load
        await new Promise(r => setTimeout(r, 10000));

        // 2. Extract Links
        const rawLinks = await page.evaluate(() => {
            const anchors = Array.from(document.querySelectorAll('a'));
            return anchors.map(a => a.href);
        });

        console.log(`🔍 Total links found on page: ${rawLinks.length}`);
        // Log a few for debugging
        console.log("Samples:", rawLinks.slice(0, 5));

        const filteredLinks = rawLinks.filter((href: string) => 
            href.includes('/partner/') && (href.includes('/overview') || href.includes('/onlineordering') || href.includes('/menu'))
        );

        if (filteredLinks.length === 0) {
            console.log("⚠️ NO OUTLET LINKS DETECTED. Taking debug screenshot...");
            const debugPath = path.resolve('./tmp/debug_outlets.png');
            if (!fs.existsSync(path.resolve('./tmp'))) fs.mkdirSync(path.resolve('./tmp'));
            await page.screenshot({ path: debugPath });
            console.log(`📸 Debug screenshot saved to ${debugPath}`);
        }

        // 3. Normalize to /photos endpoint
        const outletIds = new Set<string>();
        const photoLinks = filteredLinks.map((link: string) => {
            // Extract ID: .../partner/12345/overview -> 12345
            const match = link.match(/\/partner\/(\d+)/);
            if (match && match[1]) {
                outletIds.add(match[1]);
                return `https://www.zomato.com/partners/onlineordering/menu/?resId=${match[1]}`;
            }
            return null;
        }).filter(Boolean);

        // Deduplicate
        const uniqueLinks = Array.from(new Set(photoLinks));
        const finalData = Array.from(outletIds).map(id => ({
            id,
            url: `https://www.zomato.com/partners/onlineordering/menu/?resId=${id}`
        }));

        console.log(`✅ FOUND ${finalData.length} UNIQUE OUTLETS!`);
        emitUpdate('scraper:log', { message: `✅ FOUND ${finalData.length} UNIQUE OUTLETS!`, status: 'success' });

        // Write to outlets.json
        fs.writeFileSync(path.resolve('./outlets.json'), JSON.stringify(finalData, null, 2));
        console.log("📁 Saved to outlets.json");

        return finalData;

    } catch (err: any) {
        console.error(`🚨 [OUTLET-SCAN] FAILED: ${err.message}`);
        emitUpdate('scraper:log', { message: `🚨 [OUTLET-SCAN] FAILED: ${err.message}`, status: 'error' });
        throw err;
    } finally {
        await browser.close();
    }
}

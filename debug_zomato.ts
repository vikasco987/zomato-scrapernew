import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';

// @ts-ignore
puppeteer.use(StealthPlugin());

async function debugState() {
    const url = "https://www.zomato.com/ncr/burger-king-connaught-place-new-delhi/order";
    console.log(`🔍 Debugging State for: ${url}`);
    
    const browser = await (puppeteer as any).launch({
        headless: "new",
        args: ['--no-sandbox']
    });

    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
    
    try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        const state = await page.evaluate(() => {
            // @ts-ignore
            const s = window.__PRELOADED_STATE__;
            if (!s) return "STATE_NOT_FOUND";
            return JSON.stringify(s, (key, value) => {
                if (Array.isArray(value)) return `Array(${value.length})`;
                if (typeof value === 'object' && value !== null) return `Object(${Object.keys(value).length})`;
                return value;
            }, 2);
        });

        fs.writeFileSync('zomato_state_debug.json', state);
        console.log("✅ State structure saved to zomato_state_debug.json");
    } catch (e: any) {
        console.error("❌ Failed:", e.message);
    } finally {
        await browser.close();
    }
}

debugState();

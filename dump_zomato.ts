import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';

// @ts-ignore
puppeteer.use(StealthPlugin());

async function dumpState() {
    const url = "https://www.zomato.com/ncr/burger-king-connaught-place-new-delhi/order";
    const browser = await (puppeteer as any).launch({ headless: "new", args: ['--no-sandbox'] });
    const page = await browser.newPage();
    try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        const data = await page.evaluate(() => {
            // @ts-ignore
            return window.__PRELOADED_STATE__ || document.documentElement.outerHTML.match(/window\.__PRELOADED_STATE__ = (.*);/)?.[1];
        });
        
        // Clean the data if it was matched from HTML (might be JSON.parse("..."))
        let clean = data;
        if (typeof data === 'string' && data.includes('JSON.parse(')) {
            const inner = data.match(/JSON\.parse\("(.*)"\)/)?.[1];
            if (inner) clean = JSON.parse(inner.replace(/\\"/g, '"').replace(/\\\\/g, '\\'));
        }
        
        fs.writeFileSync('zomato_raw.json', JSON.stringify(clean, null, 2));
        console.log("💾 Saved raw state to zomato_raw.json");
    } catch(e) { console.error("FAILED", e); }
    finally { await browser.close(); }
}
dumpState();

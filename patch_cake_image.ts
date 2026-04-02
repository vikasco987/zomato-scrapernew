import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import path from "path";
import fs from "fs";

puppeteer.use(StealthPlugin());

async function runPatch() {
    const sessionPath = path.resolve(`./sessions/zomato_pro_v2`);
    const browser = await (puppeteer as any).launch({
        headless: false,
        defaultViewport: null,
        userDataDir: sessionPath,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized']
    });

    try {
        const page = await browser.newPage();
        const targetId = "22442158";
        console.log(`📍 NAVIGATING TO RES: ${targetId}`);
        await page.goto(`https://www.zomato.com/partners/onlineordering/menu/editor?resId=${targetId}`, { waitUntil: 'networkidle2' });

        // 1. Clear search and search for 'Cake'
        console.log("🔍 SEARCHING FOR 'CAKE'...");
        await page.waitForSelector('input[placeholder*="search"]');
        await page.type('input[placeholder*="search"]', 'Cake', { delay: 100 });
        await new Promise(r => setTimeout(r, 2000));

        // 2. Find the 'Cake' item and click it
        const cakeFound = await page.evaluate(() => {
            const items = Array.from(document.querySelectorAll('div, span, p'));
            const cake = items.find(el => (el as any).innerText === 'Cake');
            if (cake) { (cake as any).click(); return true; }
            return false;
        });

        if (!cakeFound) {
            console.log("🚨 'CAKE' NOT FOUND IN LIST.");
            await browser.close(); return;
        }

        console.log("📂 CAKE MODAL OPENED. IDENTIFYING UPLOAD INPUT...");
        await new Promise(r => setTimeout(r, 3000));

        const fileInput = await page.waitForSelector('input[type="file"]');
        const imgPath = path.resolve('./tmp/cake_final.png');
        if (!fs.existsSync(imgPath)) throw new Error("Local image missing!");

        console.log(`📸 UPLOADING ASSET: ${imgPath}`);
        await fileInput.uploadFile(imgPath);
        await new Promise(r => setTimeout(r, 5000)); // Wait for upload completion

        // 3. Save modal
        console.log("💾 SAVING ITEM MODAL...");
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const save = btns.find(b => b.innerText.toLowerCase().includes('save') || b.innerText.toLowerCase().includes('submit'));
            if (save) (save as any).click();
        });
        await new Promise(r => setTimeout(r, 3000));

        // 4. Global Final Submit
        console.log("🏁 PERFORMING GLOBAL FINAL SUBMIT...");
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const b = btns.find(el => el.innerText.toLowerCase().includes('submit changes'));
            if (b) (b as any).click();
        });
        await new Promise(r => setTimeout(r, 3000));

        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const b = btns.find(el => el.innerText.toLowerCase().includes('submit for review'));
            if (b) (b as any).click();
        });

        console.log("✅ PATCH SUCCESSFUL: CAKE NOW HAS PHOTO!");

    } catch (err: any) {
        console.error(`🚨 PATCH FAILED: ${err.message}`);
    } finally {
        await browser.close();
    }
}

(async () => {
    try {
        await runPatch();
    } catch (e: any) {
        console.error(`🚨 FATAL: ${e.message}`);
    }
})();

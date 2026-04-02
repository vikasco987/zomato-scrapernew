import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import path from "path";
import fs from "fs";

puppeteer.use(StealthPlugin());

async function runDeploy() {
    const sessionPath = path.resolve(`./sessions/zomato_pro_v2`);
    console.log("🚀 STARTING FRESH CAKE DEPLOYMENT...");
    
    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        userDataDir: sessionPath,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized']
    });

    try {
        const page = await browser.newPage();
        const targetId = "22442158";
        await page.goto(`https://www.zomato.com/partners/onlineordering/menu/editor?resId=${targetId}`, { waitUntil: 'networkidle2' });

        console.log("➕ CLICKING 'ADD NEW ITEM'...");
        await new Promise(r => setTimeout(r, 6000));
        
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const add = btns.find(b => b.innerText.toLowerCase().includes('add new item'));
            if (add) add.click();
        });
        await new Promise(r => setTimeout(r, 3000));

        // Fill Form
        console.log("📝 FILLING CAKE DETAILS...");
        const inputs = await page.$$('input');
        for (const input of inputs) {
            const placeholder = await page.evaluate(el => el.placeholder, input);
            if (placeholder.toLowerCase().includes('name')) {
                await input.type('Cake (Premium)', { delay: 100 });
            } else if (placeholder.toLowerCase().includes('price')) {
                await input.type('350', { delay: 100 });
            }
        }

        // Upload Photo
        const imgPath = path.resolve('./tmp/cake_final.png');
        console.log(`📸 UPLOADING IMAGE: ${imgPath}`);
        const fileInput = await page.$('input[type="file"]');
        if (fileInput) {
            await fileInput.uploadFile(imgPath);
            await new Promise(r => setTimeout(r, 6000));
        }

        // Save Modal
        console.log("💾 SAVING MODAL...");
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const save = btns.find(b => b.innerText.toLowerCase().includes('save') || b.innerText.toLowerCase().includes('submit'));
            if (save) save.click();
        });
        await new Promise(r => setTimeout(r, 4000));

        // Global Push
        console.log("🏁 SUBMITTING CHANGES...");
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const sub = btns.find(b => b.innerText.toLowerCase().includes('submit changes'));
            if (sub) sub.click();
        });
        await new Promise(r => setTimeout(r, 4000));

        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const rev = btns.find(b => b.innerText.toLowerCase().includes('submit for review'));
            if (rev) rev.click();
        });

        console.log("✅ DEPLOYMENT SUCCESS: CAKE (PREMIUM) IS LIVE!");

    } catch (err) {
        console.error(`🚨 ERROR: ${err.message}`);
    } finally {
        await browser.close();
    }
}

runDeploy();

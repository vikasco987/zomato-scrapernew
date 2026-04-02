import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import path from "path";
import fs from "fs";

puppeteer.use(StealthPlugin());

async function randomDelay(min, max) {
    const time = Math.floor(Math.random() * (max - min + 1) + min);
    return new Promise(r => setTimeout(r, time));
}

async function runPatch() {
    const sessionPath = path.resolve(`./sessions/zomato_pro_v2`);
    console.log("🚀 STARTING PATCHER (JS)...");
    
    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        userDataDir: sessionPath,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized']
    });

    try {
        const page = await browser.newPage();
        const targetId = "22442158";
        console.log(`📍 NAVIGATING TO RES: ${targetId}`);
        await page.goto(`https://www.zomato.com/partners/onlineordering/menu/editor?resId=${targetId}`, { waitUntil: 'networkidle2', timeout: 60000 });

        // 1. Search for 'Cake'
        console.log("🔍 LOOKING FOR SEARCH BOX OR CAKE...");
        await randomDelay(5000, 8000); // Wait for full render
        
        await page.evaluate(() => {
            const inputs = Array.from(document.querySelectorAll('input'));
            const search = inputs.find(i => (i.placeholder || "").toLowerCase().includes('search'));
            if (search) {
                search.focus();
                search.value = 'Cake';
                search.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });
        await randomDelay(3000, 5000);

        // 2. Click 'Cake' (Robust - looking in right pane)
        const clicked = await page.evaluate(() => {
            const listItems = Array.from(document.querySelectorAll('div[data-testid*="menu-item"], .menu-item-row, div:has(> span)'));
            const cakeRow = listItems.find(el => {
                const text = el.innerText.toLowerCase();
                return text.includes('cake') && text.includes('350');
            });
            if (cakeRow) { 
                cakeRow.scrollIntoView();
                cakeRow.click(); 
                return true; 
            }
            // Fallback: Click ANY 'Cake' text not in sidebar
            const allTexts = Array.from(document.querySelectorAll('div, span, p, b, h6'));
            const mainCake = allTexts.find(el => {
                const rect = el.getBoundingClientRect();
                return el.innerText.trim() === 'Cake' && rect.left > 400; // Not sidebar
            });
            if (mainCake) {
                mainCake.click();
                return true;
            }
            return false;
        });

        if (!clicked) {
            console.log("🚨 'CAKE' NOT FOUND. CHECKING CATEGORIES...");
        }

        await new Promise(r => setTimeout(r, 4000));

        // 3. Upload File
        const imgPath = path.resolve('./tmp/cake_final.png');
        console.log(`📸 UPLOADING: ${imgPath}`);
        const fileInput = await page.$('input[type="file"]');
        if (fileInput) {
            await fileInput.uploadFile(imgPath);
            console.log("✅ FILE ATTACHED.");
            await new Promise(r => setTimeout(r, 5000));
        } else {
            console.log("⚠️ NO FILE INPUT FOUND.");
        }

        // 4. Save
        console.log("💾 SAVING...");
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const s = btns.find(b => b.innerText.toLowerCase().includes('save') || b.innerText.toLowerCase().includes('submit'));
            if (s) s.click();
        });
        await new Promise(r => setTimeout(r, 3000));

        // 5. Final Push
        console.log("🏁 GLOBAL SUBMIT...");
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const b = btns.find(el => el.innerText.toLowerCase().includes('submit changes'));
            if (b) b.click();
        });
        await new Promise(r => setTimeout(r, 4000));

        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const b = btns.find(el => el.innerText.toLowerCase().includes('submit for review'));
            if (b) b.click();
        });

        console.log("🏁 PATCH CYCLE COMPLETE.");

    } catch (err) {
        console.error(`🚨 ERROR: ${err.message}`);
    } finally {
        await browser.close();
    }
}

runPatch();

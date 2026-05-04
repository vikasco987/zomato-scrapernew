import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import path from 'path';
import fs from 'fs';

// @ts-ignore
puppeteer.use(StealthPlugin());

async function main() {
    const sessionPath = path.resolve('./zomato-session');
    if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, { recursive: true });

    console.log("🚀 INITIATING PERSISTENT SESSION LOGIN...");
    console.log(`📁 Session Path: ${sessionPath}`);
    console.log("--------------------------------------------------");
    console.log("Bhai, browser khul raha hai. Manually login kar lo.");
    console.log("Ek baar login ho jaye (dashboard dikhne lage), tab yaha aakar Ctrl+C kar dena.");
    console.log("Agli baar se ye bot bina OTP ke chalega! 🔥");
    console.log("--------------------------------------------------");

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

    const page = await browser.newPage();
    await page.goto('https://www.zomato.com/partners/onlineordering/', { waitUntil: 'networkidle2' });

    // Monitor for login success
    const interval = setInterval(async () => {
        try {
            const loggedIn = await page.evaluate(() => {
                const text = document.body.innerText.toLowerCase();
                return text.includes('logout') || text.includes('menu manager') || text.includes('order history');
            });
            if (loggedIn) {
                console.log("✅ SESSION DETECTED! Login successful.");
                console.log("Bhai, kaam ho gaya! Aap browser band kar sakte ho ya Ctrl+C daba do.");
                clearInterval(interval);
            }
        } catch (e) {
            // Page might be closed or navigating
        }
    }, 5000);

    // Keep active
    process.on('SIGINT', async () => {
        console.log("\n👋 Closing session... Your entry card is saved in './zomato-session'");
        await browser.close();
        process.exit(0);
    });
}

main();

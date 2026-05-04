import { scrapeManagedOutlets } from '../services/outletScraper.js';

async function main() {
    console.log("--------------------------------------------------");
    console.log("🚀 ZOMATO OUTLET SCANNER (Semi-Auto Mode) 🔥");
    console.log("--------------------------------------------------");
    
    try {
        const outlets = await scrapeManagedOutlets();
        console.log("--------------------------------------------------");
        console.log(`✅ SYNC COMPLETE!`);
        console.log(`📊 Total Outlets Found: ${outlets.length}`);
        console.log(`📁 Your 'outlets.json' is ready.`);
        console.log("--------------------------------------------------");
    } catch (err: any) {
        console.error("❌ FAILED TO SCRAPE OUTLETS:", err.message);
        process.exit(1);
    }
}

main();

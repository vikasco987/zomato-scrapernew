import { scrapeAndUpdateExternalMenu } from '../services/externalScraper.js';

async function main() {
    const userId = "user_3D1R0whHFVLAcnT8cgnB4kDTnfR";
    console.log(`🚀 STARTING LIVE SYNC FOR USER: ${userId}`);
    try {
        const result = await scrapeAndUpdateExternalMenu(userId);
        console.log(`\n✅ SYNC FINISHED! Result:`, JSON.stringify(result, null, 2));
    } catch (err) {
        console.error(`\n❌ CRITICAL SYNC ERROR:`, err);
    }
}

main();

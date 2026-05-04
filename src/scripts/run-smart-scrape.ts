import { scrapeLeads } from '../services/leadScraper.js';
import { prisma } from '../db/index.js';

async function main() {
    console.log("🚀 STARTING AUTOMATED SMART SCRAPE (Target: 400-500 Leads)");
    try {
        // We'll scrape for 'Delhi' which our leadScraper will break down into the Tier 2 localities we defined
        const leads = await scrapeLeads('Delhi', 'zomato');
        console.log(`✅ SCRAPE FINISHED! Extracted ${leads.length} leads.`);
    } catch (err) {
        console.error("❌ SCRAPE CRASHED:", err);
    } finally {
        await prisma.$disconnect();
        process.exit(0);
    }
}

main();

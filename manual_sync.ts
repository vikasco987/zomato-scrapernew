
import { scrapeAndUpdateExternalMenu } from "./src/services/externalScraper";
import { prisma } from "./src/db/index";

async function main() {
    const userId = "user_3BQZ1kvSiX7kWeqxlTpfGG8Piwl";
    console.log(`🚀 STARTING MANUAL SYNC FOR: ${userId}`);
    
    try {
        const result = await scrapeAndUpdateExternalMenu(userId);
        console.log("✅ SYNC RESULT:", JSON.stringify(result, null, 2));
    } catch (err: any) {
        console.error("❌ SYNC FAILED:", err.message);
    } finally {
        await prisma.$disconnect();
    }
}

main();

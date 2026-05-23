import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
    console.log("🔍 Fetching all sessions from database...");
    const sessions = await prisma.scrapingSession.findMany();

    console.log(`📊 Found ${sessions.length} sessions. Recalculating and updating counts...`);

    for (const session of sessions) {
        const actualCount = await prisma.restaurantLead.count({
            where: { sessionId: session.id }
        });
        
        await prisma.scrapingSession.update({
            where: { id: session.id },
            data: { 
                count: actualCount,
                // If count is > 0 and status is processing, let's mark it as completed
                status: actualCount > 0 ? 'completed' : session.status
            }
        });
        
        console.log(`✅ Updated Session ID: ${session.id} ("${session.location}") -> Count: ${actualCount}, Status: ${actualCount > 0 ? 'completed' : session.status}`);
    }

    console.log("\n🎉 All session counts fixed successfully in MongoDB!");
}

run().catch(console.error).finally(() => prisma.$disconnect());

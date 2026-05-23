import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
    console.log("📊 Fetching all lead sessions from Database...");
    const sessions = await prisma.scrapingSession.findMany();

    console.log(`\n==========================================`);
    console.log(`📂 Total Sessions in Database: ${sessions.length}`);
    for (const session of sessions) {
        const leadsCount = await prisma.restaurantLead.count({
            where: { sessionId: session.id }
        });
        console.log(`📁 Session: "${session.location}" | Source: ${session.source} | Status: ${session.status} | Leads Count: ${leadsCount}`);
    }

    const totalLeadsCount = await prisma.restaurantLead.count();
    console.log(`\n🎉 Total Restaurant Leads in MongoDB: ${totalLeadsCount}`);
}

run().catch(console.error).finally(() => prisma.$disconnect());

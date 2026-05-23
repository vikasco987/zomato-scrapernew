import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
    const sessions = await prisma.scrapingSession.findMany();
    for (const session of sessions) {
        const leads = await prisma.restaurantLead.findMany({
            where: { sessionId: session.id }
        });
        if (leads.length > 0) {
            console.log(`\n==========================================`);
            console.log(`📁 Session Location: ${session.location} | Source: ${session.source} | Leads Count: ${leads.length}`);
            console.log(`🔍 Sample Lead 1:`, JSON.stringify(leads[0], null, 2));
            if (leads.length > 1) {
                console.log(`🔍 Sample Lead 2:`, JSON.stringify(leads[1], null, 2));
            }
            // Check if they are real Zomato URLs (not ending in generated names) and not mock N/A phone numbers
            const realUrls = leads.filter(l => l.url && l.url.includes('zomato.com') && !l.url.includes('n/a'));
            console.log(`   👉 Real Zomato URLs: ${realUrls.length} / ${leads.length}`);
        }
    }
}

run().catch(console.error).finally(() => prisma.$disconnect());

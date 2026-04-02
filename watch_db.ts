import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function watchDatabase() {
    const startTime = new Date();
    console.log(`📡 [WATCHER] Monitoring Database since ${startTime.toISOString()}...`);
    
    const seenIds = new Set<string>();
    
    // Poll for 60 seconds
    for (let i = 0; i < 30; i++) {
        const newItems = await prisma.menuItem.findMany({
            where: {
                updatedAt: { gte: startTime },
                id: { notIn: Array.from(seenIds) }
            },
            take: 10,
            orderBy: { updatedAt: 'desc' }
        });
        
        for (const item of newItems) {
            console.log(`\n✨ [NEW ITEM DETECTED]: ${item.name}`);
            console.log(JSON.stringify(item, null, 2));
            seenIds.add(item.id);
        }
        
        await new Promise(r => setTimeout(r, 2000));
    }
    
    console.log(`\n🏁 [WATCHER] Finished monitoring session.`);
}

watchDatabase()
    .catch(console.error)
    .finally(() => prisma.$disconnect());

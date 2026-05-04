import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log('Fetching all menu items and their restaurants...');
    const items = await prisma.menuItem.findMany({
        include: { restaurant: true }
    });
    
    const summary: Record<string, { name: string, count: number, url: string }> = {};
    items.forEach(i => {
        const r = i.restaurant;
        if (!summary[r.id]) {
            summary[r.id] = { name: r.name, count: 0, url: r.url || 'N/A' };
        }
        summary[r.id].count++;
    });
    
    console.log('Restaurant Summary:');
    console.table(Object.values(summary));
}

main().finally(() => prisma.$disconnect());

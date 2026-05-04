import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log('Fetching unique restaurant IDs from MenuItems...');
    const items = await prisma.menuItem.findMany({
        select: { restaurantId: true },
        distinct: ['restaurantId']
    });
    console.log('IDs:', items.map(i => i.restaurantId));
    
    for (const id of items.map(i => i.restaurantId)) {
        const resto = await prisma.restaurant.findUnique({ where: { id } });
        console.log(`ID: ${id} -> Name: ${resto?.name}`);
    }
}

main().finally(() => prisma.$disconnect());

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log('Searching for items...');
    const items = await prisma.menuItem.findMany({
        where: {
            OR: [
                { name: { contains: 'Paneer Finger' } },
                { name: { contains: 'Gobhi Manchurian' } }
            ]
        },
        include: {
            restaurant: true
        }
    });
    console.log(`Found ${items.length} items.`);
    items.forEach(item => {
        console.log(`- Item: ${item.name} | Restaurant: ${item.restaurant.name} (ID: ${item.restaurantId})`);
    });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

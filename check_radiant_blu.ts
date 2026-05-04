import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log('Searching for Radiant Blu...');
    const restaurants = await prisma.restaurant.findMany({
        where: {
            name: { contains: 'Radiant', mode: 'insensitive' }
        }
    });

    console.log(`\n--- MATCHING RESTAURANTS: ${restaurants.length} ---`);
    console.log(JSON.stringify(restaurants, null, 4));

    if (restaurants.length > 0) {
        for (const res of restaurants) {
            const count = await prisma.menuItem.count({
                where: { restaurantId: res.id }
            });
            console.log(`Restaurant: ${res.name}, DB Items: ${count}`);
        }
    }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

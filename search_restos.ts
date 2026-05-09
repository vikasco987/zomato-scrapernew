import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log('Searching for restaurants with "Taste"...');
    const restos = await prisma.restaurant.findMany({
        where: {
            name: { contains: 'Taste', mode: 'insensitive' }
        }
    });
    console.log(`Found ${restos.length} restaurants.`);
    console.log(JSON.stringify(restos, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

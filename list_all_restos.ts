import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log('Listing all restaurants in DB...');
    const restos = await prisma.restaurant.findMany();
    console.log(`Total Restaurants: ${restos.length}`);
    restos.forEach(r => {
        console.log(`- ID: ${r.id} | Name: ${r.name} | URL: ${r.url}`);
    });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

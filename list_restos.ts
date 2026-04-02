import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const restos = await prisma.restaurant.findMany();
    console.log(`\n--- RESTAURANTS IN DB: ${restos.length} ---`);
    console.log(JSON.stringify(restos, null, 4));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

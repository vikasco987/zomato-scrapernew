import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log('Searching for "Gauva" in FoodImage table...');
    const images = await prisma.foodImage.findMany({
        where: { foodName: { contains: 'Gauva', mode: 'insensitive' } }
    });
    console.log(JSON.stringify(images, null, 2));
}

main().finally(() => prisma.$disconnect());

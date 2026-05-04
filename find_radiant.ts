import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log('Searching for Radiant Blu...');
    const restos = await prisma.restaurant.findMany({
        where: {
            OR: [
                { name: { contains: 'Radiant', mode: 'insensitive' } },
                { name: { contains: 'Blu', mode: 'insensitive' } }
            ]
        }
    });
    console.log('Results:', JSON.stringify(restos, null, 2));
}

main().finally(() => prisma.$disconnect());

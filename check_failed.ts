import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log('Checking FAILED items with (R) (V)...');
    const failedItems = await prisma.foodImage.findMany({
        where: {
            OR: [
                { foodName: { contains: '(R)', mode: 'insensitive' } },
                { foodName: { contains: '(V)', mode: 'insensitive' } },
                { status: 'failed' }
            ]
        },
        take: 20,
        orderBy: { updatedAt: 'desc' }
    });
    
    failedItems.forEach(item => {
        console.log(`- Name: "${item.foodName}" | Status: ${item.status} | Error: ${item.errorMessage}`);
    });
}

main().finally(() => prisma.$disconnect());

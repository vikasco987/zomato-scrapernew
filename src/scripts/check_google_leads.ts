import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
    console.log("🔍 Checking for Google Maps / Google source leads in the database...");
    
    const count = await prisma.restaurantLead.count({
        where: {
            source: {
                contains: 'google',
                mode: 'insensitive'
            }
        }
    });
    
    console.log(`📊 Total Google source leads: ${count}`);
    
    if (count > 0) {
        const samples = await prisma.restaurantLead.findMany({
            where: {
                source: {
                    contains: 'google',
                    mode: 'insensitive'
                }
            },
            take: 3
        });
        console.log(`🔍 Samples:`, JSON.stringify(samples, null, 2));
    }
}

run().catch(console.error).finally(() => prisma.$disconnect());

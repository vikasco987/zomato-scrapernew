import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log('Checking Scraper Jobs...');
    const jobs = await prisma.scraperJob.findMany({
        take: 20,
        orderBy: { createdAt: 'desc' }
    });
    console.log('Recent Jobs:', JSON.stringify(jobs, null, 2));
}

main().finally(() => prisma.$disconnect());

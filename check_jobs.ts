import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function checkJobs() {
    const jobs = await prisma.scraperJob.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5
    });

    console.log(`\n🌊 [JOB STATUS] Recent Jobs:`);
    jobs.forEach((j: any) => {
        console.log(`- ID: ${j.id} | User: ${j.userId} | Status: ${j.status} | Processed: ${j.processedCount}/${j.totalItems}`);
    });
    
    process.exit();
}

checkJobs();

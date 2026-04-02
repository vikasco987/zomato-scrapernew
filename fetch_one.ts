import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const item = await prisma.menuItem.findFirst({
        orderBy: { createdAt: 'desc' }
    });
    
    if (item) {
        console.log(`\n--- LIVE DATABASE RECORD [FULL SCHEMA] ---`);
        console.log(JSON.stringify(item, null, 4));
    } else {
        console.log(`⚠️ No items found in the database.`);
    }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

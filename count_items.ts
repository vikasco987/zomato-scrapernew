import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const totalCount = await prisma.menuItem.count();
    const restaurants = await prisma.restaurant.findMany({
        include: { _count: { select: { menuItems: true } } }
    });
    
    console.log('--- DATABASE AUDIT ---');
    console.log(`Total Menu Items: ${totalCount}`);
    console.log('--- RESTAURANTS ---');
    restaurants.forEach(r => {
        console.log(`- ${r.name} (Slug: ${r.slug}): ${r._count.menuItems} items`);
    });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

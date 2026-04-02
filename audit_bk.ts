import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const slug = 'order'; // As we found earlier
    const restaurant = await prisma.restaurant.findUnique({
        where: { slug }
    });
    
    if (restaurant) {
        const items = await prisma.menuItem.findMany({
            where: { restaurantId: restaurant.id },
            take: 10,
            orderBy: { createdAt: 'desc' }
        });
        
        console.log(`--- [BURGER KING] SCRAPED ASSETS AUDIT ---`);
        items.forEach((it, idx) => {
            console.log(`\nItem #${idx + 1}: ${it.name}`);
            console.log(`- Price: ₹${it.price}`);
            console.log(`- Category: ${it.category}`);
            console.log(`- Image URL: ${it.image || 'N/A'}`);
            console.log(`- Status: ${it.status}`);
        });
    } else {
        console.log(`⚠️ Restaurant with slug "${slug}" not found.`);
    }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

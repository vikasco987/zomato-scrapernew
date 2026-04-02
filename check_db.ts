import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function check() {
    const items = await prisma.menuItem.findMany({
        where: { name: { contains: "", mode: "insensitive" } },
        include: { restaurant: true },
        take: 10,
        orderBy: { createdAt: 'desc' }
    });

    console.log(`\n🔍 [DATABASE CHECK] Recent Scraped Items:`);
    items.forEach((it: any) => {
        console.log(`- [${it.restaurant?.name}] ${it.name} | ₹${it.price} | Image: ${it.image ? "✅" : "❌"}`);
    });
    
    if (items.length === 0) console.log("⚠️ No items found in the database.");
    
    process.exit();
}

check();

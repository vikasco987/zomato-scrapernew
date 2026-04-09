import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    const r = await (prisma as any).restaurant.findMany({
        where: { name: { contains: "Club", mode: "insensitive" } }
    });
    console.log(JSON.stringify(r, null, 2));
}
main().finally(() => (prisma as any).$disconnect());

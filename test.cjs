const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const foods = await prisma.foodImage.findMany({
            orderBy: { updatedAt: 'desc' },
            take: 100
        });
  const badFoods = foods.filter(f => !f.foodName);
  console.log("Bad foods count:", badFoods.length);
  if (badFoods.length > 0) console.log(badFoods[0]);
}
main().catch(console.error).finally(() => prisma.$disconnect());

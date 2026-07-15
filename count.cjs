const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const count = await prisma.foodImage.count();
  console.log("FoodImage count:", count);
}
main().catch(console.error).finally(() => prisma.$disconnect());

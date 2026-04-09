import { prisma } from "./src/db/index.js";
async function run() {
  const result = await (prisma as any).restaurant.findMany({
    where: { name: { contains: "Kozzy", mode: "insensitive" } }
  });
  console.log(JSON.stringify(result, null, 2));
}
run().finally(() => (prisma as any).$disconnect());

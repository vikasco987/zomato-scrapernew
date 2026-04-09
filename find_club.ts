import { prisma } from "./src/db/index.js";
async function run() {
  const all = await (prisma as any).restaurant.findMany({
    where: { name: { contains: "Club", mode: "insensitive" } }
  });
  console.log(`FOUND ${all.length} CLUBS:`);
  all.forEach((r: any) => console.log(`- ${r.name} (${r.id})`));
}
run().finally(() => (prisma as any).$disconnect());

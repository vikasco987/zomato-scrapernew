import { prisma } from "./src/db/index.js";
async function run() {
  const all = await (prisma as any).restaurant.findMany();
  console.log(`TOTAL RESTOS IN DB: ${all.length}`);
  all.forEach((r: any) => console.log(`- ${r.name} (${r.id})`));
}
run().finally(() => (prisma as any).$disconnect());

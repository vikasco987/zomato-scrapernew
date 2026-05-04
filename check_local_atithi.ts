
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const atithi = await prisma.restaurant.findMany({
    where: {
      name: {
        contains: "Atithi",
        mode: 'insensitive'
      }
    }
  })
  console.log("Local Atithi:", JSON.stringify(atithi, null, 2))
  
  const allCount = await prisma.restaurant.count()
  console.log("Total Local Restaurants:", allCount)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())

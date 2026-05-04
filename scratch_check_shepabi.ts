
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const name = "SHEPABI RESTAURANT & CAFE"
  const restaurants = await prisma.restaurant.findMany({
    where: {
      name: {
        contains: name,
        mode: 'insensitive'
      }
    }
  })
  console.log("Found Local Restaurants:", JSON.stringify(restaurants, null, 2))
  
  const leads = await prisma.restaurantLead.findMany({
    where: {
      name: {
        contains: name,
        mode: 'insensitive'
      }
    }
  })
  console.log("Found Local Leads:", JSON.stringify(leads, null, 2))
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

const ORG_NAME = "CoHost Management"

async function main() {
  const existing = await prisma.org.findFirst({ where: { name: ORG_NAME } })
  if (existing) {
    console.log(`Org "${ORG_NAME}" already exists (id=${existing.id}); skipping.`)
    return
  }
  const org = await prisma.org.create({ data: { name: ORG_NAME } })
  console.log(`Seeded org "${ORG_NAME}" with id=${org.id}`)
}

main()
  .catch((err) => { console.error(err); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })

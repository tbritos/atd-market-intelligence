
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const website = await prisma.website.findFirst({
    select: { id: true, url: true }
  });
  console.log(JSON.stringify(website));
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import { dealerGroupEnrichmentService } from '../services/enrichment/dealer-group-enrichment.service';
import prisma from '../utils/prisma';

async function main() {
  const brandSlug = process.argv[2] ?? 'fiat';
  const limit = Number(process.argv[3] ?? '5');

  console.log(`\nApollo enrichment for brand=${brandSlug} limit=${limit}\n`);

  const results = await dealerGroupEnrichmentService.enrichApolloBatch({ brandSlug, limit });

  for (const result of results) {
    if ('error' in result) {
      console.log(`❌ ${result.domain} — ${result.error}`);
      continue;
    }

    console.log(`✅ ${result.domain} — org=${result.orgName ?? 'não encontrada'} — people=${result.peopleCount} — sdr=${result.readyForSdr}`);
  }

  const brand = await prisma.brand.findFirst({ where: { slug: brandSlug }, select: { id: true, name: true } });
  if (brand) {
    const summary = await prisma.dealerGroup.groupBy({
      by: ['apolloStatus'],
      where: { brandId: brand.id },
      _count: { _all: true },
    });

    console.log('\nStatus Apollo no banco:');
    for (const row of summary) {
      console.log(`- ${row.apolloStatus}: ${row._count._all}`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

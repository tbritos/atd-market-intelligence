import 'dotenv/config';
import prisma from '../utils/prisma';

type SummaryRow = {
  region: string;
  stateCode: string;
  stateName: string;
  brandName: string;
  count: number;
};

async function main() {
  const grouped = await prisma.store.groupBy({
    by: ['brandId', 'stateId'],
    where: { discoverySource: 'google_places' },
    _count: { _all: true },
  });

  const [brands, states, totalStores] = await Promise.all([
    prisma.brand.findMany({ select: { id: true, name: true, slug: true } }),
    prisma.state.findMany({ select: { id: true, code: true, name: true, region: true } }),
    prisma.store.count({ where: { discoverySource: 'google_places' } }),
  ]);

  const brandMap = new Map(brands.map((brand) => [brand.id, brand]));
  const stateMap = new Map(states.map((state) => [state.id, state]));

  const rows: SummaryRow[] = grouped
    .map((row) => {
      const brand = brandMap.get(row.brandId);
      const state = stateMap.get(row.stateId);
      if (!brand || !state) return null;

      return {
        region: state.region,
        stateCode: state.code,
        stateName: state.name,
        brandName: brand.name,
        count: row._count._all,
      };
    })
    .filter((row): row is SummaryRow => Boolean(row))
    .sort((a, b) => b.count - a.count || a.stateCode.localeCompare(b.stateCode) || a.brandName.localeCompare(b.brandName));

  const byRegion = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.region] = (acc[row.region] ?? 0) + row.count;
    return acc;
  }, {});

  const byState = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.stateCode] = (acc[row.stateCode] ?? 0) + row.count;
    return acc;
  }, {});

  console.log(JSON.stringify({
    totalGooglePlacesStores: totalStores,
    byRegion,
    byState,
    topBrandStatePairs: rows.slice(0, 50),
  }, null, 2));
}

main()
  .catch((error) => {
    console.error('Google Places audit failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

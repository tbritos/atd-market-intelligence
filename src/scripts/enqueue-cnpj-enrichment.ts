import dotenv from 'dotenv';
dotenv.config();

import prisma from '../utils/prisma';
import { cnpjEnrichmentQueue } from '../config/queue';

async function run() {
  const stores = await prisma.store.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      website: { select: { url: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`Enqueuing CNPJ enrichment for ${stores.length} stores...`);

  let count = 0;
  for (const store of stores) {
    await cnpjEnrichmentQueue.add(
      'enrichCnpj',
      {
        storeId: store.id,
        storeName: store.name,
        websiteUrl: store.website?.url ?? null,
      },
      // Spread jobs over time to avoid hammering BrasilAPI (rate limit: ~3 req/s)
      { delay: count * 400 }
    );
    count++;
  }

  console.log(`Done! ${count} jobs enqueued.`);
  await cnpjEnrichmentQueue.close();
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });

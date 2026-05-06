/**
 * import-apify-runs.ts
 *
 * Baixa os datasets de TODOS os runs anteriores do Apify e importa para o banco.
 * Roda sem gastar nada — apenas lê dados já coletados.
 *
 * Usage: npx ts-node src/scripts/import-apify-runs.ts [stateCode]
 * Exemplo: npx ts-node src/scripts/import-apify-runs.ts SP
 */

import axios from 'axios';
import prisma from '../utils/prisma';
import { storeDeduplicatorService, DiscoveredStore } from '../services/discovery/store-deduplicator.service';

const APIFY_TOKEN = process.env.APIFY_TOKEN!;
const ACTOR_ID = 'compass~crawler-google-places';

async function listRuns(limit = 100) {
  const { data } = await axios.get(
    `https://api.apify.com/v2/acts/${ACTOR_ID}/runs`,
    { params: { token: APIFY_TOKEN, limit, desc: true }, timeout: 15000 }
  );
  return data.data.items as any[];
}

async function fetchDataset(runId: string): Promise<any[]> {
  try {
    const { data } = await axios.get(
      `https://api.apify.com/v2/actor-runs/${runId}/dataset/items`,
      { params: { token: APIFY_TOKEN, limit: 1000 }, timeout: 20000 }
    );
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function main() {
  if (!APIFY_TOKEN) throw new Error('APIFY_TOKEN não configurado no .env');

  const stateFilter = process.argv[2]?.toUpperCase();

  // Carrega estados e marcas do banco
  const states = await prisma.state.findMany({ select: { id: true, name: true, code: true } });
  const brands = await prisma.brand.findMany({ select: { id: true, name: true, slug: true } });

  const stateMap = Object.fromEntries(states.map(s => [s.code, s]));
  const brandList = brands.map(b => ({
    ...b,
    nameLower: b.name.toLowerCase(),
    slugLower: b.slug.toLowerCase(),
  }));

  console.log(`\n📦 Buscando runs do actor ${ACTOR_ID}...`);
  const runs = await listRuns(100);
  console.log(`   ${runs.length} runs encontrados\n`);

  // Aborta qualquer run ainda RUNNING para parar o gasto
  const running = runs.filter((r: any) => r.status === 'RUNNING');
  if (running.length > 0) {
    console.log(`⚠️  ${running.length} runs ainda RUNNING — abortando...`);
    for (const r of running) {
      try {
        await axios.post(
          `https://api.apify.com/v2/actor-runs/${r.id}/abort`,
          undefined,
          { params: { token: APIFY_TOKEN }, timeout: 10000 }
        );
        console.log(`  ✅ Run ${r.id} abortado`);
      } catch (e: any) {
        console.error(`  ❌ Falha ao abortar ${r.id}:`, e.message);
      }
    }
    console.log('');
  }

  let totalImported = 0;
  let totalCreated = 0;
  let totalUpdated = 0;

  for (const run of runs) {
    const cost = run.usageTotalUsd?.toFixed(3) ?? '?';
    console.log(`Run ${run.id} — status: ${run.status} — $${cost}`);

    // Sempre tenta buscar o dataset (itemsWritten pode vir 0 mesmo com dados)
    const items = await fetchDataset(run.id);
    if (items.length === 0) {
      console.log(`  ⏭ Dataset vazio\n`);
      continue;
    }
    console.log(`  📥 ${items.length} lugares para processar...`);

    let runCreated = 0, runUpdated = 0, runSkipped = 0;

    for (const r of items) {
      if (!r.title) { runSkipped++; continue; }

      // Tenta descobrir o estado pelo endereço
      let stateId: string | null = null;
      if (stateFilter) {
        const s = stateMap[stateFilter];
        if (s) stateId = s.id;
      } else {
        // Tenta extrair UF do endereço
        const addrUp = (r.address ?? '').toUpperCase();
        for (const s of states) {
          if (addrUp.includes(`, ${s.code}`) || addrUp.includes(`- ${s.code}`) || addrUp.includes(` ${s.code},`)) {
            stateId = s.id;
            break;
          }
          if (addrUp.includes(s.name.toUpperCase())) {
            stateId = s.id;
            break;
          }
        }
      }

      if (!stateId) { runSkipped++; continue; }

      // Match de marca pelo nome
      const nameLower = r.title.toLowerCase();
      const matched = brandList.find(b =>
        nameLower.includes(b.nameLower) || nameLower.includes(b.slugLower)
      );

      if (!matched) { runSkipped++; continue; }

      const state = states.find(s => s.id === stateId)!;
      const cityName = extractCity(r.address, state.name);

      const store: DiscoveredStore = {
        name: r.title,
        brandId: matched.id,
        stateId,
        source: 'google_places',
        cityName,
        phone: r.phone ?? null,
        website: r.website ?? null,
        lat: r.location?.lat ?? null,
        lng: r.location?.lng ?? null,
        rating: r.totalScore ?? null,
        reviews: r.reviewsCount ?? null,
        externalId: r.placeId ?? null,
        openingHours: r.openingHours?.map((h: any) => ({ day: h.day, hours: h.hours })) ?? null,
      };

      try {
        const result = await storeDeduplicatorService.upsert(store);
        result.action === 'created' ? runCreated++ : runUpdated++;
      } catch {
        runSkipped++;
      }
    }

    console.log(`  ✅ ${runCreated} criados, ${runUpdated} atualizados, ${runSkipped} ignorados\n`);
    totalCreated += runCreated;
    totalUpdated += runUpdated;
    totalImported += items.length;
  }

  console.log(`\n🎉 Importação concluída!`);
  console.log(`   Total processados: ${totalImported}`);
  console.log(`   Criados: ${totalCreated}`);
  console.log(`   Atualizados: ${totalUpdated}`);

  await prisma.$disconnect();
}

function extractCity(address: string | null, stateName: string): string | null {
  if (!address) return null;
  const parts = address.split(',').map(p => p.trim());
  for (const part of parts) {
    const clean = part.replace(/\s*-\s*.+$/, '').trim();
    if (
      clean.length > 2 &&
      !clean.match(/^\d/) &&
      !clean.toLowerCase().includes('brasil') &&
      !clean.toLowerCase().includes(stateName.toLowerCase().slice(0, 4))
    ) {
      return clean;
    }
  }
  return null;
}

main().catch(console.error);

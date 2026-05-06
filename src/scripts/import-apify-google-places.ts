import dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';
import prisma from '../utils/prisma';
import { normalizeUrl } from '../utils/url';

type BrandRecord = { id: string; name: string; normalized: string };
type StateRecord = { id: string; name: string; code: string; normalized: string };

type ApifyRun = {
  id: string;
  status?: string;
  defaultDatasetId?: string | null;
};

type ApifyDatasetItem = {
  placeId?: string | null;
  title?: string | null;
  address?: string | null;
  street?: string | null;
  phone?: string | null;
  website?: string | null;
  totalScore?: number | null;
  reviewsCount?: number | null;
  location?: { lat?: number | null; lng?: number | null } | null;
  openingHours?: Array<{ day?: string; hours?: string }> | null;
};

type ImportContext = {
  dryRun: boolean;
  strictTitleMatch: boolean;
  defaultGroupId: string;
  brands: BrandRecord[];
  states: StateRecord[];
};

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseArgs(argv: string[]) {
  const args = new Map<string, string | boolean>();

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;

    const [flag, inlineValue] = token.split('=', 2);
    if (inlineValue !== undefined) {
      args.set(flag, inlineValue);
      continue;
    }

    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args.set(flag, true);
      continue;
    }

    args.set(flag, next);
    i++;
  }

  const dryRun = Boolean(args.get('--dry-run'));
  const strictTitleMatch = Boolean(args.get('--strict-title-match'));
  const recent = args.get('--recent');
  const runsArg = args.get('--runs');

  const recentCount = typeof recent === 'string' ? Number(recent) : null;
  const runIds = typeof runsArg === 'string'
    ? runsArg.split(',').map((value) => value.trim()).filter(Boolean)
    : [];

  if (!runIds.length && (!recentCount || Number.isNaN(recentCount) || recentCount <= 0)) {
    throw new Error('Use --runs <run1,run2,...> or --recent <n>.');
  }

  return { dryRun, strictTitleMatch, recentCount, runIds };
}

async function fetchRecentRunIds(token: string, limit: number): Promise<string[]> {
  const { data } = await axios.get('https://api.apify.com/v2/acts/compass~crawler-google-places/runs', {
    params: {
      token,
      limit,
      desc: 1,
    },
    timeout: 20000,
  });

  return (data.data?.items ?? [])
    .map((item: any) => item.id)
    .filter((value: unknown): value is string => typeof value === 'string');
}

async function fetchRun(token: string, runId: string): Promise<ApifyRun> {
  const { data } = await axios.get(`https://api.apify.com/v2/actor-runs/${runId}`, {
    params: { token },
    timeout: 20000,
  });

  return data.data;
}

async function fetchDatasetItems(token: string, runId: string): Promise<ApifyDatasetItem[]> {
  const items: ApifyDatasetItem[] = [];
  const limit = 1000;
  let offset = 0;

  while (true) {
    const { data } = await axios.get(`https://api.apify.com/v2/actor-runs/${runId}/dataset/items`, {
      params: {
        token,
        clean: true,
        format: 'json',
        offset,
        limit,
      },
      timeout: 30000,
    });

    const batch = Array.isArray(data) ? data : [];
    items.push(...batch);

    if (batch.length < limit) break;
    offset += limit;
  }

  return items;
}

function inferBrand(items: ApifyDatasetItem[], brands: BrandRecord[]) {
  const ranked = brands
    .map((brand) => ({
      brand,
      score: items.reduce((count, item) => {
        const title = normalizeText(item.title ?? '');
        return count + (title.includes(brand.normalized) ? 1 : 0);
      }, 0),
    }))
    .sort((a, b) => b.score - a.score || b.brand.normalized.length - a.brand.normalized.length);

  if (!ranked[0] || ranked[0].score === 0) {
    throw new Error('Unable to infer brand from dataset items.');
  }

  return ranked[0].brand;
}

function inferState(items: ApifyDatasetItem[], states: StateRecord[]) {
  const ranked = states
    .map((state) => ({
      state,
      score: items.reduce((count, item) => {
        const address = item.address ?? item.street ?? '';
        const normalizedAddress = normalizeText(address);
        const stateCodeRegex = new RegExp(`(^|\\W)${state.code.toLowerCase()}($|\\W)`, 'i');
        return count + (
          normalizedAddress.includes(state.normalized) || stateCodeRegex.test(address)
            ? 1
            : 0
        );
      }, 0),
    }))
    .sort((a, b) => b.score - a.score || b.state.normalized.length - a.state.normalized.length);

  if (!ranked[0] || ranked[0].score === 0) {
    throw new Error('Unable to infer state from dataset addresses.');
  }

  return ranked[0].state;
}

async function getDefaultGroupId(): Promise<string> {
  let group = await prisma.group.findFirst({ where: { slug: 'default' } });

  if (!group) {
    group = await prisma.group.create({
      data: {
        name: 'Default Group',
        slug: 'default',
        description: 'Default group for imported stores',
        isActive: true,
      },
    });
  }

  return group.id;
}

function extractCityName(address: string | null | undefined, stateName: string): string | null {
  if (!address) return null;

  const parts = address.split(',').map((part) => part.trim()).filter(Boolean);
  const normalizedState = normalizeText(stateName);

  for (let i = parts.length - 1; i >= 0; i--) {
    const piece = parts[i].replace(/\s*-\s*brasil$/i, '').trim();
    const leftSide = piece.split('-')[0].trim();
    const normalizedPiece = normalizeText(leftSide);

    if (!normalizedPiece) continue;
    if (normalizedPiece.includes('brasil')) continue;
    if (normalizedPiece === normalizedState) continue;
    if (/^\d+$/.test(normalizedPiece)) continue;

    return leftSide;
  }

  return null;
}

async function resolveCityId(cityName: string | null, stateId: string, dryRun: boolean): Promise<string | null> {
  if (!cityName) return null;

  const existing = await prisma.city.findFirst({
    where: {
      stateId,
      name: { equals: cityName.trim(), mode: 'insensitive' },
    },
  });

  if (existing) return existing.id;
  if (dryRun) return null;

  try {
    const created = await prisma.city.create({
      data: {
        ibgeCode: Math.floor(Math.random() * 4000000) + 5000000,
        name: cityName.trim(),
        stateId,
        isCapital: false,
      },
    });

    return created.id;
  } catch {
    const retried = await prisma.city.findFirst({
      where: {
        stateId,
        name: { equals: cityName.trim(), mode: 'insensitive' },
      },
    });

    return retried?.id ?? null;
  }
}

async function resolveWebsiteId(websiteUrl: string | null | undefined, brandId: string, dryRun: boolean): Promise<string | null> {
  if (!websiteUrl) return null;

  let normalized: string;
  try {
    normalized = normalizeUrl(websiteUrl);
  } catch {
    return null;
  }

  const existing = await prisma.website.findUnique({ where: { url: normalized } });
  if (existing) return existing.id;
  if (dryRun) return null;

  const created = await prisma.website.create({
    data: {
      url: normalized,
      brandId,
      isActive: true,
    },
  });

  return created.id;
}

async function upsertStore(
  item: ApifyDatasetItem,
  brand: BrandRecord,
  state: StateRecord,
  context: ImportContext
) {
  const name = item.title?.trim();
  if (!name) return { action: 'skipped' as const };

  if (context.strictTitleMatch && !normalizeText(name).includes(brand.normalized)) {
    return { action: 'skipped' as const };
  }

  const address = item.address ?? item.street ?? null;
  const cityName = extractCityName(address, state.name);
  const cityId = await resolveCityId(cityName, state.id, context.dryRun);
  const websiteId = await resolveWebsiteId(item.website ?? null, brand.id, context.dryRun);
  const existing = await prisma.store.findFirst({
    where: { name, brandId: brand.id, stateId: state.id },
  });

  const data = {
    name,
    brandId: brand.id,
    groupId: context.defaultGroupId,
    stateId: state.id,
    cityId,
    websiteId,
    latitude: item.location?.lat ?? null,
    longitude: item.location?.lng ?? null,
    rating: item.totalScore ?? null,
    reviews: item.reviewsCount ?? null,
    phone: item.phone ?? null,
    isActive: true,
    discoverySource: 'google_places',
    externalId: item.placeId ?? null,
    openingHours: item.openingHours?.map((h) => ({ day: h.day ?? '', hours: h.hours ?? '' })) ?? undefined,
    lastDiscoveredAt: new Date(),
  };

  if (!existing) {
    if (!context.dryRun) {
      await prisma.store.create({ data });
    }

    return { action: 'created' as const };
  }

  if (!context.dryRun) {
    await prisma.store.update({
      where: { id: existing.id },
      data: {
        cityId: existing.cityId ?? cityId ?? undefined,
        websiteId: existing.websiteId ?? websiteId ?? undefined,
        latitude: existing.latitude ?? data.latitude ?? undefined,
        longitude: existing.longitude ?? data.longitude ?? undefined,
        rating: data.rating ?? existing.rating ?? undefined,
        reviews: data.reviews ?? existing.reviews ?? undefined,
        phone: existing.phone ?? data.phone ?? undefined,
        externalId: existing.externalId ?? data.externalId ?? undefined,
        openingHours: data.openingHours ?? undefined,
        lastDiscoveredAt: data.lastDiscoveredAt,
        isActive: true,
      },
    });
  }

  return { action: 'updated' as const };
}

async function importRun(runId: string, token: string, context: ImportContext) {
  const run = await fetchRun(token, runId);
  const items = await fetchDatasetItems(token, runId);

  if (!items.length) {
    return {
      runId,
      status: run.status ?? 'UNKNOWN',
      brand: 'unknown',
      state: 'unknown',
      totalItems: 0,
      created: 0,
      updated: 0,
      skipped: 0,
    };
  }

  const brand = inferBrand(items, context.brands);
  const state = inferState(items, context.states);

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const item of items) {
    const result = await upsertStore(item, brand, state, context);
    if (result.action === 'created') created++;
    if (result.action === 'updated') updated++;
    if (result.action === 'skipped') skipped++;
  }

  return {
    runId,
    status: run.status ?? 'UNKNOWN',
    brand: brand.name,
    state: state.name,
    totalItems: items.length,
    created,
    updated,
    skipped,
  };
}

async function main() {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    throw new Error('APIFY_TOKEN is not set.');
  }

  const { dryRun, strictTitleMatch, recentCount, runIds } = parseArgs(process.argv.slice(2));
  const resolvedRunIds = runIds.length ? runIds : await fetchRecentRunIds(token, recentCount!);

  const [defaultGroupId, brands, states] = await Promise.all([
    getDefaultGroupId(),
    prisma.brand.findMany({ select: { id: true, name: true } }),
    prisma.state.findMany({ select: { id: true, name: true, code: true } }),
  ]);

  const context: ImportContext = {
    dryRun,
    strictTitleMatch,
    defaultGroupId,
    brands: brands.map((brand) => ({ ...brand, normalized: normalizeText(brand.name) })),
    states: states.map((state) => ({ ...state, normalized: normalizeText(state.name) })),
  };

  console.log(`Importing ${resolvedRunIds.length} Apify run(s)${dryRun ? ' in dry-run mode' : ''}...`);

  const summaries = [];
  for (const runId of resolvedRunIds) {
    console.log(`Processing run ${runId}...`);
    const summary = await importRun(runId, token, context);
    summaries.push(summary);
    console.log(
      `[${summary.runId}] ${summary.brand}/${summary.state} status=${summary.status} items=${summary.totalItems} created=${summary.created} updated=${summary.updated} skipped=${summary.skipped}`
    );
  }

  const totals = summaries.reduce(
    (acc, summary) => {
      acc.items += summary.totalItems;
      acc.created += summary.created;
      acc.updated += summary.updated;
      acc.skipped += summary.skipped;
      return acc;
    },
    { items: 0, created: 0, updated: 0, skipped: 0 }
  );

  console.log(
    `Done. runs=${summaries.length} items=${totals.items} created=${totals.created} updated=${totals.updated} skipped=${totals.skipped}`
  );
}

main()
  .catch((error) => {
    console.error('Apify import failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import 'dotenv/config';
import prisma from '../utils/prisma';

type Args = {
  brandSlug: string;
  stateCode: string;
};

type AuditRow = {
  storeName: string;
  city: string | null;
  websiteUrl: string;
  provider: string | null;
  exactUrlOk: boolean;
  exactStatusCode: number | null;
  exactFinalUrl: string | null;
  exactTitle: string | null;
  exactError: string | null;
  rootUrl: string | null;
  rootUrlOk: boolean | null;
  rootStatusCode: number | null;
  rootFinalUrl: string | null;
  rootTitle: string | null;
  rootError: string | null;
};

function parseArgs(argv: string[]): Args {
  const brandSlug = argv[0];
  const stateCode = argv[1]?.toUpperCase();

  if (!brandSlug || !stateCode) {
    throw new Error('Usage: ts-node src/scripts/audit-brand-sites.ts <brandSlug> <stateCode>');
  }

  return { brandSlug, stateCode };
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match?.[1]) return null;
  return match[1].replace(/\s+/g, ' ').trim();
}

async function checkWebsite(url: string): Promise<Omit<AuditRow, 'storeName' | 'city' | 'websiteUrl' | 'provider'>> {
  const exact = await checkUrl(url);
  const rootUrl = buildRootUrl(url);
  const root = rootUrl ? await checkUrl(rootUrl) : null;

  return {
    exactUrlOk: exact.httpOk,
    exactStatusCode: exact.statusCode,
    exactFinalUrl: exact.finalUrl,
    exactTitle: exact.title,
    exactError: exact.error,
    rootUrl,
    rootUrlOk: root?.httpOk ?? null,
    rootStatusCode: root?.statusCode ?? null,
    rootFinalUrl: root?.finalUrl ?? null,
    rootTitle: root?.title ?? null,
    rootError: root?.error ?? null,
  };
}

function buildRootUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.hostname}/`;
  } catch {
    return null;
  }
}

async function checkUrl(url: string): Promise<{
  httpOk: boolean;
  statusCode: number | null;
  finalUrl: string | null;
  title: string | null;
  error: string | null;
}> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; ATD-audit/1.0)',
        'accept': 'text/html,application/xhtml+xml',
      },
    });
    clearTimeout(timeout);

    const contentType = response.headers.get('content-type') ?? '';
    const body = contentType.includes('text/html') ? await response.text() : '';

    return {
      httpOk: response.ok,
      statusCode: response.status,
      finalUrl: response.url || null,
      title: body ? extractTitle(body) : null,
      error: null,
    };
  } catch (error: any) {
    return {
      httpOk: false,
      statusCode: null,
      finalUrl: null,
      title: null,
      error: error?.message ?? 'unknown_error',
    };
  }
}

async function main() {
  const { brandSlug, stateCode } = parseArgs(process.argv.slice(2));

  const [brand, state] = await Promise.all([
    prisma.brand.findFirst({ where: { slug: brandSlug }, select: { id: true, name: true, slug: true } }),
    prisma.state.findUnique({ where: { code: stateCode }, select: { id: true, code: true, name: true } }),
  ]);

  if (!brand) throw new Error(`Brand not found for slug "${brandSlug}"`);
  if (!state) throw new Error(`State not found for code "${stateCode}"`);

  const stores = await prisma.store.findMany({
    where: {
      brandId: brand.id,
      stateId: state.id,
      websiteId: { not: null },
    },
    select: {
      name: true,
      city: { select: { name: true } },
      website: {
        select: {
          url: true,
          provider: { select: { name: true } },
        },
      },
    },
    orderBy: { name: 'asc' },
  });

  const rows: AuditRow[] = [];
  for (const store of stores) {
    if (!store.website?.url) continue;
    const checked = await checkWebsite(store.website.url);
    rows.push({
      storeName: store.name,
      city: store.city?.name ?? null,
      websiteUrl: store.website.url,
      provider: store.website.provider?.name ?? null,
      ...checked,
    });
  }

  const summary = {
    brand: brand.name,
    state: state.code,
    total: rows.length,
    exactOnline: rows.filter((row) => row.exactUrlOk).length,
    exactOffline: rows.filter((row) => !row.exactUrlOk).length,
    rootOnline: rows.filter((row) => row.rootUrlOk === true).length,
    rootOffline: rows.filter((row) => row.rootUrlOk === false).length,
    withProvider: rows.filter((row) => row.provider).length,
    withoutProvider: rows.filter((row) => !row.provider).length,
  };

  console.log(JSON.stringify({ summary, rows }, null, 2));
}

main()
  .catch((error) => {
    console.error('Brand site audit failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

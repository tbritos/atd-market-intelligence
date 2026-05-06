/**
 * validate-sites.ts
 *
 * Para cada store com site:
 *  1. Faz HTTP GET no site → verifica se está no ar (siteUp)
 *  2. Identifica o provedor pelo HTML (se ainda não tem)
 *  3. Verifica se o nome da concessionária aparece no <title> ou <h1> (siteNameOk)
 *  4. Salva tudo no banco
 *
 * Usage: npx ts-node src/scripts/validate-sites.ts [--force] [--limit=100]
 *   --force: reprocessa mesmo os já verificados
 *   --limit=N: processa só N stores (para teste)
 */

import axios from 'axios';
import prisma from '../utils/prisma';

const CONCURRENCY = 5; // requests simultâneos
const TIMEOUT_MS = 12000;

// Padrões de provedor
const PROVIDER_PATTERNS = [
  { name: 'AutoForce',    slug: 'autoforce',    patterns: ['site.autoforce.com', 'autoforce.com'] },
  { name: 'MicroWork',    slug: 'microwork',    patterns: ['microwork.inf.br'] },
  { name: 'Syonet',       slug: 'syonet',       patterns: ['leadforce.com.br', 'syonet.com'] },
  { name: 'DealerSpace',  slug: 'dealerspace',  patterns: ['dealerspace.ai'] },
  { name: 'Alpes One',    slug: 'alpesone',     patterns: ['alpes.one'] },
  { name: 'Revvo',        slug: 'revvotech',    patterns: ['revvotech.com.br'] },
  { name: 'WordPress',    slug: 'wordpress',    patterns: ['/wp-content/', '/wp-includes/', 'wp-json'] },
  { name: 'Shopify',      slug: 'shopify',      patterns: ['cdn.shopify.com', 'shopify.com/s/files'] },
  { name: 'Wix',          slug: 'wix',          patterns: ['static.wixstatic.com', 'wix.com/corvid'] },
  { name: 'Webmotors',    slug: 'webmotors',    patterns: ['webmotors.com.br'] },
  { name: 'Autoveiculos', slug: 'autoveiculos', patterns: ['autoveiculos.com', 'autoveiculo.com'] },
];

// Palavras irrelevantes para matching de nome
const STOP_WORDS = new Set([
  'concessionaria', 'concessionária', 'veiculos', 'veículos', 'automoveis', 'automóveis',
  'automotores', 'motors', 'motor', 'grupo', 'group', 'ltda', 'me', 'eireli', 'sa', 's/a',
  'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'a', 'o', 'com', 'br',
]);

function normalizeStr(s: string): string {
  return s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function extractKeywords(name: string): string[] {
  // Remove descrições longas do Google Maps (após ":" ou primeira vírgula)
  const cleanName = name.split(/:\s/)[0].split(',')[0].trim();
  return normalizeStr(cleanName).split(' ')
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

function detectProvider(html: string): typeof PROVIDER_PATTERNS[0] | null {
  const lower = html.toLowerCase();
  for (const p of PROVIDER_PATTERNS) {
    if (p.patterns.some(pat => lower.includes(pat.toLowerCase()))) return p;
  }
  return null;
}

function checkNameInPage(html: string, storeName: string, siteUrl: string): boolean {
  const keywords = extractKeywords(storeName);
  if (keywords.length === 0) return true;

  // 1. Checa domínio primeiro — se qualquer keyword (4+ chars) aparecer no domínio é match
  try {
    const domain = normalizeStr(new URL(siteUrl.startsWith('http') ? siteUrl : `https://${siteUrl}`).hostname);
    if (keywords.some(k => k.length >= 3 && domain.includes(k))) return true;
  } catch { /* ignora */ }

  // 2. Checa o HTML — 40% das keywords precisam aparecer
  const sample = normalizeStr(html.slice(0, 30000));
  const matches = keywords.filter(k => sample.includes(k));
  return matches.length >= Math.max(1, Math.ceil(keywords.length * 0.4));
}

async function fetchHTML(url: string): Promise<{ html: string | null; up: boolean }> {
  const normalized = url.startsWith('http') ? url : `https://${url}`;
  try {
    const { data } = await axios.get(normalized, {
      timeout: TIMEOUT_MS,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ATD-Validator/1.0)',
        'Accept': 'text/html',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
      maxRedirects: 5,
      validateStatus: s => s < 500,
    });
    return { html: typeof data === 'string' ? data : null, up: true };
  } catch {
    // tenta HTTP se HTTPS falhou
    if (normalized.startsWith('https://')) {
      try {
        const { data } = await axios.get(normalized.replace('https://', 'http://'), {
          timeout: TIMEOUT_MS, maxRedirects: 5, validateStatus: s => s < 500,
        });
        return { html: typeof data === 'string' ? data : null, up: true };
      } catch { /* nada */ }
    }
    return { html: null, up: false };
  }
}

async function processChunk(stores: any[], providerCache: Map<string, string>, redetectProviders: boolean) {
  await Promise.all(stores.map(async (store) => {
    const url = store.website?.url;
    if (!url) return;

    const { html, up } = await fetchHTML(url);

    // Detecta provedor
    let providerId = store.website.providerId;
    if (html && (!providerId || redetectProviders)) {
      const detected = detectProvider(html);
      const slug = detected?.slug ?? 'desconhecido';
      const name = detected?.name ?? 'Desconhecido';

      if (!providerCache.has(slug)) {
        let provider = await prisma.websiteProvider.findUnique({ where: { slug } });
        if (!provider) provider = await prisma.websiteProvider.create({ data: { name, slug } });
        providerCache.set(slug, provider.id);
      }
      const newProviderId = providerCache.get(slug)!;

      if (newProviderId !== providerId) {
        await prisma.website.update({
          where: { id: store.website.id },
          data: { providerId: newProviderId },
        });
        console.log(`  🔄 Provedor atualizado: ${store.name.slice(0, 35)} → ${slug}`);
        providerId = newProviderId;
      }
    }

    // Verifica se nome bate
    const siteNameOk = html ? checkNameInPage(html, store.name, url) : null;

    await (prisma.store as any).update({
      where: { id: store.id },
      data: {
        siteUp: up,
        siteNameOk,
        siteCheckedAt: new Date(),
      },
    });

    const status = up ? '✅' : '❌';
    const nameStatus = siteNameOk === null ? '?' : siteNameOk ? '✓' : '✗';
    console.log(`  ${status} ${nameStatus} ${store.name.slice(0, 40).padEnd(40)} ${url.slice(0, 50)}`);
  }));
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const redetectProviders = args.includes('--redetect-providers');
  const limitArg = args.find(a => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : undefined;

  console.log(`\n🔍 Validando sites das concessionárias${force ? ' (forçando reprocessamento)' : ''}${redetectProviders ? ' (re-detectando provedores)' : ''}${limit ? ` (limite: ${limit})` : ''}...\n`);

  const mismatchOnly = args.includes('--mismatch-only');

  const stores = await prisma.store.findMany({
    where: {
      websiteId: { not: null },
      ...(mismatchOnly
        ? { siteNameOk: false } as any
        : force ? {} : { siteCheckedAt: null }),
    },
    select: {
      id: true,
      name: true,
      website: { select: { id: true, url: true, providerId: true } },
    },
    take: limit,
    orderBy: { createdAt: 'asc' },
  });

  console.log(`📋 ${stores.length} stores para processar\n`);
  console.log('  Legenda: ✅/❌ = site no ar | ✓/✗/? = nome bate\n');

  // Carrega provedores existentes no cache
  const allProviders = await prisma.websiteProvider.findMany({ select: { id: true, slug: true } });
  const providerCache = new Map(allProviders.map(p => [p.slug, p.id]));

  let processed = 0;

  // Processa em chunks de CONCURRENCY
  for (let i = 0; i < stores.length; i += CONCURRENCY) {
    const chunk = stores.slice(i, i + CONCURRENCY);
    await processChunk(chunk, providerCache, redetectProviders);
    processed += chunk.length;

    // Atualiza contadores lendo do banco (simplificado)
    process.stdout.write(`\r  Progresso: ${processed}/${stores.length}`);
  }

  // Resumo final
  const results = await (prisma.store as any).groupBy({
    by: ['siteUp', 'siteNameOk'],
    where: { websiteId: { not: null }, siteCheckedAt: { not: null } },
    _count: true,
  }) as Array<{ siteUp: boolean | null; siteNameOk: boolean | null; _count: number }>;

  console.log('\n\n📊 Resumo:\n');
  for (const r of results) {
    const up = r.siteUp === true ? '✅ No ar' : r.siteUp === false ? '❌ Offline' : '? Não verificado';
    const name = r.siteNameOk === true ? '✓ Nome bate' : r.siteNameOk === false ? '✗ Nome não bate' : '? Não verificado';
    console.log(`  ${up} + ${name}: ${r._count} stores`);
  }

  // Mismatches para revisar
  const mismatches = await (prisma.store as any).findMany({
    where: { siteUp: true, siteNameOk: false },
    include: {
      brand: true,
      state: true,
      website: true,
    },
    take: 20,
  }) as Array<{ name: string; brand: { name: string } | null; state: { code: string } | null; website: { url: string } | null }>;

  if (mismatches.length > 0) {
    console.log('\n⚠️  Primeiros sites onde o nome NÃO bate (para revisar):');
    mismatches.forEach(s => {
      console.log(`  - ${s.name} (${s.brand?.name}/${s.state?.code}) → ${s.website?.url}`);
    });
  }

  await prisma.$disconnect();
  console.log('\n✅ Concluído!');
}

main().catch(console.error);

import prisma from '../../utils/prisma';
import { BRAND_ADAPTERS } from '../discovery/brand-adapters';

const BLACKLIST = [
  'facebook.com', 'instagram.com', 'linkedin.com', 'twitter.com',
  'youtube.com', 'mercadolivre.com', 'webmotors.com', 'icarros.com',
  'olx.com', 'autopapo.com.br', 'motorshow.com.br', 'autoesporte.com',
  'wikipedia.org', 'google.com',
];

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(concessionaria|automoveis|veiculos|automóveis|veículos|ltda|me|eireli|s\.a|sa)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeUrl(url: string): string {
  const u = url.startsWith('http') ? url : `https://${url}`;
  return u.replace(/\/$/, '');
}

function isBlacklisted(url: string): boolean {
  return BLACKLIST.some((b) => url.includes(b));
}

class BrandWebsiteMatcherService {
  async matchAll(cnaeCode?: string): Promise<{ matched: number; skipped: number; total: number }> {
    let matched = 0;
    let skipped = 0;
    let total = 0;

    for (const [slug, adapter] of Object.entries(BRAND_ADAPTERS)) {
      console.log(`[BrandMatcher] Running adapter: ${slug}`);
      let results: Awaited<ReturnType<typeof adapter.fetch>>;
      try {
        results = await adapter.fetch();
      } catch (err) {
        console.error(`[BrandMatcher] Adapter ${slug} failed:`, err);
        continue;
      }

      console.log(`[BrandMatcher] ${slug}: ${results.length} results`);

      for (const result of results) {
        if (!result.website || isBlacklisted(result.website)) continue;
        total++;

        const stores = await this.findMatchingStores(result.name, result.stateCode, cnaeCode);

        if (stores.length === 1) {
          try {
            await this.saveWebsiteToStore(stores[0].id, stores[0].brandId, result.website);
            matched++;
          } catch (err) {
            console.error(`[BrandMatcher] Failed to save website for ${result.name}:`, err);
            skipped++;
          }
        } else {
          skipped++;
        }
      }
    }

    console.log(`[BrandMatcher] Done — matched: ${matched}, skipped: ${skipped}, total candidates: ${total}`);
    return { matched, skipped, total };
  }

  private async findMatchingStores(name: string, stateCode: string | null, cnaeCode?: string) {
    const normalized = normalizeName(name);
    if (!normalized || normalized.length < 3) return [];

    return prisma.store.findMany({
      where: {
        websiteId: null,
        ...(cnaeCode && { cnaeCode }),
        ...(stateCode && { state: { code: stateCode.toUpperCase() } }),
        OR: [
          { nomeFantasia: { contains: normalized, mode: 'insensitive' } },
          { razaoSocial: { contains: normalized, mode: 'insensitive' } },
          { name: { contains: normalized, mode: 'insensitive' } },
        ],
      },
      select: { id: true, brandId: true },
    });
  }

  private async saveWebsiteToStore(storeId: string, brandId: string, rawUrl: string) {
    const url = normalizeUrl(rawUrl);
    const website = await prisma.website.upsert({
      where: { url },
      update: {},
      create: { url, brandId, isActive: true },
    });
    await prisma.store.update({
      where: { id: storeId },
      data: { websiteId: website.id },
    });
  }
}

export const brandWebsiteMatcherService = new BrandWebsiteMatcherService();

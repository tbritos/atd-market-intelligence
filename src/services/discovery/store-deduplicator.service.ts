import prisma from '../../utils/prisma';
import { cnpjEnrichmentQueue, websiteProviderQueue } from '../../config/queue';
import { normalizeUrl } from '../../utils/url';

export interface DiscoveredStore {
  // Required
  name: string;
  brandId: string;
  stateId: string;
  source: 'google_maps' | 'google_places' | 'cnae' | 'brand_site';

  // Optional enrichment
  cityName?: string | null;
  phone?: string | null;
  website?: string | null;
  lat?: number | null;
  lng?: number | null;
  rating?: number | null;
  reviews?: number | null;
  externalId?: string | null;
  openingHours?: { day: string; hours: string }[] | null;
  services?: { hasSales?: boolean; hasService?: boolean; hasParts?: boolean } | null;

  // CNPJ data (when source is cnae — already known)
  cnpj?: string | null;
  razaoSocial?: string | null;
  nomeFantasia?: string | null;
  dataAbertura?: string | null;
  porte?: string | null;
  capitalSocial?: number | null;
  situacaoCadastral?: string | null;
  cnaeCode?: string | null;
  cnaeDescricao?: string | null;
  emailReceita?: string | null;
  telefoneReceita?: string | null;
  enderecoLogradouro?: string | null;
  enderecoNumero?: string | null;
  enderecoBairro?: string | null;
  enderecoCep?: string | null;
}

export class StoreDeduplicatorService {
  private defaultGroupId: string | null = null;

  async upsert(store: DiscoveredStore): Promise<{ action: 'created' | 'updated'; storeId: string }> {
    const groupId = await this.getDefaultGroupId();

    // ── Step 1: Find existing store ──────────────────────────────────────────
    let existing = await this.findExisting(store);

    // ── Step 2: Resolve cityId ───────────────────────────────────────────────
    let cityId: string | null = null;
    if (store.cityName) {
      cityId = await this.resolveCityId(store.cityName, store.stateId);
    }

    // ── Step 3: Resolve websiteId ────────────────────────────────────────────
    let websiteId: string | null = existing?.websiteId ?? null;
    if (store.website) {
      const resolved = await this.resolveWebsiteId(store.website, store.brandId);
      if (resolved) websiteId = resolved;
    }

    const cnpjData = store.cnpj ? {
      cnpj: store.cnpj,
      razaoSocial: store.razaoSocial ?? null,
      nomeFantasia: store.nomeFantasia ?? null,
      dataAbertura: store.dataAbertura ? new Date(store.dataAbertura) : null,
      porte: store.porte ?? null,
      capitalSocial: store.capitalSocial ?? null,
      situacaoCadastral: store.situacaoCadastral ?? null,
      cnaeCode: store.cnaeCode ?? null,
      cnaeDescricao: store.cnaeDescricao ?? null,
      emailReceita: store.emailReceita ?? null,
      telefoneReceita: store.telefoneReceita ?? null,
      enderecoLogradouro: store.enderecoLogradouro ?? null,
      enderecoNumero: store.enderecoNumero ?? null,
      enderecoBairro: store.enderecoBairro ?? null,
      enderecoCep: store.enderecoCep ?? null,
      cnpjEnrichedAt: new Date(),
    } : {};

    if (!existing) {
      // ── Step 4a: Create new store ──────────────────────────────────────────
      const created = await prisma.store.create({
        data: {
          name: store.name,
          brandId: store.brandId,
          groupId,
          stateId: store.stateId,
          cityId,
          websiteId,
          phone: store.phone ?? null,
          lat: store.lat ?? null,
          lng: store.lng ?? null,
          latitude: store.lat ?? null,
          longitude: store.lng ?? null,
          rating: store.rating ?? null,
          reviews: store.reviews ?? null,
          isActive: true,
          discoverySource: store.source,
          externalId: store.externalId ?? null,
          openingHours: store.openingHours ?? undefined,
          services: store.services ?? undefined,
          lastDiscoveredAt: new Date(),
          ...cnpjData,
        },
      });

      // Queue CNPJ enrichment if not already have CNPJ
      if (!store.cnpj) {
        await cnpjEnrichmentQueue.add('enrichCnpj', {
          storeId: created.id,
          storeName: store.name,
          websiteUrl: store.website ?? null,
        }, { delay: Math.random() * 5000 });
      }

      return { action: 'created', storeId: created.id };

    } else {
      // ── Step 4b: Merge into existing store ────────────────────────────────
      // Only overwrite fields if existing value is null/empty (prefer more complete data)
      await prisma.store.update({
        where: { id: existing.id },
        data: {
          cityId: cityId ?? existing.cityId ?? undefined,
          websiteId: websiteId ?? existing.websiteId ?? undefined,
          phone: existing.phone ?? store.phone ?? undefined,
          latitude: existing.latitude ?? store.lat ?? undefined,
          longitude: existing.longitude ?? store.lng ?? undefined,
          rating: store.rating ?? existing.rating ?? undefined,
          reviews: store.reviews ?? existing.reviews ?? undefined,
          externalId: store.externalId ?? existing.externalId ?? undefined,
          openingHours: store.openingHours ? (store.openingHours as any) : undefined,
          services: store.services ? (store.services as any) : undefined,
          lastDiscoveredAt: new Date(),
          // Apply CNPJ data if we got it for the first time
          ...(store.cnpj && !existing.cnpj ? cnpjData : {}),
        },
      });

      // If we got CNPJ for the first time on an existing store, trigger QSA enrichment
      if (store.cnpj && !existing.cnpj) {
        await cnpjEnrichmentQueue.add('enrichCnpj', {
          storeId: existing.id,
          storeName: store.name,
          websiteUrl: store.website ?? existing.website?.url ?? null,
        });
      }

      return { action: 'updated', storeId: existing.id };
    }
  }

  private async findExisting(store: DiscoveredStore) {
    // Strategy 1: exact name + brand + state
    const byName = await prisma.store.findFirst({
      where: { name: store.name, brandId: store.brandId, stateId: store.stateId },
      select: { id: true, cityId: true, websiteId: true, latitude: true, longitude: true, phone: true, cnpj: true, website: { select: { url: true } } },
    });
    if (byName) return byName;

    // Strategy 2: by CNPJ (if provided)
    if (store.cnpj) {
      const byCnpj = await prisma.store.findFirst({
        where: { cnpj: store.cnpj },
        select: { id: true, cityId: true, websiteId: true, latitude: true, longitude: true, phone: true, cnpj: true, website: { select: { url: true } } },
      });
      if (byCnpj) return byCnpj;
    }

    // Strategy 3: by externalId (Google place_id)
    if (store.externalId) {
      const byExt = await prisma.store.findFirst({
        where: { externalId: store.externalId },
        select: { id: true, cityId: true, websiteId: true, latitude: true, longitude: true, phone: true, cnpj: true, website: { select: { url: true } } },
      });
      if (byExt) return byExt;
    }

    // Strategy 4: fuzzy name match within ~200m radius
    if (store.lat && store.lng) {
      const nearby = await prisma.store.findFirst({
        where: {
          brandId: store.brandId,
          stateId: store.stateId,
          latitude: { gte: store.lat - 0.002, lte: store.lat + 0.002 },
          longitude: { gte: store.lng - 0.002, lte: store.lng + 0.002 },
        },
        select: { id: true, name: true, cityId: true, websiteId: true, latitude: true, longitude: true, phone: true, cnpj: true, website: { select: { url: true } } },
      });
      if (nearby && this.nameSimilarity(nearby.name, store.name) > 0.6) return nearby;
    }

    return null;
  }

  private nameSimilarity(a: string, b: string): number {
    const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const ca = clean(a), cb = clean(b);
    if (ca === cb) return 1;
    const longer = ca.length > cb.length ? ca : cb;
    const shorter = ca.length > cb.length ? cb : ca;
    if (longer.includes(shorter)) return shorter.length / longer.length;
    return 0;
  }

  private async resolveCityId(cityName: string, stateId: string): Promise<string | null> {
    const city = await prisma.city.findFirst({
      where: { name: { contains: cityName.trim(), mode: 'insensitive' }, stateId },
    });
    if (city) return city.id;

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
      return null;
    }
  }

  private async resolveWebsiteId(url: string, brandId: string): Promise<string | null> {
    try {
      const cleanUrl = normalizeUrl(url);
      let website = await prisma.website.findFirst({ where: { url: cleanUrl } });

      if (!website) {
        website = await prisma.website.create({ data: { url: cleanUrl, brandId, isActive: true } });
        await websiteProviderQueue.add('classifyProvider', { websiteId: website.id, url: cleanUrl, brandId });
      }
      return website.id;
    } catch {
      return null;
    }
  }

  private async getDefaultGroupId(): Promise<string> {
    if (this.defaultGroupId) return this.defaultGroupId;
    let group = await prisma.group.findFirst({ where: { slug: 'default' } });
    if (!group) {
      group = await prisma.group.create({
        data: { name: 'Default Group', slug: 'default', description: 'Auto-created', isActive: true },
      });
    }
    this.defaultGroupId = group.id;
    return group.id;
  }
}

export const storeDeduplicatorService = new StoreDeduplicatorService();

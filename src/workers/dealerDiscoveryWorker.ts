import { Worker, Job } from 'bullmq';
import redis from '../config/redis';
import prisma from '../utils/prisma';
import { googlePlacesService } from '../services/discovery/google-places.service';
import { cnaeDiscoveryService } from '../services/discovery/cnae-discovery.service';
import { getAdapterForBrand } from '../services/discovery/brand-adapters/index';
import { storeDeduplicatorService, DiscoveredStore } from '../services/discovery/store-deduplicator.service';
import { JobStatus } from '@prisma/client';

// ── Job types ──────────────────────────────────────────────────────────────────

/** Um job por estado — roda Apify UMA vez e distribui entre todas as marcas */
export interface StateGooglePlacesJobData {
  type: 'state_google_places';
  stateId: string;
  maxPlaces?: number;
}

/** Um job por marca — roda CNAE + brand_site (sem Apify) */
export interface DealerDiscoveryJobData {
  type?: 'per_brand'; // default para backwards compat
  brandId: string;
  stateId: string;
  sources: ('cnae' | 'brand_site')[];
}

type AnyJobData = StateGooglePlacesJobData | DealerDiscoveryJobData;

export class DealerDiscoveryWorker {
  private worker: Worker;

  constructor() {
    this.worker = new Worker('dealerDiscovery', this.processJob.bind(this), {
      connection: redis,
      concurrency: 3,
    });

    this.worker.on('completed', (job) => {
      console.log(`Discovery job ${job.id} completed`);
    });
    this.worker.on('failed', async (job, err) => {
      console.error(`Discovery job ${job?.id} failed:`, err.message);
      const data = job?.data as AnyJobData;
      if (data && 'brandId' in data) {
        await prisma.searchJob.updateMany({
          where: { brandId: data.brandId, stateId: data.stateId, status: JobStatus.RUNNING },
          data: { status: JobStatus.FAILED, errorMessage: err.message, completedAt: new Date() },
        }).catch(() => {});
      }
    });
    this.worker.on('error', (err) => {
      console.error('Discovery worker error:', err);
    });
  }

  private async processJob(job: Job<AnyJobData>) {
    const data = job.data;

    if ('type' in data && data.type === 'state_google_places') {
      return this.processStateGooglePlaces(job as Job<StateGooglePlacesJobData>);
    }
    return this.processPerBrand(job as Job<DealerDiscoveryJobData>);
  }

  // ── Job 1: Apify uma vez por estado ────────────────────────────────────────

  private async processStateGooglePlaces(job: Job<StateGooglePlacesJobData>) {
    const { stateId, maxPlaces = 300 } = job.data;

    const state = await prisma.state.findUnique({ where: { id: stateId } });
    if (!state) throw new Error(`State not found: ${stateId}`);

    // Carrega todas as marcas para fazer match local
    const brands = await prisma.brand.findMany({ select: { id: true, name: true, slug: true } });
    const brandMap = brands.map(b => ({
      ...b,
      nameLower: b.name.toLowerCase(),
      slugLower: b.slug.toLowerCase(),
    }));

    console.log(`State Google Places: ${state.name} — buscando até ${maxPlaces} lugares`);
    await job.updateProgress(10);

    const places = await googlePlacesService.searchAllDealersInState(state.name, maxPlaces);
    await job.updateProgress(50);

    let created = 0, updated = 0, skipped = 0;

    for (const p of places) {
      const nameLower = p.name.toLowerCase();

      // Tenta encontrar a marca pelo nome do estabelecimento
      const matched = brandMap.find(b =>
        nameLower.includes(b.nameLower) || nameLower.includes(b.slugLower)
      );

      if (!matched) { skipped++; continue; }

      const cityName = this.extractCityFromAddress(p.address, state.name);
      const store: DiscoveredStore = {
        name: p.name,
        brandId: matched.id,
        stateId,
        source: 'google_places',
        cityName,
        phone: p.phone,
        website: p.website,
        lat: p.lat,
        lng: p.lng,
        rating: p.rating,
        reviews: p.reviews,
        externalId: p.placeId,
        openingHours: p.openingHours,
      };

      const r = await storeDeduplicatorService.upsert(store);
      r.action === 'created' ? created++ : updated++;
    }

    await job.updateProgress(100);
    console.log(`State Google Places (${state.name}): ${places.length} encontrados, ${created} criados, ${updated} atualizados, ${skipped} sem marca`);
    return { places: places.length, created, updated, skipped };
  }

  // ── Job 2: CNAE + brand_site por marca ────────────────────────────────────

  private async processPerBrand(job: Job<DealerDiscoveryJobData>) {
    const { brandId, stateId, sources } = job.data;

    const brand = await prisma.brand.findUnique({ where: { id: brandId } });
    const state = await prisma.state.findUnique({ where: { id: stateId } });
    if (!brand || !state) throw new Error(`Brand/state not found: ${brandId}/${stateId}`);

    await prisma.searchJob.upsert({
      where: { brandId_stateId: { brandId, stateId } },
      update: { status: JobStatus.RUNNING, startedAt: new Date(), errorMessage: null },
      create: { brandId, stateId, status: JobStatus.RUNNING, startedAt: new Date() },
    });

    console.log(`Per-brand discovery: ${brand.name} / ${state.name} — sources: ${sources.join(', ')}`);

    let created = 0, updated = 0;

    // ── CNAE / Receita Federal ───────────────────────────────────────────────
    if (sources.includes('cnae')) {
      await job.updateProgress(20);
      try {
        const dealers = await cnaeDiscoveryService.searchDealers(brand.name, state.code);
        for (const d of dealers) {
          const store: DiscoveredStore = {
            name: d.nomeFantasia || d.razaoSocial,
            brandId,
            stateId,
            source: 'cnae',
            cityName: this.titleCase(d.municipio),
            phone: d.telefone,
            website: null,
            lat: null,
            lng: null,
            externalId: `cnpj-${d.cnpj.replace(/\D/g, '')}`,
            cnpj: d.cnpj,
            razaoSocial: d.razaoSocial,
            nomeFantasia: d.nomeFantasia,
            dataAbertura: d.dataAbertura,
            porte: d.porte,
            capitalSocial: d.capitalSocial,
            situacaoCadastral: d.situacao,
            cnaeCode: String(d.cnaeCode),
            cnaeDescricao: d.cnaeDescricao,
            emailReceita: d.email,
            telefoneReceita: d.telefone,
            enderecoLogradouro: d.logradouro,
            enderecoNumero: d.numero,
            enderecoBairro: d.bairro,
            enderecoCep: d.cep,
          };
          const r = await storeDeduplicatorService.upsert(store);
          r.action === 'created' ? created++ : updated++;
        }
        console.log(`CNAE (${brand.name}/${state.code}): ${dealers.length} encontrados`);
      } catch (err) {
        console.error('CNAE step failed:', err);
      }
    }

    // ── Brand site adapter ───────────────────────────────────────────────────
    if (sources.includes('brand_site')) {
      await job.updateProgress(60);
      const adapter = getAdapterForBrand(brand.slug);
      if (adapter) {
        try {
          const dealers = await adapter.fetch(state.code);
          for (const d of dealers) {
            if (!d.name) continue;
            const store: DiscoveredStore = {
              name: d.name,
              brandId,
              stateId,
              source: 'brand_site',
              cityName: d.city,
              phone: d.phone,
              website: d.website,
              lat: d.lat,
              lng: d.lng,
              externalId: d.externalId,
              openingHours: d.openingHours,
              services: d.services,
            };
            const r = await storeDeduplicatorService.upsert(store);
            r.action === 'created' ? created++ : updated++;
          }
          console.log(`Brand site (${brand.slug}): ${dealers.length} encontrados`);
        } catch (err) {
          console.error(`Brand site failed for ${brand.slug}:`, err);
        }
      }
    }

    await job.updateProgress(100);

    const totalFound = created + updated;
    await prisma.searchJob.update({
      where: { brandId_stateId: { brandId, stateId } },
      data: {
        status: JobStatus.COMPLETED,
        totalFound,
        totalProcessed: totalFound,
        completedAt: new Date(),
      },
    });

    console.log(`Per-brand done — ${brand.name}/${state.name}: +${created} novos, ~${updated} atualizados`);
    return { created, updated };
  }

  private extractCityFromAddress(address: string | null, stateName: string): string | null {
    if (!address) return null;
    const parts = address.split(',').map((p) => p.trim());
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

  private titleCase(s: string): string {
    return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

export const dealerDiscoveryWorker = new DealerDiscoveryWorker();

import prisma from '../../utils/prisma';
import { dealerDiscoveryQueue } from '../../config/queue';

const REGION_PRIORITY: Record<string, number> = {
  SUDESTE: 1,
  SUL: 2,
  CENTRO_OESTE: 3,
  NORDESTE: 4,
  NORTE: 5,
};

const DISCOVERY_APIFY_ENABLED = (process.env.DISCOVERY_APIFY_ENABLED ?? 'false').toLowerCase() === 'true';


export class DiscoveryService {

  async getCoverage() {
    const states = await prisma.state.findMany({
      select: { id: true, code: true, name: true, region: true },
      orderBy: { name: 'asc' },
    });

    const [storeCounts, siteCounts, jobStats] = await Promise.all([
      // Total stores por estado
      prisma.store.groupBy({
        by: ['stateId'],
        _count: { _all: true },
      }),
      // Stores com site por estado
      prisma.store.groupBy({
        by: ['stateId'],
        where: { websiteId: { not: null } },
        _count: { _all: true },
      }),
      // SearchJobs por estado + status
      prisma.searchJob.groupBy({
        by: ['stateId', 'status'],
        _count: { _all: true },
      }),
    ]);

    const storeMap = Object.fromEntries(storeCounts.map(s => [s.stateId, s._count._all]));
    const siteMap = Object.fromEntries(siteCounts.map(s => [s.stateId, s._count._all]));

    const jobMap: Record<string, Record<string, number>> = {};
    for (const j of jobStats) {
      if (!jobMap[j.stateId]) jobMap[j.stateId] = {};
      jobMap[j.stateId][j.status] = j._count._all;
    }

    const result = states
      .filter(s => s.code !== 'ZZ') // remove estado inválido
      .map(s => {
        const total = storeMap[s.id] ?? 0;
        const comSite = siteMap[s.id] ?? 0;
        const jobs = jobMap[s.id] ?? {};
        const totalJobs = Object.values(jobs).reduce((a, b) => a + b, 0);
        const coberturaPercent = total > 0 ? Math.round((comSite / total) * 100) : 0;

        return {
          id: s.id,
          code: s.code,
          name: s.name,
          region: s.region,
          regionPriority: REGION_PRIORITY[s.region] ?? 9,
          totalStores: total,
          storesComSite: comSite,
          coberturaPercent,
          jobs: {
            total: totalJobs,
            completed: jobs['COMPLETED'] ?? 0,
            failed: jobs['FAILED'] ?? 0,
            pending: jobs['PENDING'] ?? 0,
            running: jobs['RUNNING'] ?? 0,
          },
          discoveryStatus: this.resolveDiscoveryStatus(jobs, totalJobs),
        };
      })
      .sort((a, b) => a.regionPriority - b.regionPriority || a.name.localeCompare(b.name));

    const summary = {
      totalStores: result.reduce((a, s) => a + s.totalStores, 0),
      totalComSite: result.reduce((a, s) => a + s.storesComSite, 0),
      statesDiscovered: result.filter(s => s.discoveryStatus === 'done').length,
      statesPartial: result.filter(s => s.discoveryStatus === 'partial').length,
      statesPending: result.filter(s => s.discoveryStatus === 'pending').length,
    };

    return { states: result, summary };
  }

  private resolveDiscoveryStatus(jobs: Record<string, number>, total: number): 'pending' | 'partial' | 'done' | 'running' {
    if (total === 0) return 'pending';
    if ((jobs['RUNNING'] ?? 0) > 0) return 'running';
    if ((jobs['COMPLETED'] ?? 0) > 0 && (jobs['FAILED'] ?? 0) === 0 && (jobs['PENDING'] ?? 0) === 0) return 'done';
    if ((jobs['COMPLETED'] ?? 0) > 0) return 'partial';
    return 'pending';
  }

  async startDiscoveryForState(stateCode: string, options?: { brandSlugs?: string[]; forceRedo?: boolean }) {
    const state = await prisma.state.findUnique({
      where: { code: stateCode },
      select: { id: true, name: true, code: true },
    });
    if (!state) throw new Error(`Estado "${stateCode}" não encontrado`);

    // Pega todas as marcas (ou filtra por slugs se passado)
    const brands = await prisma.brand.findMany({
      where: options?.brandSlugs
        ? { slug: { in: options.brandSlugs } }
        : undefined,
      select: { id: true, name: true, slug: true },
    });

    // Enfileira UM job Apify por estado (busca ampla, uma única run)
    if (DISCOVERY_APIFY_ENABLED) {
      await dealerDiscoveryQueue.add(
        'discover',
        { type: 'state_google_places', stateId: state.id, maxPlaces: 300 },
        { jobId: `state-places-${state.id}`, removeOnComplete: 10, removeOnFail: 10 },
      );
    }

    let enqueued = 0;
    let skipped = 0;

    for (const brand of brands) {
      // Verifica se já tem job concluído (não refaz se forceRedo=false)
      const existingJob = await prisma.searchJob.findUnique({
        where: { brandId_stateId: { brandId: brand.id, stateId: state.id } },
      });

      if (existingJob?.status === 'COMPLETED' && !options?.forceRedo) {
        skipped++;
        continue;
      }

      if (existingJob?.status === 'RUNNING') {
        skipped++;
        continue;
      }

      // Cria ou reseta o SearchJob
      if (existingJob) {
        await prisma.searchJob.update({
          where: { id: existingJob.id },
          data: { status: 'PENDING', errorMessage: null, startedAt: null, completedAt: null, totalFound: null, totalProcessed: null },
        });
      } else {
        await prisma.searchJob.create({
          data: { brandId: brand.id, stateId: state.id, status: 'PENDING' },
        });
      }

      // Enfileira com delay crescente — CNAE + brand_site apenas (sem Apify por marca)
      await dealerDiscoveryQueue.add(
        'discover',
        { type: 'per_brand', brandId: brand.id, stateId: state.id, sources: ['cnae', 'brand_site'] },
        {
          jobId: `discovery-${brand.id}-${state.id}`,
          delay: enqueued * 2000,
        },
      );

      enqueued++;
    }

    return {
      state: { code: state.code, name: state.name },
      enqueued,
      skipped,
      totalBrands: brands.length,
      apifyEnabled: DISCOVERY_APIFY_ENABLED,
    };
  }

  async getBrandsForState(stateCode: string) {
    const state = await prisma.state.findUnique({
      where: { code: stateCode },
      select: { id: true, name: true, code: true },
    });
    if (!state) throw new Error(`Estado "${stateCode}" não encontrado`);

    const brands = await prisma.brand.findMany({
      where: { stores: { some: { stateId: state.id } } },
      select: {
        id: true, name: true, slug: true,
        _count: {
          select: {
            stores: { where: { stateId: state.id } },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    const comSite = await prisma.store.groupBy({
      by: ['brandId'],
      where: { stateId: state.id, websiteId: { not: null } },
      _count: { _all: true },
    });
    const comSiteMap = Object.fromEntries(comSite.map(s => [s.brandId, s._count._all]));

    return {
      state: { id: state.id, code: state.code, name: state.name },
      brands: brands.map(b => ({
        id: b.id,
        name: b.name,
        slug: b.slug,
        totalStores: b._count.stores,
        storesComSite: comSiteMap[b.id] ?? 0,
      })),
    };
  }

  async getQueueStats() {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      dealerDiscoveryQueue.getWaitingCount(),
      dealerDiscoveryQueue.getActiveCount(),
      dealerDiscoveryQueue.getCompletedCount(),
      dealerDiscoveryQueue.getFailedCount(),
      dealerDiscoveryQueue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed, total: waiting + active + delayed };
  }
}

export const discoveryService = new DiscoveryService();

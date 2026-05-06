import prisma from '../../utils/prisma';
import { dealerGroupPersistenceService } from '../../services/enrichment/dealer-group-persistence.service';
import { groupEnrichmentPlannerService } from '../../services/enrichment/group-enrichment-planner.service';
import { pipedriveGroupCacheService } from '../../services/enrichment/pipedrive-group-cache.service';
import { pipedriveService } from '../../services/enrichment/pipedrive.service';
import { ListBrandsRequest, CreateBrandRequest, PipedriveBrandGroupsRequest } from './brands.schema';

const GENERIC_DOMAIN_PATTERNS = [
  'fiat.com.br',
  'facebook.com',
  'instagram.com',
  'linktr.ee',
  'api.whatsapp.com',
  'whatsapp.com',
  'seul.ink',
];

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function bucketForGroup(domain: string, storeCount: number, stateCount: number): 'priority' | 'review' | 'single' | 'generic' {
  const isGeneric = GENERIC_DOMAIN_PATTERNS.some((pattern) => domain.includes(pattern));
  if (isGeneric) return 'generic';
  if (stateCount > 1) return 'review';
  if (storeCount === 1) return 'single';
  return 'priority';
}

function buildSearchTerms(domain: string, storeNames: string[]): string[] {
  const pieces = domain.split('.').filter(Boolean);
  const significant = pieces
    .slice(0, Math.max(1, pieces.length - 2))
    .filter((piece) => !['fiat', 'jeep', 'toyota', 'vw', 'volkswagen', 'ford', 'gm', 'chevrolet', 'byd', 'bmw'].includes(piece.toLowerCase()));

  const rootTerm = (significant[0] ?? pieces[0] ?? '')
    .replace(/[-_]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim();

  return [
    rootTerm,
    ...storeNames.map((name) =>
      name
        .replace(/fiat/gi, '')
        .replace(/concession[aá]ria/gi, '')
        .replace(/\s+/g, ' ')
        .trim()
    ),
  ];
}

export class BrandsService {
  async listBrands(query: ListBrandsRequest) {
    const { page = 1, limit = 50, sortBy = 'name', sortOrder = 'asc', hasMetrics } = query;

    const validatedLimit = Math.min(limit, 1000);
    const offset = (page - 1) * validatedLimit;

    // Mapear campos de ordenação
    const sortFieldMap = {
      name: 'name',
      avgPerformanceScore: 'avgPerformanceScore',
      avgSeoScore: 'avgSeoScore', 
      avgResponseTime: 'avgResponseTime',
      totalWebsites: 'totalWebsites',
      activeWebsites: 'activeWebsites',
    };

    const orderBy = sortBy in sortFieldMap 
      ? { [sortFieldMap[sortBy as keyof typeof sortFieldMap]]: sortOrder }
      : { name: 'asc' as const };

    // Filtro para marcas com métricas
    const whereClause = hasMetrics 
      ? { 
          OR: [
            { avgPerformanceScore: { not: null } },
            { avgSeoScore: { not: null } },
            { avgResponseTime: { not: null } }
          ]
        }
      : undefined;

    const [brands, total] = await Promise.all([
      prisma.brand.findMany({
        where: whereClause,
        include: {
          _count: {
            select: {
              websites: true,
              stores: true,
              searchJobs: true,
            },
          },
        },
        orderBy,
        take: validatedLimit,
        skip: offset,
      }),
      prisma.brand.count({
        where: whereClause,
      }),
    ]);

    const totalPages = Math.ceil(total / validatedLimit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    // Simplificar payload mantendo apenas campos essenciais
    const simplifiedBrands = brands.map(brand => ({
      id: brand.id,
      name: brand.name,
      slug: brand.slug,
      avgPerformanceScore: brand.avgPerformanceScore,
      avgSeoScore: brand.avgSeoScore,
      avgResponseTime: brand.avgResponseTime,
      totalWebsites: brand.totalWebsites,
      activeWebsites: brand.activeWebsites,
      metricsUpdatedAt: brand.metricsUpdatedAt,
      createdAt: brand.createdAt,
      updatedAt: brand.updatedAt,
      counts: brand._count,
    }));

    return {
      data: simplifiedBrands,
      meta: {
        total,
        page,
        limit: validatedLimit,
        totalPages,
        hasNext,
        hasPrev,
        sortBy,
        sortOrder,
      },
    };
  }

  async createBrand(data: CreateBrandRequest) {
    const existingWithName = await prisma.brand.findUnique({
      where: { name: data.name }
    });
    
    if (existingWithName) {
      throw new Error('Brand name already exists');
    }

    const existingWithSlug = await prisma.brand.findUnique({
      where: { slug: data.slug }
    });
    
    if (existingWithSlug) {
      throw new Error('Brand slug already exists');
    }

    const newBrand = await prisma.brand.create({
      data: {
        name: data.name,
        slug: data.slug,
      },
      include: {
        _count: {
          select: {
            websites: true,
            stores: true,
            searchJobs: true,
          }
        }
      }
    });

    return newBrand;
  }

  async getBrandGroupsPipedrive(id: string, query: PipedriveBrandGroupsRequest) {
    const brand = await prisma.brand.findUnique({
      where: { id },
      select: { id: true, name: true, slug: true },
    });

    if (!brand) {
      throw new Error('Brand not found');
    }

    const stores = await prisma.store.findMany({
      where: { brandId: id, websiteId: { not: null } },
      select: {
        id: true,
        name: true,
        phone: true,
        state: { select: { code: true } },
        city: { select: { name: true } },
        website: { select: { url: true } },
      },
      orderBy: { name: 'asc' },
    });

    const groupedMap = stores.reduce<Record<string, {
      domain: string;
      websiteUrl: string;
      stores: typeof stores;
      states: Set<string>;
    }>>((acc, store) => {
      const url = store.website?.url;
      if (!url) return acc;

      const domain = extractDomain(url);
      if (!acc[domain]) {
        acc[domain] = { domain, websiteUrl: url, stores: [], states: new Set<string>() };
      }

      acc[domain].stores.push(store);
      if (store.state?.code) acc[domain].states.add(store.state.code);
      return acc;
    }, {});

    const groups = Object.values(groupedMap)
      .map((group) => ({
        domain: group.domain,
        websiteUrl: group.websiteUrl,
        stores: group.stores,
        states: [...group.states].sort(),
        bucket: bucketForGroup(group.domain, group.stores.length, group.states.size),
      }))
      .filter((group) => !query.bucket || query.bucket === 'all' || group.bucket === query.bucket)
      .sort((a, b) => b.stores.length - a.stores.length || a.domain.localeCompare(b.domain))
      .slice(0, Math.min(query.limit ?? 20, 500));

    const persistedGroups = await prisma.dealerGroup.findMany({
      where: {
        brandId: id,
        domain: { in: groups.map((group) => group.domain) },
      },
      select: {
        id: true,
        domain: true,
        readyForSdr: true,
        apolloStatus: true,
        hunterStatus: true,
        contacts: {
          orderBy: [
            { source: 'asc' },
            { isPrimary: 'desc' },
            { updatedAt: 'desc' },
          ],
          select: {
            id: true,
            source: true,
            fullName: true,
            title: true,
            email: true,
            emailConfidence: true,
            phone: true,
            linkedinUrl: true,
            isDecisionMaker: true,
            isPrimary: true,
          },
        },
      },
    });

    const persistedMap = new Map(persistedGroups.map((group) => [group.domain, group]));
    const savedForDomain = (domain: string) =>
      persistedMap.get(domain)
        ? {
            dealerGroupId: persistedMap.get(domain)!.id,
            readyForSdr: persistedMap.get(domain)!.readyForSdr,
            apolloStatus: persistedMap.get(domain)!.apolloStatus,
            hunterStatus: persistedMap.get(domain)!.hunterStatus,
            contacts: persistedMap.get(domain)!.contacts,
          }
        : null;

    const cached = await pipedriveGroupCacheService.read(id);
    const results = [];
    const toPersist = [];
    const databaseRows = [];

    for (const group of groups) {
      if (!query.refresh && cached[group.domain]) {
        const cachedEntry = cached[group.domain];
        if (cachedEntry.enrichment) {
          results.push({
            ...cachedEntry,
            saved: savedForDomain(group.domain),
          });
          databaseRows.push({
            ...cachedEntry,
            storeIds: group.stores.map((store) => store.id),
            storeCities: group.stores.map((store) => store.city?.name ?? null),
          });
          continue;
        }

        const hydratedEntry = {
          ...cachedEntry,
          saved: savedForDomain(group.domain),
          enrichment: groupEnrichmentPlannerService.build({
            domain: group.domain,
            bucket: group.bucket,
            provider: null,
            states: group.states,
            stores: group.stores.map((store) => ({
              name: store.name,
              city: store.city,
              phone: store.phone,
            })),
            pipedrive: {
              status: cachedEntry.pipedrive.status,
              orgName: cachedEntry.pipedrive.orgName,
              persons: cachedEntry.pipedrive.persons,
            },
          }),
        };

        results.push(hydratedEntry);
        toPersist.push(hydratedEntry);
        databaseRows.push({
          ...hydratedEntry,
          storeIds: group.stores.map((store) => store.id),
          storeCities: group.stores.map((store) => store.city?.name ?? null),
        });
        continue;
      }

      const pipedrive = await pipedriveService.searchBestOrganization(
        buildSearchTerms(group.domain, group.stores.slice(0, 3).map((store) => store.name))
      );
      const leadStatus = pipedriveService.determineLeadStatus(pipedrive);

      const entry = {
        domain: group.domain,
        websiteUrl: group.websiteUrl,
        bucket: group.bucket,
        stores: group.stores.length,
        states: group.states,
        saved: savedForDomain(group.domain),
        pipedrive: {
          matchedTerm: pipedrive.matchedTerm,
          orgId: pipedrive.orgId,
          orgName: pipedrive.orgName,
          website: pipedrive.website,
          city: pipedrive.city,
          status: leadStatus.status,
          isCliente: leadStatus.isCliente,
          dealStage: leadStatus.dealStage,
          dealId: leadStatus.dealId,
          responsavel: leadStatus.responsavel,
          deals: pipedrive.deals,
          persons: pipedrive.persons,
        },
        enrichment: groupEnrichmentPlannerService.build({
          domain: group.domain,
          bucket: group.bucket,
          provider: null,
          states: group.states,
          stores: group.stores.map((store) => ({
            name: store.name,
            city: store.city,
            phone: store.phone,
          })),
          pipedrive: {
            status: leadStatus.status,
            orgName: pipedrive.orgName,
            persons: pipedrive.persons,
          },
        }),
        checkedAt: new Date().toISOString(),
      };

      results.push(entry);
      toPersist.push(entry);
      databaseRows.push({
        ...entry,
        storeIds: group.stores.map((store) => store.id),
        storeCities: group.stores.map((store) => store.city?.name ?? null),
      });
    }

    if (toPersist.length > 0) {
      await pipedriveGroupCacheService.merge(id, toPersist);
    }

    if (databaseRows.length > 0) {
      await dealerGroupPersistenceService.persistBrandGroups(id, databaseRows, {
        recordRun: query.refresh === true,
      });
    }

    return {
      brand,
      checked: results.length,
      limit: Math.min(query.limit ?? 20, 500),
      bucket: query.bucket ?? 'all',
      data: results,
    };
  }

}

import prisma from '../../utils/prisma';
import { ProviderStatsRequest, ListWebsitesRequest, ProviderMetricsRequest, UpdateWebsiteRequest } from './websites.schema';

export class WebsitesService {
  async getProviderStats(query: ProviderStatsRequest) {
    const { includeInactive = false } = query;

    const websites = await prisma.website.findMany({
      where: {
        ...(includeInactive ? {} : { isActive: true }),
      },
      include: {
        provider: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    const stats = new Map();
    let withoutProvider = 0;

    websites.forEach((website) => {
      if (website.provider) {
        const providerId = website.provider.id;
        if (stats.has(providerId)) {
          stats.get(providerId).count += 1;
        } else {
          stats.set(providerId, {
            providerId: website.provider.id,
            providerName: website.provider.name,
            providerSlug: website.provider.slug,
            count: 1,
          });
        }
      } else {
        withoutProvider += 1;
      }
    });

    const data = Array.from(stats.values()).sort((a, b) => b.count - a.count);

    if (withoutProvider > 0) {
      data.push({
        providerId: null,
        providerName: 'Desconhecido',
        providerSlug: 'unknown',
        count: withoutProvider,
      });
    }

    const totalWebsites = websites.length;
    const totalProviders = stats.size;

    return {
      data,
      meta: {
        totalWebsites,
        totalProviders,
        includeInactive,
      },
    };
  }

  async listWebsites(query: ListWebsitesRequest) {
    const { page = 1, limit = 50, brandId, providerId, search, sortBy = 'createdAt', sortOrder = 'desc' } = query;

    const validatedLimit = Math.min(limit, 1000);
    const offset = (page - 1) * validatedLimit;

    // Mapear campos de ordenação para os nomes corretos no banco
    const sortFieldMap = {
      avgPerformanceScore: 'avgPerformanceScore',
      seoScore: 'seoScore', 
      downtimeSeconds: 'downtimeSeconds',
      avgResponseTime: 'avgResponseTime',
    };

    const orderBy = sortBy in sortFieldMap 
      ? { [sortFieldMap[sortBy as keyof typeof sortFieldMap]]: sortOrder }
      : { createdAt: 'desc' as const };

    // Construir filtros de busca
    const whereConditions: any = {};
    
    if (brandId) {
      whereConditions.brandId = brandId;
    }
    
    if (providerId) {
      whereConditions.providerId = providerId;
    }
    
    if (search) {
      whereConditions.url = {
        contains: search,
        mode: 'insensitive'
      };
    }

    const [websites, total] = await Promise.all([
      prisma.website.findMany({
        where: whereConditions,
        include: {
          brand: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          provider: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
        orderBy,
        take: validatedLimit,
        skip: offset,
      }),
      prisma.website.count({
        where: whereConditions,
      }),
    ]);

    const totalPages = Math.ceil(total / validatedLimit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    return {
      data: websites,
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

  async getProviderMetrics(query: ProviderMetricsRequest) {
    const { includeInactive = false } = query;

    const websites = await prisma.website.findMany({
      where: {
        ...(includeInactive ? {} : { isActive: true }),
      },
      select: {
        avgPerformanceScore: true,
        seoScore: true,
        avgResponseTime: true,
        provider: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    const providerMetrics = new Map();

    websites.forEach((website) => {
      const providerId = website.provider?.id || 'unknown';
      const providerName = website.provider?.name || 'Desconhecido';
      const providerSlug = website.provider?.slug || 'unknown';

      if (!providerMetrics.has(providerId)) {
        providerMetrics.set(providerId, {
          providerId: providerId === 'unknown' ? null : providerId,
          providerName,
          providerSlug,
          totalWebsites: 0,
          performanceScores: [],
          seoScores: [],
          responseTimes: [],
        });
      }

      const provider = providerMetrics.get(providerId);
      provider.totalWebsites += 1;

      if (website.avgPerformanceScore !== null) {
        provider.performanceScores.push(website.avgPerformanceScore);
      }
      if (website.seoScore !== null) {
        provider.seoScores.push(website.seoScore);
      }
      if (website.avgResponseTime !== null) {
        provider.responseTimes.push(website.avgResponseTime);
      }
    });

    const data = Array.from(providerMetrics.values()).map(provider => {
      const avgPerformanceScore = provider.performanceScores.length > 0
        ? Math.round((provider.performanceScores.reduce((sum: number, score: number) => sum + score, 0) / provider.performanceScores.length) * 100) / 100
        : null;

      const avgSeoScore = provider.seoScores.length > 0
        ? Math.round((provider.seoScores.reduce((sum: number, score: number) => sum + score, 0) / provider.seoScores.length) * 100) / 100
        : null;

      const avgResponseTime = provider.responseTimes.length > 0
        ? Math.round(provider.responseTimes.reduce((sum: number, time: number) => sum + time, 0) / provider.responseTimes.length)
        : null;

      return {
        providerId: provider.providerId,
        providerName: provider.providerName,
        providerSlug: provider.providerSlug,
        totalWebsites: provider.totalWebsites,
        avgPerformanceScore,
        avgSeoScore,
        avgResponseTime,
        websitesWithPerformanceData: provider.performanceScores.length,
        websitesWithSeoData: provider.seoScores.length,
        websitesWithResponseTimeData: provider.responseTimes.length,
      };
    }).sort((a, b) => b.totalWebsites - a.totalWebsites);

    return {
      data,
      meta: {
        totalProviders: providerMetrics.size,
        totalWebsites: websites.length,
        includeInactive,
      },
    };
  }

  async updateWebsite(id: string, data: UpdateWebsiteRequest) {
    const existingWebsite = await prisma.website.findUnique({
      where: { id },
      include: {
        brand: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        provider: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    if (!existingWebsite) {
      throw new Error('Website not found');
    }

    if (data.url && data.url !== existingWebsite.url) {
      const existingWithUrl = await prisma.website.findUnique({
        where: { url: data.url },
      });
      
      if (existingWithUrl) {
        throw new Error('URL already exists for another website');
      }
    }

    if (data.brandId) {
      const brand = await prisma.brand.findUnique({
        where: { id: data.brandId },
      });
      
      if (!brand) {
        throw new Error('Brand not found');
      }
    }

    if (data.providerId) {
      const provider = await prisma.websiteProvider.findUnique({
        where: { id: data.providerId },
      });
      
      if (!provider) {
        throw new Error('Provider not found');
      }
    }

    const updatedWebsite = await prisma.website.update({
      where: { id },
      data: {
        ...(data.url && { url: data.url }),
        ...(data.providerId !== undefined && { providerId: data.providerId }),
        ...(data.brandId && { brandId: data.brandId }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        updatedAt: new Date(),
      },
      include: {
        brand: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        provider: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    return updatedWebsite;
  }

  async deleteWebsite(id: string) {
    const existingWebsite = await prisma.website.findUnique({
      where: { id },
      include: {
        stores: {
          select: { id: true, name: true }
        }
      }
    });

    if (!existingWebsite) {
      throw new Error('Website not found');
    }

    await prisma.$transaction(async (tx) => {
      if (existingWebsite.stores.length > 0) {
        await tx.store.updateMany({
          where: { websiteId: id },
          data: { websiteId: null }
        });
      }

      await tx.website.delete({
        where: { id }
      });
    });

    return {
      message: 'Website deleted successfully',
      storesUpdated: existingWebsite.stores.length
    };
  }

  /**
   * Extrai a URL real de um link de redirecionamento do Google.
   * Ex: https://url/?q=http://www.site.com.br/&opi=...  →  http://www.site.com.br/
   */
  static extractRealUrl(url: string): string {
    try {
      const parsed = new URL(url);
      const q = parsed.searchParams.get('q');
      if (q && (q.startsWith('http://') || q.startsWith('https://'))) {
        return q;
      }
    } catch {
      // URL inválida, retorna original
    }
    return url;
  }

  async getWebsiteById(id: string) {
    const website = await prisma.website.findUnique({
      where: { id },
      include: {
        brand: { select: { id: true, name: true, slug: true } },
        provider: { select: { id: true, name: true, slug: true } },
        stores: {
          where: { isActive: true },
          take: 10,
          include: {
            city: { select: { name: true } },
            state: { select: { code: true } },
            brand: { select: { id: true, name: true } },
            dealerGroup: { select: { id: true, crmOrgName: true, domain: true } },
          },
        },
        uptimeMetrics: {
          orderBy: { measuredAt: 'desc' },
          take: 168,
          select: { isUp: true, measuredAt: true, responseTime: true },
        },
      },
    });

    if (!website) throw new Error('Website not found');

    const { uptimeMetrics, stores, ...websiteData } = website;

    // Mapear stores para garantir que dealerGroup tenha a propriedade 'name' que o frontend espera
    const mappedStores = stores.map(store => ({
      ...store,
      dealerGroup: store.dealerGroup ? {
        id: store.dealerGroup.id,
        name: store.dealerGroup.crmOrgName || store.dealerGroup.domain
      } : null
    }));

    const totalChecks = uptimeMetrics.length;
    const upChecks = uptimeMetrics.filter(m => m.isUp).length;
    const uptimePercentage = totalChecks > 0
      ? parseFloat(((upChecks / totalChecks) * 100).toFixed(1))
      : null;

    const problems: string[] = [];
    if (websiteData.avgPerformanceScore != null && websiteData.avgPerformanceScore < 50) {
      problems.push('Tempo de carregamento acima do ideal na Home');
    }
    if (websiteData.avgResponseTime != null && websiteData.avgResponseTime > 1500) {
      problems.push('Tempo de resposta elevado (acima de 1.5s)');
    }
    if (websiteData.seoScore != null && websiteData.seoScore < 70) {
      problems.push('SEO abaixo do recomendado (score < 70)');
    }
    if (websiteData.downtimeSeconds != null && websiteData.downtimeSeconds > 0) {
      problems.push('Site com histórico de downtime registrado');
    }
    if (websiteData.avgResponseTime != null && websiteData.avgResponseTime > 3000) {
      problems.push('Risco de timeout em conexões lentas (> 3s)');
    }

    return {
      ...websiteData,
      stores: mappedStores,
      uptimePercentage,
      problems,
      totalUptimeChecks: totalChecks,
    };
  }

  async fixGoogleRedirectUrls() {
    const websites = await prisma.website.findMany({
      where: {
        OR: [
          { url: { contains: '?q=http://' } },
          { url: { contains: '?q=https://' } },
        ],
      },
      select: { id: true, url: true },
    });

    let fixed = 0;
    let merged = 0;
    let errors = 0;

    for (const website of websites) {
      const realUrl = WebsitesService.extractRealUrl(website.url);
      if (realUrl === website.url) continue;

      try {
        // Verifica se já existe outro registro com essa URL real
        const existing = await prisma.website.findFirst({
          where: { url: realUrl, id: { not: website.id } },
          select: { id: true },
        });

        if (existing) {
          // Redireciona as stores para o registro existente
          await prisma.store.updateMany({
            where: { websiteId: website.id },
            data: { websiteId: existing.id },
          });
          // Remove o registro duplicado
          await prisma.website.delete({ where: { id: website.id } }).catch(() => {});
          merged++;
        } else {
          await prisma.website.update({
            where: { id: website.id },
            data: { url: realUrl },
          });
          fixed++;
        }
      } catch {
        errors++;
      }
    }

    return {
      total: websites.length,
      fixed,
      merged,
      errors,
    };
  }
}
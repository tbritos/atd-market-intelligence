import prisma from '../../utils/prisma';
import { GlobalStatsRequest } from './dashboard.schema';

export class DashboardService {
  async getGlobalStats(query: GlobalStatsRequest) {
    const { includeInactive = false } = query;

    // Filtros para websites e lojas ativas
    const websiteFilter = includeInactive ? {} : { isActive: true };
    const storeFilter = includeInactive ? {} : { isActive: true };

    // Buscar todas as estatísticas em paralelo
    const [
      websiteStats,
      storeStats,
      providerStats,
      performanceStats,
      seoStats,
    ] = await Promise.all([
      // Contagem e métricas de websites
      prisma.website.aggregate({
        where: websiteFilter,
        _count: { id: true },
        _avg: {
          avgPerformanceScore: true,
          seoScore: true,
          avgResponseTime: true,
          avgMonthlyVisits: true,
        },
      }),

      // Contagem de lojas
      prisma.store.count({
        where: storeFilter,
      }),

      // Contagem de fornecedores únicos
      prisma.websiteProvider.count(),

      // Websites com dados de performance (para cálculo mais preciso)
      prisma.website.findMany({
        where: {
          ...websiteFilter,
          avgPerformanceScore: { not: null },
        },
        select: { avgPerformanceScore: true },
      }),

      // Websites com dados de SEO (para cálculo mais preciso)
      prisma.website.findMany({
        where: {
          ...websiteFilter,
          seoScore: { not: null },
        },
        select: { seoScore: true },
      }),
    ]);

    // Calcular médias mais precisas (apenas websites com dados)
    const avgPerformanceScore = performanceStats.length > 0
      ? Math.round((performanceStats.reduce((sum, w) => sum + (w.avgPerformanceScore || 0), 0) / performanceStats.length) * 100) / 100
      : null;

    const avgSeoScore = seoStats.length > 0
      ? Math.round((seoStats.reduce((sum, w) => sum + (w.seoScore || 0), 0) / seoStats.length) * 100) / 100
      : null;


    return {
      metrics: {
        websites: websiteStats._count.id,
        stores: storeStats,
        providers: providerStats,
        avgPerformanceScore,
        avgSeoScore,
        avgResponseTime: websiteStats._avg.avgResponseTime 
          ? Math.round(websiteStats._avg.avgResponseTime) 
          : null,
        avgMonthlyVisits: websiteStats._avg.avgMonthlyVisits 
          ? Math.round(websiteStats._avg.avgMonthlyVisits) 
          : null,
      },
      filters: {
        includeInactive,
      },
      lastUpdated: new Date(),
    };
  }
}
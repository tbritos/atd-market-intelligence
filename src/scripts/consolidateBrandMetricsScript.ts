import dotenv from 'dotenv';
dotenv.config();

import prisma from '../utils/prisma';

class ConsolidateBrandMetricsScript {
  async run(): Promise<void> {
    try {
      console.log('🔄 Starting brand metrics consolidation...');

      const brands = await prisma.brand.findMany({
        select: { id: true, name: true }
      });

      console.log(`📊 Found ${brands.length} brands to consolidate metrics`);

      if (brands.length === 0) {
        console.log('⚠️ No brands found. Exiting.');
        return;
      }

      let consolidatedCount = 0;

      for (const brand of brands) {
        try {
          await this.consolidateBrandMetrics(brand.id, brand.name);
          consolidatedCount++;
          
          if (consolidatedCount % 5 === 0) {
            console.log(`📊 Consolidated ${consolidatedCount}/${brands.length} brands...`);
          }
        } catch (error) {
          console.error(`❌ Error consolidating metrics for brand ${brand.name}:`, error);
        }
      }

      console.log(`✅ Brand metrics consolidation completed! Processed ${consolidatedCount} brands`);
    } catch (error) {
      console.error('💥 Error in brand metrics consolidation script:', error);
      process.exit(1);
    }
  }

  private async consolidateBrandMetrics(brandId: string, brandName: string): Promise<void> {
    // Buscar todos os websites da marca
    const websites = await prisma.website.findMany({
      where: { brandId },
      select: { 
        id: true, 
        isActive: true,
        avgPerformanceScore: true,
        seoScore: true,
        avgResponseTime: true,
      }
    });

    const totalWebsites = websites.length;
    const activeWebsites = websites.filter(w => w.isActive).length;

    if (totalWebsites === 0) {
      // Zerar métricas se não houver websites
      await prisma.brand.update({
        where: { id: brandId },
        data: {
          avgPerformanceScore: null,
          avgSeoScore: null,
          avgResponseTime: null,
          totalWebsites: 0,
          activeWebsites: 0,
          metricsUpdatedAt: new Date(),
        }
      });
      return;
    }

    // Calcular performance score médio (apenas websites ativos)
    const activeWebsitesWithPerformance = websites.filter(w => 
      w.isActive && w.avgPerformanceScore !== null
    );
    
    const avgPerformanceScore = activeWebsitesWithPerformance.length > 0
      ? Math.round((activeWebsitesWithPerformance.reduce((sum, w) => 
          sum + (w.avgPerformanceScore || 0), 0) / activeWebsitesWithPerformance.length) * 100) / 100
      : null;

    // Calcular SEO score médio (apenas websites ativos)
    const activeWebsitesWithSeo = websites.filter(w => 
      w.isActive && w.seoScore !== null
    );
    
    const avgSeoScore = activeWebsitesWithSeo.length > 0
      ? Math.round((activeWebsitesWithSeo.reduce((sum, w) => 
          sum + (w.seoScore || 0), 0) / activeWebsitesWithSeo.length) * 100) / 100
      : null;

    // Calcular tempo de resposta médio (apenas websites ativos)
    const activeWebsitesWithResponseTime = websites.filter(w => 
      w.isActive && w.avgResponseTime !== null
    );
    
    const avgResponseTime = activeWebsitesWithResponseTime.length > 0
      ? Math.round(activeWebsitesWithResponseTime.reduce((sum, w) => 
          sum + (w.avgResponseTime || 0), 0) / activeWebsitesWithResponseTime.length)
      : null;

    // Atualizar brand com valores consolidados
    await prisma.brand.update({
      where: { id: brandId },
      data: {
        avgPerformanceScore,
        avgSeoScore,
        avgResponseTime,
        totalWebsites,
        activeWebsites,
        metricsUpdatedAt: new Date(),
      }
    });

    console.log(`✅ ${brandName}: Performance: ${avgPerformanceScore}, SEO: ${avgSeoScore}, Response: ${avgResponseTime}ms, Websites: ${activeWebsites}/${totalWebsites}`);
  }
}

// Execute script if called directly
if (require.main === module) {
  const script = new ConsolidateBrandMetricsScript();
  script.run()
    .then(() => {
      console.log('✅ Brand metrics consolidation script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Brand metrics consolidation script failed:', error);
      process.exit(1);
    });
}

export default ConsolidateBrandMetricsScript;
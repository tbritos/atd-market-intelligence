import dotenv from 'dotenv';
dotenv.config();

import prisma from '../utils/prisma';

class ConsolidateMetricsScript {
  async run(): Promise<void> {
    try {
      console.log('🔄 Starting metrics consolidation...');

      const websites = await prisma.website.findMany({
        where: { isActive: true },
        select: { id: true, url: true }
      });

      console.log(`📊 Found ${websites.length} active websites to consolidate metrics`);

      if (websites.length === 0) {
        console.log('⚠️ No active websites found. Exiting.');
        return;
      }

      let consolidatedCount = 0;

      for (const website of websites) {
        try {
          await this.consolidateWebsiteMetrics(website.id);
          consolidatedCount++;
          
          if (consolidatedCount % 10 === 0) {
            console.log(`📊 Consolidated ${consolidatedCount}/${websites.length} websites...`);
          }
        } catch (error) {
          console.error(`❌ Error consolidating metrics for website ${website.id}:`, error);
        }
      }

      console.log(`✅ Metrics consolidation completed! Processed ${consolidatedCount} websites`);
    } catch (error) {
      console.error('💥 Error in metrics consolidation script:', error);
      process.exit(1);
    }
  }

  private async consolidateWebsiteMetrics(websiteId: string): Promise<void> {
    // Calcular performance score médio (últimas 10 medições)
    const performanceMetrics = await prisma.performanceMetric.findMany({
      where: { websiteId },
      select: { mobileScore: true },
      orderBy: { measuredAt: 'desc' },
      take: 10
    });

    const performanceScores = performanceMetrics
      .map(m => m.mobileScore)
      .filter(score => score !== null) as number[];
    
    const avgPerformanceScore = performanceScores.length > 0 
      ? Math.round((performanceScores.reduce((sum, score) => sum + score, 0) / performanceScores.length) * 100) / 100
      : null;

    // Calcular SEO score médio (últimas 10 medições)
    const seoMetrics = await prisma.seoMetric.findMany({
      where: { websiteId },
      select: { mobileScore: true },
      orderBy: { measuredAt: 'desc' },
      take: 10
    });

    const seoScores = seoMetrics
      .map(m => m.mobileScore)
      .filter(score => score !== null) as number[];
    
    const seoScore = seoScores.length > 0 
      ? Math.round((seoScores.reduce((sum, score) => sum + score, 0) / seoScores.length) * 100) / 100
      : null;

    // Calcular tempo de resposta médio (últimas 10 medições)
    const uptimeMetrics = await prisma.uptimeMetric.findMany({
      where: { websiteId },
      select: { isUp: true, responseTime: true },
      orderBy: { measuredAt: 'desc' },
      take: 10
    });

    const responseTimes = uptimeMetrics
      .map(m => m.responseTime)
      .filter(time => time !== null) as number[];
    
    const avgResponseTime = responseTimes.length > 0 
      ? Math.round(responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length)
      : null;

    // Calcular downtime (últimas 24h em segundos)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    const downtimeMetrics = await prisma.uptimeMetric.findMany({
      where: { 
        websiteId,
        measuredAt: { gte: yesterday }
      },
      select: { isUp: true }
    });

    const downtimeCount = downtimeMetrics.filter(m => !m.isUp).length;
    // Assumindo que cada medição representa 5 minutos de verificação
    const downtimeSeconds = downtimeCount * 300; 

    // Calcular visitas mensais médias (últimas 5 medições)
    const trafficMetrics = await prisma.trafficMetric.findMany({
      where: { websiteId },
      select: { monthlyVisits: true },
      orderBy: { estimatedAt: 'desc' },
      take: 5
    });

    const monthlyVisits = trafficMetrics
      .map(m => m.monthlyVisits)
      .filter(visits => visits !== null) as number[];
    
    const avgMonthlyVisits = monthlyVisits.length > 0 
      ? Math.round(monthlyVisits.reduce((sum, visits) => sum + visits, 0) / monthlyVisits.length)
      : null;

    // Atualizar website com valores consolidados
    await prisma.website.update({
      where: { id: websiteId },
      data: {
        avgPerformanceScore,
        seoScore,
        avgResponseTime,
        downtimeSeconds,
        avgMonthlyVisits,
        updatedAt: new Date()
      }
    });
  }
}

// Execute script if called directly
if (require.main === module) {
  const script = new ConsolidateMetricsScript();
  script.run()
    .then(() => {
      console.log('✅ Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Script failed:', error);
      process.exit(1);
    });
}

export default ConsolidateMetricsScript;
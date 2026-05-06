import prisma from '../../utils/prisma';
import { BaseAggregator, MetricConfig } from './base-aggregator.interface';

export class WebsiteProviderAggregator implements BaseAggregator {
  private readonly metrics: MetricConfig[] = [
    {
      source: 'websites.performanceMetrics.mobileScore',
      target: 'avgPerformanceScore',
      aggregationType: 'avg'
    },
    {
      source: 'websites.seoMetrics.mobileScore',
      target: 'avgSeoScore',
      aggregationType: 'avg'
    }
  ];

  async aggregate(): Promise<void> {
    const providers = await prisma.websiteProvider.findMany({
      select: { id: true, name: true }
    });

    console.log(`🏢 Aggregating metrics for ${providers.length} website providers`);

    for (const provider of providers) {
      await this.aggregateProviderMetrics(provider.id);
    }

    console.log('✅ Website provider aggregation completed');
  }

  private async aggregateProviderMetrics(providerId: string): Promise<void> {
    const updates: any = {};

    for (const metric of this.metrics) {
      const value = await this.calculateMetric(providerId, metric);
      if (value !== null) {
        updates[metric.target] = value;
      }
    }

    if (Object.keys(updates).length > 0) {
      await prisma.websiteProvider.update({
        where: { id: providerId },
        data: updates
      });
    }
  }

  private async calculateMetric(providerId: string, metric: MetricConfig): Promise<number | null> {
    if (metric.source.includes('performanceMetrics')) {
      const result = await prisma.performanceMetric.aggregate({
        where: {
          website: {
            providerId,
            isActive: true
          },
          mobileScore: { not: null }
        },
        _avg: { mobileScore: true }
      });
      return result._avg.mobileScore;
    }

    if (metric.source.includes('seoMetrics')) {
      const result = await prisma.seoMetric.aggregate({
        where: {
          website: {
            providerId,
            isActive: true
          },
          mobileScore: { not: null }
        },
        _avg: { mobileScore: true }
      });
      return result._avg.mobileScore;
    }

    return null;
  }
}
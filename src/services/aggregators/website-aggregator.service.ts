import prisma from '../../utils/prisma';
import { BaseAggregator, MetricConfig } from './base-aggregator.interface';

export class WebsiteAggregator implements BaseAggregator {
  private readonly metrics: MetricConfig[] = [
    {
      source: 'performanceMetrics.mobileScore',
      target: 'avgPerformanceScore',
      aggregationType: 'avg'
    },
    {
      source: 'seoMetrics.mobileScore',
      target: 'seoScore',
      aggregationType: 'avg'
    }
  ];

  async aggregate(): Promise<void> {
    const websites = await prisma.website.findMany({
      where: { isActive: true },
      select: { id: true }
    });

    console.log(`📈 Aggregating metrics for ${websites.length} websites`);

    for (const website of websites) {
      await this.aggregateWebsiteMetrics(website.id);
    }

    console.log('✅ Website aggregation completed');
  }

  private async aggregateWebsiteMetrics(websiteId: string): Promise<void> {
    const updates: any = {};

    for (const metric of this.metrics) {
      const value = await this.calculateMetric(websiteId, metric);
      if (value !== null) {
        updates[metric.target] = value;
      }
    }

    if (Object.keys(updates).length > 0) {
      await prisma.website.update({
        where: { id: websiteId },
        data: updates
      });
    }
  }

  private async calculateMetric(websiteId: string, metric: MetricConfig): Promise<number | null> {
    if (metric.source.includes('performanceMetrics')) {
      const result = await prisma.performanceMetric.aggregate({
        where: {
          websiteId,
          mobileScore: { not: null }
        },
        _avg: { mobileScore: true }
      });
      return result._avg.mobileScore;
    }

    if (metric.source.includes('seoMetrics')) {
      const result = await prisma.seoMetric.aggregate({
        where: {
          websiteId,
          mobileScore: { not: null }
        },
        _avg: { mobileScore: true }
      });
      return result._avg.mobileScore;
    }

    return null;
  }
}
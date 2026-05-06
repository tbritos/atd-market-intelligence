import prisma from '../../utils/prisma';
import { PageSpeedInsightsData } from '../../types/pagespeed.types';

export class MetricsStorageService {

  async saveMetrics(websiteId: string, analysis: PageSpeedInsightsData): Promise<void> {
    const promises = [];

    if (analysis.performanceScore !== null) {
      promises.push(this.savePerformanceMetric(websiteId, analysis.performanceScore));
    }

    if (analysis.seoScore !== null) {
      promises.push(this.saveSeoMetric(websiteId, analysis.seoScore));
    }

    await Promise.all(promises);
  }


  private async savePerformanceMetric(websiteId: string, score: number): Promise<void> {
    await prisma.performanceMetric.create({
      data: {
        websiteId,
        mobileScore: score,
        measuredAt: new Date(),
      }
    });
  }

  private async saveSeoMetric(websiteId: string, score: number): Promise<void> {
    await prisma.seoMetric.create({
      data: {
        websiteId,
        mobileScore: score,
        measuredAt: new Date(),
      }
    });
  }

}

export const metricsStorageService = new MetricsStorageService();
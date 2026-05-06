import { Worker } from 'bullmq';
import redis from '../config/redis';
import {
  pageSpeedService,
  websiteValidationByIdService,
  metricsStorageService
} from '../services/performance';

export class PerformanceCollectorWorker {
  private worker: Worker;

  constructor() {
    this.worker = new Worker('performanceCollector', this.processJob.bind(this), {
      connection: redis,
      concurrency: 10,
    });

    this.worker.on('completed', (job) => {
      console.log(`Performance collection job ${job.id} completed for website ${job.data.websiteId}`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`Performance collection job ${job?.id} failed:`, err);
    });

    this.worker.on('error', (error) => {
      console.error('Performance collector worker error:', error);
    });
  }

  private async processJob(job: any) {
    const { websiteId, url } = job.data;

    try {
      const validation = await websiteValidationByIdService.validateWebsite(websiteId);

      if (!validation.isValid) {
        if (validation.error?.includes('inactive')) {
          console.log(`Skipping inactive website: ${websiteId}`);
          return;
        }
        throw new Error(validation.error);
      }

      const analysis = await pageSpeedService.analyzeWebsite(url);

      if (analysis.error) {
        console.error(`PageSpeed analysis failed for ${url}:`, analysis.error);
        return;
      }

      await metricsStorageService.saveMetrics(websiteId, analysis);

      console.log(`Performance data collected for ${url}: Performance=${analysis.performanceScore}, SEO=${analysis.seoScore}`);

    } catch (error) {
      console.error(`Error processing performance collection job for ${websiteId}:`, error);
      throw error;
    }
  }


  async close() {
    await this.worker.close();
  }
}

export const performanceCollectorWorker = new PerformanceCollectorWorker();
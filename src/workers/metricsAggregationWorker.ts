import { Worker } from 'bullmq';
import redis from '../config/redis';
import { metricsOrchestrator } from '../services/aggregators';

export class MetricsAggregationWorker {
  private worker: Worker;

  constructor() {
    this.worker = new Worker('metricsAggregation', this.processJob.bind(this), {
      connection: redis,
      concurrency: 1,
    });

    this.worker.on('completed', (job) => {
      console.log(`Metrics aggregation job ${job.id} completed`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`Metrics aggregation job ${job?.id} failed:`, err);
    });

    this.worker.on('error', (error) => {
      console.error('Metrics aggregation worker error:', error);
    });
  }

  private async processJob(_job: any) {
    try {
      console.log('🔄 Starting daily metrics aggregation...');
      
      await metricsOrchestrator.aggregateAll();
      
      console.log('✅ Daily metrics aggregation completed successfully');
    } catch (error) {
      console.error('❌ Error during metrics aggregation:', error);
      throw error;
    }
  }

  async close() {
    await this.worker.close();
  }
}

export const metricsAggregationWorker = new MetricsAggregationWorker();
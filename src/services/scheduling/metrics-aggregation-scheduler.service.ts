import { ScheduledTask, schedule, validate } from 'node-cron';
import { Queue } from 'bullmq';
import redis from '../../config/redis';

export class MetricsAggregationSchedulerService {
  private cronJob: ScheduledTask | null = null;
  private metricsAggregationQueue: Queue;
  private readonly defaultCronExpression = '0 2 * * *'; // Daily at 2 AM
  private readonly timezone = 'America/Sao_Paulo';

  constructor() {
    this.metricsAggregationQueue = new Queue('metricsAggregation', {
      connection: redis,
      defaultJobOptions: {
        removeOnComplete: 5,
        removeOnFail: 10,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      }
    });
  }

  start(): void {
    const cronExpression = this.getCronExpression();

    if (!validate(cronExpression)) {
      this.handleInvalidCronExpression(cronExpression);
      return;
    }

    this.createScheduledTask(cronExpression);
  }

  stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      console.log('🛑 Metrics aggregation scheduler stopped');
    }
  }

  destroy(): void {
    if (this.cronJob) {
      this.cronJob.destroy();
      this.cronJob = null;
      console.log('🗑️ Metrics aggregation scheduler destroyed');
    }
  }

  private getCronExpression(): string {
    return process.env.METRICS_AGGREGATION_CRON || this.defaultCronExpression;
  }

  private handleInvalidCronExpression(invalidExpression: string): void {
    console.error(`⚠️  Invalid cron expression: ${invalidExpression}. Falling back to default schedule: "${this.defaultCronExpression}".`);
    this.createScheduledTask(this.defaultCronExpression);
  }

  private createScheduledTask(cronExpression: string): void {
    this.cronJob = schedule(
      cronExpression,
      this.executeScheduledAggregation.bind(this),
      {
        timezone: this.timezone
      }
    );
  }

  private async executeScheduledAggregation(): Promise<void> {
    try {
      await this.metricsAggregationQueue.add('dailyAggregation', {
        scheduledAt: new Date().toISOString(),
        type: 'daily'
      });
    } catch (error) {
      console.error('❌ Metrics aggregation scheduled execution failed:', error);
    }
  }

  async close(): Promise<void> {
    this.destroy();
    await this.metricsAggregationQueue.close();
  }
}

export const metricsAggregationScheduler = new MetricsAggregationSchedulerService();
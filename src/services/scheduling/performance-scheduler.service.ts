import { ScheduledTask, schedule, validate } from 'node-cron';
import PagespeedScript from '../../scripts/pagespeedScript';

export class PerformanceSchedulerService {
  private cronJob: ScheduledTask | null = null;
  private pagespeedScript: PagespeedScript;
  private readonly defaultCronExpression = '0 8,14,20 * * *';
  private readonly timezone = 'America/Sao_Paulo';

  constructor() {
    this.pagespeedScript = new PagespeedScript();
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
      console.log('🛑 Performance scheduler stopped');
    }
  }

  destroy(): void {
    if (this.cronJob) {
      this.cronJob.destroy();
      this.cronJob = null;
      console.log('🗑️ Performance scheduler destroyed');
    }
  }

  private getCronExpression(): string {
    return process.env.PAGESPEED_CRON || this.defaultCronExpression;
  }

  private handleInvalidCronExpression(invalidExpression: string): void {
    console.error(`⚠️  Invalid cron expression: ${invalidExpression}. Falling back to default schedule: "${this.defaultCronExpression}".`);
    this.createScheduledTask(this.defaultCronExpression);
  }

  private createScheduledTask(cronExpression: string): void {
    this.cronJob = schedule(
      cronExpression,
      this.executeScheduledCollection.bind(this),
      {
        timezone: this.timezone
      }
    );
  }

  private async executeScheduledCollection(): Promise<void> {
    try {
      await this.pagespeedScript.run();
    } catch (error) {
      console.error(`❌ Performance collection scheduled execution failed:`, error);
    }
  }
}

export const performanceScheduler = new PerformanceSchedulerService();
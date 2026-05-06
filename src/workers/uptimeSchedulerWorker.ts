import { Worker } from 'bullmq';
import { uptimeMonitorQueue } from '../config/queue';
import redis from '../config/redis';
import prisma from '../utils/prisma';

export class UptimeSchedulerWorker {
  private worker: Worker;
  private schedulerInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.worker = new Worker('uptimeScheduler', this.processJob.bind(this), {
      connection: redis,
      concurrency: 1,
    });

    this.worker.on('completed', (job) => {
      console.log(`Uptime scheduler job ${job.id} completed`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`Uptime scheduler job ${job?.id} failed:`, err);
    });

    this.worker.on('error', (error) => {
      console.error('Uptime scheduler worker error:', error);
    });

    this.startScheduler();
  }

  private startScheduler() {
    console.log('Starting uptime scheduler - will run every 30 seconds');
    
    this.scheduleUptimeChecks();
    
    this.schedulerInterval = setInterval(() => {
      this.scheduleUptimeChecks();
    }, 30000);
  }

  private async scheduleUptimeChecks() {
    try {
      console.log('Scheduling uptime checks for all active websites...');
      
      const websites = await prisma.website.findMany({
        where: { isActive: true },
        select: {
          id: true,
          url: true
        }
      });

      if (websites.length === 0) {
        console.log('No active websites found for uptime monitoring');
        return;
      }

      console.log(`Found ${websites.length} active websites to monitor`);

      for (let i = 0; i < websites.length; i++) {
        const website = websites[i];

        await uptimeMonitorQueue.add('checkUptime', {
          websiteId: website.id,
          url: website.url
        }, {
          delay: Math.floor((i * 25000) / websites.length),
          // Stable jobId — prevents duplicates in queue
          jobId: `uptime-${website.id}`,
          removeOnComplete: 5,
          removeOnFail: 3,
        });
      }

      console.log(`Successfully scheduled ${websites.length} uptime check jobs`);

    } catch (error) {
      console.error('Error scheduling uptime checks:', error);
    }
  }

  private async processJob(_job: any) {
    console.log('Uptime scheduler job received (manual trigger)');
    await this.scheduleUptimeChecks();
  }

  async close() {
    console.log('Shutting down uptime scheduler...');
    
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
    }
    
    await this.worker.close();
  }

  // Método para agendar manualmente (útil para testes)
  async triggerScheduling() {
    await this.scheduleUptimeChecks();
  }
}

export const uptimeSchedulerWorker = new UptimeSchedulerWorker();

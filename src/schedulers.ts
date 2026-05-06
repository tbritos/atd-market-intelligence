import dotenv from 'dotenv';
dotenv.config();

import { performanceScheduler, metricsAggregationScheduler } from './services/scheduling';

class SchedulersManager {
  private schedulers = new Map<string, { start: () => void; stop: () => void }>();

  constructor() {
    this.registerSchedulers();
  }

  private registerSchedulers() {
    this.schedulers.set('performance', performanceScheduler);
    this.schedulers.set('metricsAggregation', metricsAggregationScheduler);
  }

  start() {
    console.log('🕐 Starting all schedulers...');

    this.schedulers.forEach((scheduler, name) => {
      try {
        scheduler.start();
        console.log(`✅ ${name} scheduler started`);
      } catch (error) {
        console.error(`❌ Failed to start ${name} scheduler:`, error);
      }
    });

    console.log(`🚀 Schedulers running`);
  }

  stop() {
    console.log('🛑 Stopping all schedulers...');

    this.schedulers.forEach((scheduler, name) => {
      try {
        scheduler.stop();
        console.log(`✅ ${name} scheduler stopped`);
      } catch (error) {
        console.error(`❌ Failed to stop ${name} scheduler:`, error);
      }
    });
  }
}

const schedulersManager = new SchedulersManager();

process.on('SIGINT', async () => {
  console.log('\n📊 Received SIGINT, shutting down schedulers gracefully...');
  schedulersManager.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n📊 Received SIGTERM, shutting down schedulers gracefully...');
  schedulersManager.stop();
  process.exit(0);
});

schedulersManager.start();

export default schedulersManager;
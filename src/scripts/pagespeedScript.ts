import dotenv from 'dotenv';
dotenv.config();

import prisma from '../utils/prisma';
import { performanceCollectorQueue } from '../config/queue';

class PagespeedScript {
  private readonly REQUESTS_PER_MINUTE = 200; // 240 is the Pagespeed limit, using 200 for safety margin
  private readonly MINUTE_IN_MS = 60 * 1000;

  async run(): Promise<void> {
    try {
      const websites = await prisma.website.findMany({
        where: { isActive: true },
        select: { id: true, url: true }
      });

      console.log(`📊 Found ${websites.length} active websites to schedule for performance collection`);

      if (websites.length === 0) {
        console.log('⚠️ No active websites found. Exiting.');
        return;
      }

      let scheduledCount = 0;
      let currentMinute = 0;
      let jobsInCurrentMinute = 0;

      for (const website of websites) {
        try {
          const delayInCurrentMinute = Math.floor((jobsInCurrentMinute * this.MINUTE_IN_MS) / this.REQUESTS_PER_MINUTE);
          const totalDelay = (currentMinute * this.MINUTE_IN_MS) + delayInCurrentMinute;

          await performanceCollectorQueue.add(
            'collectPerformance',
            {
              websiteId: website.id,
              url: website.url
            },
            {
              delay: totalDelay,
              removeOnComplete: 20,
              removeOnFail: 50,
            }
          );

          scheduledCount++;
          jobsInCurrentMinute++;

          if (jobsInCurrentMinute >= this.REQUESTS_PER_MINUTE) {
            currentMinute++;
            jobsInCurrentMinute = 0;
          }

        } catch (error) {
          console.error(`❌ Error scheduling job for website ${website.id}:`, error);
        }
      }

      console.log(`📊 Scheduled ${scheduledCount} jobs`);
    } catch (error) {
      console.error('💥 Error in PageSpeed scheduling script:', error);
      process.exit(1);
    }
  }

}

export default PagespeedScript;
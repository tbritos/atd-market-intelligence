import { Worker } from 'bullmq';
import { TrafficCollectionJobData } from '../config/queue';
import redis from '../config/redis';
import prisma from '../utils/prisma';
import axios from 'axios';

export class TrafficCollectionWorker {
  private worker: Worker;

  constructor() {
    this.worker = new Worker('trafficCollection', this.processTrafficJob.bind(this), {
      connection: redis,
      concurrency: 5,
    });

    this.worker.on('completed', (job) => {
      console.log(`Traffic collection job ${job.id} completed for website ${job.data.websiteId}`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`Traffic collection job ${job?.id} failed:`, err);
    });

    this.worker.on('error', (error) => {
      console.error('Traffic collection worker error:', error);
    });
  }

  private async processTrafficJob(job: any) {
    const { websiteId, url } = job.data;
    
    console.log(`Processing traffic collection for website: ${websiteId} (${url})`);

    try {
      const website = await prisma.website.findUnique({
        where: { id: websiteId }
      });

      if (!website) {
        console.log(`Website ${websiteId} not found, skipping traffic collection`);
        return;
      }

      if (!website.isActive) {
        console.log(`Website ${websiteId} is inactive, skipping traffic collection`);
        return;
      }

      const domain = this.extractDomainFromUrl(url);
      if (!domain) {
        throw new Error(`Could not extract domain from URL: ${url}`);
      }

      const trafficData = await this.fetchMonthlyTraffic(domain);
      
      if (trafficData.visits !== null && trafficData.visits !== undefined) {
        await prisma.trafficMetric.create({
          data: {
            websiteId: websiteId,
            monthlyVisits: trafficData.visits,
            source: 'external-api'
          }
        });

        await prisma.website.update({
          where: { id: websiteId },
          data: { avgMonthlyVisits: trafficData.visits }
        });

        console.log(`Successfully updated traffic data for ${url}: ${trafficData.visits} monthly visits`);
      } else {
        console.log(`No traffic data available for ${url}`);
      }

    } catch (error) {
      console.error(`Error processing traffic collection job for ${websiteId}:`, error);
      throw error;
    }
  }

  private extractDomainFromUrl(url: string): string | null {
    try {
      const normalizedUrl = url.startsWith('http') ? url : `https://${url}`;
      const urlObj = new URL(normalizedUrl);
      return urlObj.hostname;
    } catch (error) {
      console.error(`Error extracting domain from URL ${url}:`, error);
      return null;
    }
  }

  private async fetchMonthlyTraffic(domain: string): Promise<{ visits: number | null }> {
    try {
      const sessionForm = Date.now().toString();
      
      const response = await axios.post('https://c992f7500e24.ngrok.app/api/domains', {
        sessionForm: sessionForm,
        domain: domain
      }, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      if (response.data && response.data.domain && response.data.domain.visits !== undefined) {
        return { visits: response.data.domain.visits };
      } else {
        console.log(`Invalid response format for domain ${domain}`);
        return { visits: null };
      }

    } catch (error) {
      console.error(`Error fetching traffic data for domain ${domain}:`, error);
      return { visits: null };
    }
  }

  async close() {
    await this.worker.close();
  }
}

export const trafficCollectionWorker = new TrafficCollectionWorker();
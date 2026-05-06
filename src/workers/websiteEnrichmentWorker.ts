import { Worker, Job } from 'bullmq';
import redis from '../config/redis';
import { WebsiteEnrichmentJobData } from '../config/queue';
import { websiteSearchService } from '../services/enrichment/website-search.service';
import prisma from '../utils/prisma';

class WebsiteEnrichmentWorker {
  private worker: Worker;

  constructor() {
    this.worker = new Worker('websiteEnrichment', this.processJob.bind(this), {
      connection: redis,
      concurrency: 2, // baixo para preservar cota das APIs gratuitas
    });

    this.worker.on('completed', (job) => {
      console.log(`[WebsiteEnrichment] Completed: ${job.data.storeName}`);
    });
    this.worker.on('failed', (job, err) => {
      console.error(`[WebsiteEnrichment] Failed: ${job?.data?.storeName}:`, err.message);
    });
    this.worker.on('error', (err) => {
      console.error('[WebsiteEnrichment] Worker error:', err);
    });
  }

  private async processJob(job: Job<WebsiteEnrichmentJobData>) {
    const { storeId, storeName, brandId, cityName } = job.data;

    // Skip se já ganhou website em outra rodada
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { websiteId: true },
    });
    if (store?.websiteId) return;

    const url = await websiteSearchService.search(storeName, cityName);
    if (!url) {
      console.log(`[WebsiteEnrichment] No website found for ${storeName}`);
      return;
    }

    const normalizedUrl = url.startsWith('http') ? url : `https://${url}`;

    const website = await prisma.website.upsert({
      where: { url: normalizedUrl },
      update: {},
      create: { url: normalizedUrl, brandId, isActive: true },
    });

    await prisma.store.update({
      where: { id: storeId },
      data: { websiteId: website.id },
    });

    console.log(`[WebsiteEnrichment] Saved website for ${storeName}: ${normalizedUrl}`);
  }
}

export const websiteEnrichmentWorker = new WebsiteEnrichmentWorker();

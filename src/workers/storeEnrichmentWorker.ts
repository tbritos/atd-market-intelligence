import { Worker, Job } from 'bullmq';
import redis from '../config/redis';
import { storeEnrichmentService } from '../services/enrichment/store-enrichment.service';

export interface StoreEnrichmentJobData {
  storeId: string;
  storeName: string;
}

export class StoreEnrichmentWorker {
  private worker: Worker;

  constructor() {
    this.worker = new Worker('storeEnrichment', this.processJob.bind(this), {
      connection: redis,
      concurrency: 1, // 1 por vez — respeita rate limits Apollo/Hunter
    });

    this.worker.on('completed', (job) => {
      console.log(`Store enrichment ${job.id} concluído`);
    });
    this.worker.on('failed', (job, err) => {
      console.error(`Store enrichment ${job?.id} falhou:`, err.message);
    });
    this.worker.on('error', (err) => {
      console.error('Store enrichment worker error:', err);
    });
  }

  private async processJob(job: Job<StoreEnrichmentJobData>) {
    const { storeId, storeName } = job.data;
    console.log(`Enriquecendo store: ${storeName} (${storeId})`);

    const result = await storeEnrichmentService.enrichStore(storeId);

    console.log(
      `  Apollo org: ${result.steps.apollo_org} | ` +
      `People: ${result.steps.apollo_people} | ` +
      `Hunter: ${result.steps.hunter} | ` +
      `~${result.creditsUsed} créditos`
    );

    return result;
  }
}

export const storeEnrichmentWorker = new StoreEnrichmentWorker();

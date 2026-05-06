import { Worker, Job } from 'bullmq';
import redis from '../config/redis';
import { LeadEnrichmentJobData } from '../config/queue';
import { enrichmentPipelineService } from '../services/enrichment/enrichment-pipeline.service';
import prisma from '../utils/prisma';

class LeadEnrichmentWorker {
  private worker: Worker;

  constructor() {
    this.worker = new Worker('leadEnrichment', this.processJob.bind(this), {
      connection: redis,
      concurrency: 1, // 1 lead por vez para respeitar rate limits das APIs
    });

    this.worker.on('completed', (job) => {
      console.log(`[LeadEnrichment] Concluído: ${job.data.empresa} (${job.data.leadId})`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`[LeadEnrichment] Falhou: ${job?.data?.empresa}:`, err.message);
    });

    this.worker.on('error', (err) => {
      console.error('[LeadEnrichment] Worker error:', err);
    });
  }

  private async processJob(job: Job<LeadEnrichmentJobData>) {
    const { leadId, empresa } = job.data;

    // Verifica se o lead ainda existe antes de processar
    const lead = await prisma.amostraLead.findUnique({
      where: { id: leadId },
      select: { id: true, statusPipeline: true },
    });

    if (!lead) {
      console.warn(`[LeadEnrichment] Lead ${leadId} não encontrado, pulando.`);
      return;
    }

    // Pula se já foi processado
    if (lead.statusPipeline === 'done') {
      console.log(`[LeadEnrichment] Lead "${empresa}" já processado, pulando.`);
      return;
    }

    console.log(`[LeadEnrichment] Iniciando pipeline: ${empresa}`);

    const result = await enrichmentPipelineService.enrichLead(leadId);

    console.log(`[LeadEnrichment] Pipeline finalizado para "${empresa}":`, result.steps);
  }
}

export const leadEnrichmentWorker = new LeadEnrichmentWorker();

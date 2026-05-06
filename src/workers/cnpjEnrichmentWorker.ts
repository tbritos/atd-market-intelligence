import { Worker } from 'bullmq';
import redis from '../config/redis';
import { CnpjEnrichmentJobData } from '../config/queue';
import { brasilApiService } from '../services/enrichment/brasil-api.service';
import { websiteContactScraperService } from '../services/enrichment/website-contact-scraper.service';
import prisma from '../utils/prisma';

export class CnpjEnrichmentWorker {
  private worker: Worker;

  constructor() {
    this.worker = new Worker('cnpjEnrichment', this.processJob.bind(this), {
      connection: redis,
      concurrency: 5,
    });

    this.worker.on('completed', (job) => {
      console.log(`CNPJ enrichment completed for store ${job.data.storeName}`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`CNPJ enrichment failed for store ${job?.data?.storeName}:`, err.message);
    });

    this.worker.on('error', (error) => {
      console.error('CNPJ enrichment worker error:', error);
    });
  }

  private async processJob(job: { data: CnpjEnrichmentJobData }) {
    const { storeId, websiteUrl, storeName, cnpj: cnpjFromJob } = job.data;

    // Se o CNPJ já veio no job (stores RFB), pula o scraping e vai direto na BrasilAPI
    let cnpjRaw: string | null = cnpjFromJob ?? null;
    let contacts = { cnpj: null as string | null, email: null as string | null, whatsapp: null as string | null,
      facebook: null as string | null, instagram: null as string | null, youtube: null as string | null, linkedin: null as string | null };

    if (!cnpjRaw && websiteUrl) {
      console.log(`Scraping contacts from ${websiteUrl}`);
      contacts = await websiteContactScraperService.scrape(websiteUrl);
      cnpjRaw = contacts.cnpj;
    }

    // Step 2: Fetch CNPJ data from BrasilAPI
    if (cnpjRaw) {
      console.log(`Fetching BrasilAPI data for CNPJ ${cnpjRaw} (${storeName})`);
      const cnpjData = await brasilApiService.fetchCnpj(cnpjRaw);

      if (cnpjData) {
        // Step 3: Upsert partners (QSA)
        for (const socio of cnpjData.qsa ?? []) {
          await prisma.storePartner.upsert({
            where: { storeId_nome: { storeId, nome: socio.nome_socio } },
            update: {
              cpfMascarado: socio.cnpj_cpf_do_socio || null,
              qualificacao: socio.qualificacao_socio || null,
            },
            create: {
              storeId,
              nome: socio.nome_socio,
              cpfMascarado: socio.cnpj_cpf_do_socio || null,
              qualificacao: socio.qualificacao_socio || null,
            },
          });
        }

        // Step 4: Update store with CNPJ data + contacts
        await prisma.store.update({
          where: { id: storeId },
          data: {
            cnpj: cnpjRaw,
            razaoSocial: cnpjData.razao_social || null,
            nomeFantasia: cnpjData.nome_fantasia || null,
            dataAbertura: cnpjData.data_inicio_atividade ? new Date(cnpjData.data_inicio_atividade) : null,
            porte: cnpjData.porte || null,
            capitalSocial: cnpjData.capital_social || null,
            situacaoCadastral: cnpjData.descricao_situacao_cadastral || null,
            cnaeCode: cnpjData.cnae_fiscal ? String(cnpjData.cnae_fiscal) : null,
            cnaeDescricao: cnpjData.cnae_fiscal_descricao || null,
            emailReceita: cnpjData.email || null,
            telefoneReceita: cnpjData.ddd_telefone_1 || null,
            enderecoLogradouro: cnpjData.logradouro || null,
            enderecoNumero: cnpjData.numero || null,
            enderecoBairro: cnpjData.bairro || null,
            enderecoCep: cnpjData.cep || null,
            cnpjEnrichedAt: new Date(),
            // Contacts from scraping
            email: contacts.email,
            whatsapp: contacts.whatsapp,
            facebook: contacts.facebook,
            instagram: contacts.instagram,
            youtube: contacts.youtube,
            linkedin: contacts.linkedin,
            contactScrapedAt: websiteUrl ? new Date() : null,
          },
        });

        console.log(`Enriched store ${storeName}: ${cnpjData.razao_social}, ${cnpjData.qsa?.length ?? 0} partners`);
        return;
      }
    }

    // No CNPJ found — still save contacts if we scraped them
    if (websiteUrl && (contacts.email || contacts.whatsapp || contacts.facebook || contacts.instagram)) {
      await prisma.store.update({
        where: { id: storeId },
        data: {
          email: contacts.email,
          whatsapp: contacts.whatsapp,
          facebook: contacts.facebook,
          instagram: contacts.instagram,
          youtube: contacts.youtube,
          linkedin: contacts.linkedin,
          contactScrapedAt: new Date(),
        },
      });
      console.log(`Saved contacts for ${storeName} (no CNPJ found)`);
    } else {
      console.log(`No data found for ${storeName}`);
    }
  }
}

export const cnpjEnrichmentWorker = new CnpjEnrichmentWorker();

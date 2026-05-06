import { Worker } from 'bullmq';
import redis from '../config/redis';
import prisma from '../utils/prisma';
import axios from 'axios';

interface ProviderPattern {
  name: string;
  slug: string;
  patterns: string[];
}

const PROVIDER_PATTERNS: ProviderPattern[] = [
  {
    name: 'AutoForce',
    slug: 'autoforce',
    patterns: ['site.autoforce.com', 'autoforce.com']
  },
  {
    name: 'MicroWork',
    slug: 'microwork',
    patterns: ['microwork.inf.br']
  },
  {
    name: 'Syonet',
    slug: 'syonet',
    patterns: ['leadforce.com.br', 'syonet.com']
  },
  {
    name: 'DealerSpace',
    slug: 'dealerspace',
    patterns: ['dealerspace.ai']
  },
  {
    name: 'Alpes One',
    slug: 'alpesone',
    patterns: ['alpes.one']
  },
  {
    name: 'Autoveiculos',
    slug: 'autoveiculos',
    patterns: ['autoveiculos.com', 'autoveiculo.com']
  },
  {
    name: 'Webmotors',
    slug: 'webmotors',
    patterns: ['webmotors.com.br']
  },
  {
    name: 'Revvo',
    slug: 'revvotech',
    patterns: ['revvotech.com.br']
  },
  {
    name: 'WordPress',
    slug: 'wordpress',
    patterns: ['/wp-content/', '/wp-includes/', 'wp-json', 'wordpress.org']
  },
  {
    name: 'Shopify',
    slug: 'shopify',
    patterns: ['cdn.shopify.com', 'shopify.com/s/files', 'Shopify.theme']
  },
  {
    name: 'Wix',
    slug: 'wix',
    patterns: ['static.wixstatic.com', 'wix.com/corvid']
  }
];

export class WebsiteProviderWorker {
  private worker: Worker;

  constructor() {
    this.worker = new Worker('websiteProvider', this.processJob.bind(this), {
      connection: redis,
      concurrency: 3,
    });

    this.worker.on('completed', (job) => {
      console.log(`WebsiteProvider job ${job.id} completed successfully`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`WebsiteProvider job ${job?.id} failed:`, err);
    });

    this.worker.on('error', (error) => {
      console.error('WebsiteProvider worker error:', error);
    });
  }

  private async processJob(job: any) {
    const { websiteId, url } = job.data;
    
    console.log(`Processing website provider classification for: ${url}`);

    try {
      const website = await prisma.website.findUnique({
        where: { id: websiteId },
        include: { provider: true }
      });

      if (!website) {
        console.log(`Website ${websiteId} not found, skipping`);
        return;
      }

      if (website.providerId) {
        console.log(`Website ${url} already has provider: ${website.provider?.name}`);
        return;
      }

      const htmlContent = await this.fetchWebsiteHTML(url);
      
      if (!htmlContent) {
        console.log(`Could not fetch HTML for: ${url}`);
        return;
      }

      let detectedProvider = this.classifyProvider(htmlContent);
      
      if (!detectedProvider) {
        detectedProvider = {
          name: 'Desconhecido',
          slug: 'desconhecido',
          patterns: []
        };
        console.log(`No provider patterns detected for: ${url}, using 'Desconhecido'`);
      } else {
        console.log(`Detected provider ${detectedProvider.name} for website: ${url}`);
      }
      
      let provider = await prisma.websiteProvider.findUnique({
        where: { slug: detectedProvider.slug }
      });

      if (!provider) {
        provider = await prisma.websiteProvider.create({
          data: {
            name: detectedProvider.name,
            slug: detectedProvider.slug
          }
        });
        console.log(`Created new provider: ${detectedProvider.name}`);
      }

      await prisma.website.update({
        where: { id: websiteId },
        data: { providerId: provider.id }
      });

      console.log(`Successfully associated ${url} with provider ${detectedProvider.name}`);

    } catch (error) {
      console.error('Website provider classification error:', error);
      throw error;
    }
  }

  private async fetchWebsiteHTML(url: string): Promise<string | null> {
    try {
      const normalizedUrl = url.startsWith('http') ? url : `https://${url}`;
      
      const response = await axios.get(normalizedUrl, {
        timeout: 10000,
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'pt-BR,pt;q=0.8,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate'
        },
        maxRedirects: 5,
        validateStatus: (status) => status < 400
      });

      return response.data;
    } catch (error) {
      console.error(`Error fetching HTML for ${url}:`, error);
      
      if (url.startsWith('https://')) {
        try {
          const httpUrl = url.replace('https://', 'http://');
          const response = await axios.get(httpUrl, {
            timeout: 10000,
            maxRedirects: 5,
            validateStatus: (status) => status < 400
          });
          return response.data;
        } catch (httpError) {
          console.error(`HTTP fallback also failed for ${url}`);
        }
      }
      
      return null;
    }
  }

  private classifyProvider(htmlContent: string): ProviderPattern | null {
    const lowerCaseContent = htmlContent.toLowerCase();
    
    for (const provider of PROVIDER_PATTERNS) {
      for (const pattern of provider.patterns) {
        if (lowerCaseContent.includes(pattern.toLowerCase())) {
          return provider;
        }
      }
    }
    
    return null;
  }

  async close() {
    await this.worker.close();
  }
}

export const websiteProviderWorker = new WebsiteProviderWorker();

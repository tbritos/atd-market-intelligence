import { Queue, Worker } from 'bullmq';
import redis from './redis';

export interface SearchSitesJobData {
  brandId: string;
  stateId: string;
  searchJobId: string;
}

export interface WebsiteProviderJobData {
  websiteId: string;
  url: string;
  brandId: string;
}

export interface UptimeMonitorJobData {
  websiteId: string;
  url: string;
}

export interface PerformanceCollectorJobData {
  websiteId: string;
  url: string;
}

export interface TrafficCollectionJobData {
  websiteId: string;
  url: string;
}

export interface CnpjEnrichmentJobData {
  storeId: string;
  websiteUrl: string | null;
  storeName: string;
  cnpj?: string | null; // se já tiver o CNPJ, pula o scraping
}

export interface DealerDiscoveryJobData {
  brandId: string;
  stateId: string;
  sources: ('google_places' | 'cnae' | 'brand_site')[];
}

export interface WebsiteEnrichmentJobData {
  storeId: string;
  storeName: string;
  brandId: string;
  cityName: string | null;
}

export interface LeadEnrichmentJobData {
  leadId: string;
  empresa: string;
}

export const searchSitesQueue = new Queue('searchSites', {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 10,
    removeOnFail: 10,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  }
});

export const websiteProviderQueue = new Queue('websiteProvider', {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 10,
    removeOnFail: 10,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
  }
});

export const uptimeMonitorQueue = new Queue('uptimeMonitor', {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 50,
    removeOnFail: 20,
    attempts: 2,
    backoff: {
      type: 'exponential',
      delay: 500,
    },
  }
});

export const performanceCollectorQueue = new Queue('performanceCollector', {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 20,
    removeOnFail: 50,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  }
});

export const trafficCollectionQueue = new Queue('trafficCollection', {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 20,
    removeOnFail: 50,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  }
});

searchSitesQueue.on('error', (error) => {
  console.error('Search sites queue error:', error);
});

websiteProviderQueue.on('error', (error) => {
  console.error('Website provider queue error:', error);
});

uptimeMonitorQueue.on('error', (error) => {
  console.error('Uptime monitor queue error:', error);
});

performanceCollectorQueue.on('error', (error) => {
  console.error('Performance collector queue error:', error);
});

export const cnpjEnrichmentQueue = new Queue('cnpjEnrichment', {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 20,
    removeOnFail: 50,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 3000,
    },
  }
});

trafficCollectionQueue.on('error', (error) => {
  console.error('Traffic collection queue error:', error);
});

cnpjEnrichmentQueue.on('error', (error) => {
  console.error('CNPJ enrichment queue error:', error);
});

export const dealerDiscoveryQueue = new Queue('dealerDiscovery', {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 20,
    removeOnFail: 50,
    attempts: 2,
    backoff: { type: 'exponential', delay: 5000 },
  },
});

dealerDiscoveryQueue.on('error', (error) => {
  console.error('Dealer discovery queue error:', error);
});

export const websiteEnrichmentQueue = new Queue('websiteEnrichment', {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 20,
    removeOnFail: 50,
    attempts: 2,
    backoff: { type: 'exponential', delay: 5000 },
  },
});

websiteEnrichmentQueue.on('error', (error) => {
  console.error('Website enrichment queue error:', error);
});

export const leadEnrichmentQueue = new Queue('leadEnrichment', {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 50,
    removeOnFail: 100,
    attempts: 2,
    backoff: { type: 'exponential', delay: 5000 },
  },
});

leadEnrichmentQueue.on('error', (error) => {
  console.error('Lead enrichment queue error:', error);
});

export const storeEnrichmentQueue = new Queue('storeEnrichment', {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 200,
    attempts: 2,
    backoff: { type: 'exponential', delay: 8000 },
  },
});

storeEnrichmentQueue.on('error', (error) => {
  console.error('Store enrichment queue error:', error);
});

export { Worker };
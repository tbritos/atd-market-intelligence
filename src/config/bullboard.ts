import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import basicAuth from 'express-basic-auth';
import {
  searchSitesQueue,
  websiteProviderQueue,
  uptimeMonitorQueue,
  performanceCollectorQueue,
  cnpjEnrichmentQueue,
  dealerDiscoveryQueue,
  trafficCollectionQueue,
  websiteEnrichmentQueue,
} from './queue';

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [
    new BullMQAdapter(searchSitesQueue),
    new BullMQAdapter(websiteProviderQueue),
    new BullMQAdapter(uptimeMonitorQueue),
    new BullMQAdapter(performanceCollectorQueue),
    new BullMQAdapter(cnpjEnrichmentQueue),
    new BullMQAdapter(dealerDiscoveryQueue),
    new BullMQAdapter(trafficCollectionQueue),
    new BullMQAdapter(websiteEnrichmentQueue),
  ],
  serverAdapter: serverAdapter,
});

const bullBoardAuth = basicAuth({
  users: {
    [process.env.BULLBOARD_USERNAME || 'admin']: process.env.BULLBOARD_PASSWORD || 'admin123'
  },
  challenge: true,
  realm: 'BullBoard Admin Panel',
});

export { serverAdapter, bullBoardAuth };
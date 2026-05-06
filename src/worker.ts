import dotenv from "dotenv";
dotenv.config();

import "./workers/searchSitesWorker";
import "./workers/websiteProviderWorker";
import "./workers/trafficCollectionWorker";
import "./workers/uptimeMonitorWorker";
import "./workers/uptimeSchedulerWorker";
import "./workers/performanceCollectorWorker";
import "./workers/metricsAggregationWorker";
import "./workers/cnpjEnrichmentWorker";
import "./workers/dealerDiscoveryWorker";
import "./workers/websiteEnrichmentWorker";
import "./workers/leadEnrichmentWorker";
import "./workers/storeEnrichmentWorker";

process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down workers...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down workers...');
  process.exit(0);
});

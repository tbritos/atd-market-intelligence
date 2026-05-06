import { BaseAggregator } from './base-aggregator.interface';
import { WebsiteAggregator } from './website-aggregator.service';
import { WebsiteProviderAggregator } from './website-provider-aggregator.service';

export class MetricsOrchestratorService {
  private aggregators: BaseAggregator[] = [];

  constructor() {
    this.initializeAggregators();
  }

  private initializeAggregators(): void {
    this.aggregators = [
      new WebsiteAggregator(),
      new WebsiteProviderAggregator()
    ];
  }

  async aggregateAll(): Promise<void> {
    console.log(`📊 Starting aggregation for ${this.aggregators.length} aggregators...`);
    
    for (const aggregator of this.aggregators) {
      try {
        await aggregator.aggregate();
      } catch (error) {
        console.error(`❌ Error in aggregator ${aggregator.constructor.name}:`, error);
        throw error;
      }
    }

    console.log('✅ All aggregators completed successfully');
  }

  addAggregator(aggregator: BaseAggregator): void {
    this.aggregators.push(aggregator);
  }
}

export const metricsOrchestrator = new MetricsOrchestratorService();
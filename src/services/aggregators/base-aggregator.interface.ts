export interface BaseAggregator {
  aggregate(): Promise<void>;
}

export interface MetricConfig {
  source: string;
  target: string;
  aggregationType: 'avg' | 'sum' | 'count';
}
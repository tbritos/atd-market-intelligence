export interface PageSpeedInsightsData {
  performanceScore: number | null;
  seoScore: number | null;
  url: string;
  strategy: 'mobile';
  error?: string;
}

export interface PageSpeedApiResponse {
  lighthouseResult?: {
    categories?: {
      performance?: {
        score: number;
      };
      seo?: {
        score: number;
      };
    };
  };
  error?: {
    message: string;
  };
}
import axios from 'axios';
import { PageSpeedInsightsData, PageSpeedApiResponse } from '../../types/pagespeed.types';
import { buildPageSpeedQuery } from '../../utils/pagesepeed-query-builder';

export class PageSpeedInsightsService {
  private apiKey: string;

  constructor() {
    const apiKey = process.env.PAGESPEED_API_KEY;

    if (!apiKey) throw new Error('PAGESPEED_API_KEY environment variable is required');

    this.apiKey = apiKey;
  }

  async analyzeWebsite(url: string): Promise<PageSpeedInsightsData> {
    try {
      const queryUrl = buildPageSpeedQuery({
        url,
        apiKey: this.apiKey,
        strategy: 'mobile',
        categories: ['performance', 'seo'],
        locale: 'pt_BR'
      });

      const response = await axios.get<PageSpeedApiResponse>(queryUrl, {
        timeout: 60000, // 60 seconds
      });

      const lighthouseResult = response.data.lighthouseResult;

      if (!lighthouseResult) {
        return {
          performanceScore: null,
          seoScore: null,
          url,
          strategy: 'mobile',
          error: 'No lighthouse result returned'
        };
      }

      const performanceScore = lighthouseResult.categories?.performance?.score;
      const seoScore = lighthouseResult.categories?.seo?.score;

      return {
        performanceScore: performanceScore ? Math.round(performanceScore * 100) : null,
        seoScore: seoScore ? Math.round(seoScore * 100) : null,
        url,
        strategy: 'mobile'
      };

    } catch (error) {
      console.error(`PageSpeed API error for ${url}:`, error);

      let errorMessage = 'Unknown error';
      if (axios.isAxiosError(error)) {
        if (error.response?.data?.error?.message) {
          errorMessage = error.response.data.error.message;
        } else if (error.message) {
          errorMessage = error.message;
        }
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }

      return {
        performanceScore: null,
        seoScore: null,
        url,
        strategy: 'mobile',
        error: errorMessage
      };
    }
  }

}

export const pageSpeedService = new PageSpeedInsightsService();
import axios from 'axios';
import redis from '../../config/redis';

const BLACKLIST = [
  'facebook.com', 'instagram.com', 'linkedin.com', 'twitter.com',
  'youtube.com', 'mercadolivre.com', 'webmotors.com', 'icarros.com',
  'olx.com', 'autopapo.com.br', 'autoesporte.com', 'wikipedia.org',
  'google.com', 'yelp.com', 'foursquare.com', 'tripadvisor.com',
];

const COUNTER_KEY = 'website_enrichment_api_counter';

class WebsiteSearchService {
  private serpApiKey: string | null;
  private apifyToken: string | null;

  constructor() {
    this.serpApiKey = process.env.SERP_API_KEY ?? null;
    this.apifyToken = process.env.APIFY_TOKEN ?? null;
  }

  async search(storeName: string, cityName: string | null): Promise<string | null> {
    const query = `"${storeName}" concessionária${cityName ? ` ${cityName}` : ''}`;

    // Alternates between SerpAPI and Apify to preserve free quotas
    const count = await redis.incr(COUNTER_KEY);
    const useSerp = count % 2 === 0;

    if (useSerp && this.serpApiKey) {
      const url = await this.searchViaSerpApi(query);
      if (url) return url;
    }

    if (this.apifyToken) {
      const url = await this.searchViaApify(query);
      if (url) return url;
    }

    if (!useSerp && this.serpApiKey) {
      return this.searchViaSerpApi(query);
    }

    return null;
  }

  private async searchViaSerpApi(query: string): Promise<string | null> {
    try {
      const { data } = await axios.get('https://serpapi.com/search', {
        params: {
          engine: 'google',
          q: query,
          hl: 'pt-br',
          gl: 'br',
          num: 5,
          api_key: this.serpApiKey,
        },
        timeout: 15000,
      });

      for (const result of data.organic_results ?? []) {
        const url: string = result.link ?? '';
        if (url && !this.isBlacklisted(url)) return url;
      }
    } catch (err: any) {
      console.error('[WebsiteSearch] SerpAPI error:', err.response?.data?.error ?? err.message);
    }
    return null;
  }

  private async searchViaApify(query: string): Promise<string | null> {
    try {
      const { data: run } = await axios.post(
        'https://api.apify.com/v2/acts/apify~google-search-scraper/runs',
        { queries: query, maxPagesPerQuery: 1, resultsPerPage: 5, languageCode: 'pt-br', countryCode: 'br' },
        { params: { token: this.apifyToken, memory: 256 }, timeout: 10000 }
      );

      const runId = run.data.id;
      let status = run.data.status;
      let attempts = 0;

      while (!['SUCCEEDED', 'FAILED', 'ABORTED'].includes(status) && attempts < 8) {
        await new Promise((r) => setTimeout(r, 3000));
        attempts++;
        const { data: check } = await axios.get(
          `https://api.apify.com/v2/actor-runs/${runId}`,
          { params: { token: this.apifyToken }, timeout: 10000 }
        );
        status = check.data.status;
      }

      if (status !== 'SUCCEEDED') return null;

      const { data: items } = await axios.get(
        `https://api.apify.com/v2/actor-runs/${runId}/dataset/items`,
        { params: { token: this.apifyToken, limit: 10 }, timeout: 10000 }
      );

      for (const item of items ?? []) {
        for (const result of item.organicResults ?? []) {
          const url: string = result.url ?? '';
          if (url && !this.isBlacklisted(url)) return url;
        }
      }
    } catch (err: any) {
      console.error('[WebsiteSearch] Apify error:', err.response?.data?.error?.message ?? err.message);
    }
    return null;
  }

  private isBlacklisted(url: string): boolean {
    return BLACKLIST.some((b) => url.includes(b));
  }
}

export const websiteSearchService = new WebsiteSearchService();

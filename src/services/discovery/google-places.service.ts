import axios from 'axios';

export interface PlaceResult {
  placeId: string;
  name: string;
  address: string;
  phone: string | null;
  website: string | null;
  rating: number | null;
  reviews: number | null;
  lat: number | null;
  lng: number | null;
  openingHours: { day: string; hours: string }[] | null;
  types: string[];
}

export class GooglePlacesService {
  private apifyToken: string | null;
  private serpApiKey: string | null;
  private readonly discoveryApifyEnabled: boolean;
  private readonly apifyPollAttempts: number;
  private readonly apifyPollIntervalMs: number;
  private readonly apifyMemoryMb: number;

  constructor() {
    this.apifyToken = process.env.APIFY_TOKEN ?? null;
    this.serpApiKey = process.env.SERP_API_KEY ?? null;
    this.discoveryApifyEnabled = (process.env.DISCOVERY_APIFY_ENABLED ?? 'false').toLowerCase() === 'true';
    // State-level runs take longer — allow up to 10 min (60 × 10s)
    this.apifyPollAttempts = Number(process.env.APIFY_POLL_ATTEMPTS ?? 60);
    this.apifyPollIntervalMs = Number(process.env.APIFY_POLL_INTERVAL_MS ?? 10000);
    this.apifyMemoryMb = Number(process.env.APIFY_MEMORY_MB ?? 512);
  }

  /**
   * State-level broad search — ONE Apify run for the entire state.
   * Returns all car dealers found, unfiltered by brand.
   * Caller is responsible for matching results to brands.
   */
  async searchAllDealersInState(stateName: string, maxPlaces = 300): Promise<PlaceResult[]> {
    if (!this.discoveryApifyEnabled) {
      console.warn('DISCOVERY_APIFY_ENABLED=false - skipping Google Maps state search');
      return [];
    }
    if (this.apifyToken) {
      return this.searchViaApifyState(stateName, maxPlaces);
    }
    console.warn('APIFY_TOKEN not set — skipping Google Maps state search');
    return [];
  }

  // ── Apify Google Maps Scraper — ONE run per state ───────────────────────────
  private async searchViaApifyState(stateName: string, maxPlaces: number): Promise<PlaceResult[]> {
    const queries = [
      `concessionárias automóveis ${stateName} Brasil`,
      `concessionárias carros ${stateName} Brasil`,
    ];

    try {
      const { data: run } = await axios.post(
        'https://api.apify.com/v2/acts/compass~crawler-google-places/runs',
        {
          searchStringsArray: queries,
          language: 'pt-BR',
          countryCode: 'br',
          maxCrawledPlaces: maxPlaces,
          includeWebResults: false,
        },
        {
          params: { token: this.apifyToken, memory: this.apifyMemoryMb },
          timeout: 10000,
        }
      );

      const runId = run.data.id;
      let status = run.data.status;
      let attempts = 0;

      console.log(`Apify run started: ${runId} for ${stateName} (max ${maxPlaces} places)`);

      while (!['SUCCEEDED', 'FAILED', 'ABORTED'].includes(status) && attempts < this.apifyPollAttempts) {
        await new Promise((r) => setTimeout(r, this.apifyPollIntervalMs));
        attempts++;
        const { data: check } = await axios.get(
          `https://api.apify.com/v2/actor-runs/${runId}`,
          { params: { token: this.apifyToken }, timeout: 10000 }
        );
        status = check.data.status;
        if (attempts % 6 === 0) {
          console.log(`Apify run ${runId}: still ${status} after ${attempts * this.apifyPollIntervalMs / 1000}s`);
        }
      }

      if (status !== 'SUCCEEDED') {
        if (!['FAILED', 'ABORTED'].includes(status)) {
          await this.abortApifyRun(runId);
        }
        console.error(`Apify state run ${runId} ended with status: ${status}`);
        return [];
      }

      const { data: dataset } = await axios.get(
        `https://api.apify.com/v2/actor-runs/${runId}/dataset/items`,
        { params: { token: this.apifyToken, limit: maxPlaces }, timeout: 20000 }
      );

      const results: PlaceResult[] = (dataset as any[])
        .filter((r) => !!r.title)
        .map((r) => ({
          placeId: r.placeId ?? `apify-${r.title}`,
          name: r.title,
          address: r.address ?? r.street ?? null,
          phone: r.phone ?? null,
          website: r.website ?? null,
          rating: r.totalScore ?? null,
          reviews: r.reviewsCount ?? null,
          lat: r.location?.lat ?? null,
          lng: r.location?.lng ?? null,
          openingHours: r.openingHours
            ? r.openingHours.map((h: any) => ({ day: h.day, hours: h.hours }))
            : null,
          types: ['car_dealer'],
        }));

      console.log(`Apify state search (${stateName}): ${results.length} dealers found`);
      return results;

    } catch (err: any) {
      console.error('Apify state search error:', err.response?.data?.error?.message ?? err.message);
      return [];
    }
  }

  private async abortApifyRun(runId: string): Promise<void> {
    try {
      await axios.post(
        `https://api.apify.com/v2/actor-runs/${runId}/abort`,
        undefined,
        { params: { token: this.apifyToken }, timeout: 10000 }
      );
      console.warn(`Apify run ${runId} aborted`);
    } catch (err: any) {
      console.error(`Failed to abort Apify run ${runId}:`, err.message);
    }
  }

  // ── SerpAPI — per-brand fallback (cheap, ~$0.01/search) ────────────────────
  async searchDealers(brandName: string, stateName: string): Promise<PlaceResult[]> {
    if (!this.serpApiKey) return [];
    const query = `concessionaria ${brandName} ${stateName}`;
    const results: PlaceResult[] = [];

    try {
      const { data } = await axios.get('https://serpapi.com/search', {
        params: { engine: 'google_maps', q: query, hl: 'pt-br', gl: 'br', api_key: this.serpApiKey },
        timeout: 20000,
      });

      for (const r of data.local_results ?? []) {
        if (!r.title?.toLowerCase().includes(brandName.toLowerCase())) continue;
        results.push({
          placeId: r.place_id ?? r.data_id ?? `serp-${r.title}`,
          name: r.title,
          address: r.address ?? null,
          phone: r.phone ?? null,
          website: r.website ?? null,
          rating: r.rating ?? null,
          reviews: r.reviews ?? null,
          lat: r.gps_coordinates?.latitude ?? null,
          lng: r.gps_coordinates?.longitude ?? null,
          openingHours: null,
          types: ['car_dealer'],
        });
      }
    } catch (err: any) {
      console.error('SerpAPI error:', err.message);
    }

    return results;
  }
}

export const googlePlacesService = new GooglePlacesService();

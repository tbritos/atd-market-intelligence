import { Worker, Job } from 'bullmq';
import { SearchSitesJobData, websiteProviderQueue, performanceCollectorQueue, uptimeMonitorQueue } from '../config/queue';
import redis from '../config/redis';
import prisma from '../utils/prisma';
import axios from 'axios';
import { normalizeUrl } from '../utils/url';

interface SerpApiResponse {
  local_results?: Array<{
    title: string;
    address?: string;
    phone?: string;
    website?: string;
    gps_coordinates?: {
      latitude: number;
      longitude: number;
    };
    rating?: number;
    reviews?: number;
  }>;
}

export class SearchSitesWorker {
  private worker: Worker;

  constructor() {
    this.worker = new Worker('searchSites', this.processJob.bind(this), {
      connection: redis,
      concurrency: 5,
    });

    this.worker.on('completed', (job) => {
      console.log(`Job ${job.id} completed successfully`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`Job ${job?.id} failed:`, err);
    });

    this.worker.on('error', (error) => {
      console.error('Worker error:', error);
    });
  }

  private async processJob(job: Job<SearchSitesJobData>) {
    const { brandId, stateId, searchJobId } = job.data;
    
    console.log(`Processing search job for brand ${brandId} in state ${stateId}`);

    try {
      await this.updateSearchJobStatus(searchJobId, 'RUNNING');

      const brand = await prisma.brand.findUnique({
        where: { id: brandId }
      });

      const state = await prisma.state.findUnique({
        where: { id: stateId }
      });

      if (!brand || !state) {
        throw new Error(`Brand or state not found: ${brandId}, ${stateId}`);
      }

      const query = `concessionárias ${brand.name} no ${state.name}`;
      console.log(`Searching for: ${query}`);

      const results = await this.searchSerpApi(query);
      
      console.log(`SerpAPI returned ${results?.local_results?.length || 0} results for query: ${query}`);
      
      if (results && results.local_results) {
        let processedCount = 0;

        const IRRELEVANT_DOMAINS = ['.gov.br', '.gov', '.edu.br', '.mp.br', '.trt.', '.trf.', '.jus.br', '.leg.br', '.def.br'];
        const brandNameLower = brand.name.toLowerCase();

        for (const result of results.local_results.slice(0, 100)) {
          try {
            // Only process results whose title mentions the brand name
            if (!result.title.toLowerCase().includes(brandNameLower)) {
              console.log(`Skipping irrelevant result: "${result.title}" (does not mention ${brand.name})`);
              continue;
            }

            // Filter out government/educational/public websites
            if (result.website) {
              try {
                const hostname = new URL(result.website.startsWith('http') ? result.website : `https://${result.website}`).hostname;
                if (IRRELEVANT_DOMAINS.some(d => hostname.endsWith(d) || hostname.includes(d))) {
                  console.log(`Skipping irrelevant domain: ${hostname}`);
                  result.website = undefined;
                }
              } catch { /* invalid URL, will be handled downstream */ }
            }

            const existingStore = await prisma.store.findFirst({
              where: {
                name: result.title,
                brandId,
                stateId,
              }
            });

            let cityId = null;
            if (result.address) {
              const city = await this.findOrCreateCity(result.address, stateId);
              cityId = city?.id || null;
            }

            let websiteId = null;
            if (result.website) {
              const website = await this.findOrCreateWebsite(result.website, brandId);
              websiteId = website?.id || null;
            }

            if (!existingStore) {
              const defaultGroup = await this.getOrCreateDefaultGroup();

              await prisma.store.create({
                data: {
                  name: result.title,
                  brandId,
                  groupId: defaultGroup.id,
                  stateId,
                  cityId: cityId,
                  websiteId: websiteId,
                  latitude: result.gps_coordinates?.latitude,
                  longitude: result.gps_coordinates?.longitude,
                  rating: result.rating,
                  reviews: result.reviews,
                  phone: result.phone,
                  isActive: true,
                }
              });
            } else {
              // Atualizar store existente com dados mais recentes
              await prisma.store.update({
                where: { id: existingStore.id },
                data: {
                  cityId: cityId || existingStore.cityId,
                  websiteId: websiteId || existingStore.websiteId,
                  latitude: result.gps_coordinates?.latitude || existingStore.latitude,
                  longitude: result.gps_coordinates?.longitude || existingStore.longitude,
                  rating: result.rating || existingStore.rating,
                  reviews: result.reviews || existingStore.reviews,
                  phone: result.phone || existingStore.phone,
                  isActive: true,
                }
              });
            }
            
            processedCount++;
          } catch (error) {
            console.error(`Error processing result: ${result.title}`, error);
          }
        }

        await this.updateSearchJobStatus(searchJobId, 'COMPLETED', {
          totalFound: results.local_results.length,
          totalProcessed: processedCount
        });

        console.log(`Job completed: Found ${results.local_results.length}, Processed/Updated ${processedCount} stores`);
      } else {
        await this.updateSearchJobStatus(searchJobId, 'COMPLETED', {
          totalFound: 0,
          totalProcessed: 0
        });
      }

    } catch (error) {
      console.error('Job processing error:', error);
      
      await this.updateSearchJobStatus(searchJobId, 'FAILED', {
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      });
      
      throw error;
    }
  }

  private async searchSerpApi(query: string): Promise<SerpApiResponse> {
    const apiKey = process.env.SERP_API_KEY;
    
    if (!apiKey) {
      throw new Error('SERP_API_KEY environment variable is not set');
    }

    const params = {
      engine: 'google_maps',
      q: query,
      hl: 'pt-br',
      gl: 'br',
      num: 100,
      api_key: apiKey,
    };

    const response = await axios.get('https://serpapi.com/search', { params });
    
    // Debug log para verificar a estrutura da resposta
    console.log('SerpAPI response keys:', Object.keys(response.data));
    if (response.data.local_results) {
      console.log(`Local results count: ${response.data.local_results.length}`);
    }
    if (response.data.search_metadata) {
      console.log('Search metadata:', JSON.stringify(response.data.search_metadata, null, 2));
    }
    
    return response.data;
  }

  private async updateSearchJobStatus(
    jobId: string, 
    status: 'RUNNING' | 'COMPLETED' | 'FAILED',
    data?: { 
      totalFound?: number; 
      totalProcessed?: number; 
      errorMessage?: string; 
    }
  ) {
    const updateData: any = {
      status,
      ...(status === 'RUNNING' && { startedAt: new Date() }),
      ...(status === 'COMPLETED' && { completedAt: new Date() }),
      ...data
    };

    await prisma.searchJob.update({
      where: { id: jobId },
      data: updateData
    });
  }

  private async findOrCreateCity(address: string, stateId: string) {
    const addressParts = address.split(',');
    if (addressParts.length < 2) return null;

    const cityName = addressParts[addressParts.length - 2].trim();
    
    let city = await prisma.city.findFirst({
      where: {
        name: {
          contains: cityName,
          mode: 'insensitive'
        },
        stateId
      }
    });

    if (!city) {
      try {
        city = await prisma.city.create({
          data: {
            ibgeCode: Math.floor(Math.random() * 9999999) + 1000000,
            name: cityName,
            stateId,
            isCapital: false,
          }
        });
      } catch (error) {
        console.error('Error creating city:', error);
        return null;
      }
    }

    return city;
  }

  private async getOrCreateDefaultGroup() {
    let group = await prisma.group.findFirst({
      where: { slug: 'default' }
    });

    if (!group) {
      group = await prisma.group.create({
        data: {
          name: 'Default Group',
          slug: 'default',
          description: 'Default group for stores without specific group',
          isActive: true,
        }
      });
    }

    return group;
  }

  private async findOrCreateWebsite(websiteUrl: string, brandId: string) {
    try {
      const cleanUrl = normalizeUrl(websiteUrl);

      let website = await prisma.website.findFirst({
        where: {
          url: cleanUrl
        }
      });

      if (!website) {
        website = await prisma.website.create({
          data: {
            url: cleanUrl,
            brandId,
            isActive: true,
          }
        });

        const delay = Math.floor(Math.random() * 3000) + 1000;

        await websiteProviderQueue.add('classifyProvider', { websiteId: website.id, url: cleanUrl, brandId }, { delay });
        await performanceCollectorQueue.add('collectPerformance', { websiteId: website.id, url: cleanUrl }, { delay });
        await uptimeMonitorQueue.add('checkUptime', { websiteId: website.id, url: cleanUrl }, { delay });

        console.log(`Queued provider/performance/uptime jobs for website: ${cleanUrl}`);
      }

      return website;
    } catch (error) {
      console.error('Error creating website:', error);
      return null;
    }
  }

  async close() {
    await this.worker.close();
  }
}

export const searchSitesWorker = new SearchSitesWorker();
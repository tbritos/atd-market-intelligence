import fs from 'fs/promises';
import path from 'path';
import { GroupEnrichmentPlan } from './group-enrichment-planner.service';

export type PipedriveGroupCacheEntry = {
  domain: string;
  websiteUrl: string;
  bucket: 'priority' | 'review' | 'single' | 'generic';
  stores: number;
  states: string[];
  pipedrive: {
    matchedTerm: string | null;
    orgId: number | null;
    orgName: string | null;
    website: string | null;
    city: string | null;
    status: 'not_found' | 'lead' | 'deal_ativo' | 'cliente';
    isCliente: boolean;
    dealStage: string | null;
    dealId: number | null;
    responsavel: string | null;
    deals: { id: number; title: string; stage: string; status: 'open' | 'won' | 'lost'; ownerName: string | null }[];
      persons: { id: number; name: string; email: string | null; phone: string | null; jobTitle: string | null }[];
  };
  enrichment: GroupEnrichmentPlan;
  checkedAt: string;
};

class PipedriveGroupCacheService {
  private baseDir = path.resolve(process.cwd(), 'src', 'data', 'pipedrive-group-cache');

  private filePath(brandId: string) {
    return path.join(this.baseDir, `${brandId}.json`);
  }

  async read(brandId: string): Promise<Record<string, PipedriveGroupCacheEntry>> {
    try {
      const raw = await fs.readFile(this.filePath(brandId), 'utf8');
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  async write(brandId: string, data: Record<string, PipedriveGroupCacheEntry>) {
    await fs.mkdir(this.baseDir, { recursive: true });
    await fs.writeFile(this.filePath(brandId), JSON.stringify(data, null, 2), 'utf8');
  }

  async merge(brandId: string, entries: PipedriveGroupCacheEntry[]) {
    const current = await this.read(brandId);
    for (const entry of entries) {
      current[entry.domain] = entry;
    }
    await this.write(brandId, current);
    return current;
  }
}

export const pipedriveGroupCacheService = new PipedriveGroupCacheService();

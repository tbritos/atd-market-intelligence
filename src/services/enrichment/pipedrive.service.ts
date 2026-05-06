import axios from 'axios';

const PIPEDRIVE_API_KEY = process.env.PIPEDRIVE_API_KEY ?? null;
const PIPEDRIVE_DOMAIN = process.env.PIPEDRIVE_DOMAIN ?? null;

export interface PipedriveDeal {
  id: number;
  title: string;
  stage: string;
  status: 'open' | 'won' | 'lost';
  ownerName: string | null;
}

export interface PipedrivePerson {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
}

export interface PipedriveOrgResult {
  orgId: number | null;
  orgName: string | null;
  phone: string | null;
  website: string | null;
  city: string | null;
  deals: PipedriveDeal[];
  persons: PipedrivePerson[];
  status: 'not_found' | 'found';
}

export interface PipedriveLeadStatus {
  status: 'not_found' | 'lead' | 'deal_ativo' | 'cliente';
  isCliente: boolean;
  dealStage: string | null;
  dealId: number | null;
  responsavel: string | null;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class PipedriveService {
  private apiKey: string | null;
  private baseUrl: string | null;

  constructor() {
    this.apiKey = PIPEDRIVE_API_KEY;
    this.baseUrl = PIPEDRIVE_DOMAIN
      ? `https://${PIPEDRIVE_DOMAIN}.pipedrive.com/api/v1`
      : null;
  }

  isConfigured(): boolean {
    return !!(this.apiKey && this.baseUrl);
  }

  async searchOrganization(companyName: string): Promise<PipedriveOrgResult> {
    const empty: PipedriveOrgResult = {
      orgId: null, orgName: null, phone: null, website: null,
      city: null, deals: [], persons: [], status: 'not_found',
    };

    if (!this.isConfigured()) return empty;

    try {
      const searchResp = await axios.get(`${this.baseUrl}/organizations/search`, {
        params: { term: companyName, api_token: this.apiKey, limit: 5, fields: 'name' },
        timeout: 10000,
      });

      const items: any[] = searchResp.data?.data?.items ?? [];
      if (items.length === 0) return empty;

      const orgId: number = items[0].item.id;

      await sleep(200);

      const [orgResp, dealsResp, personsResp] = await Promise.all([
        axios.get(`${this.baseUrl}/organizations/${orgId}`, {
          params: { api_token: this.apiKey },
          timeout: 10000,
        }),
        axios.get(`${this.baseUrl}/organizations/${orgId}/deals`, {
          params: { api_token: this.apiKey, status: 'all_not_deleted', limit: 10 },
          timeout: 10000,
        }),
        axios.get(`${this.baseUrl}/organizations/${orgId}/persons`, {
          params: { api_token: this.apiKey, limit: 10 },
          timeout: 10000,
        }),
      ]);

      const orgData = orgResp.data?.data ?? {};
      const dealsData: any[] = dealsResp.data?.data ?? [];
      const personsData: any[] = personsResp.data?.data ?? [];

      const deals: PipedriveDeal[] = dealsData.map(d => ({
        id: d.id,
        title: d.title,
        stage: d.stage_name ?? String(d.stage_id ?? ''),
        status: d.status,
        ownerName: d.owner_name ?? null,
      }));

      const persons: PipedrivePerson[] = personsData.map(p => ({
        id: p.id,
        name: p.name,
        email: p.email?.[0]?.value ?? null,
        phone: p.phone?.[0]?.value ?? null,
        jobTitle: p.job_title ?? null,
      }));

      return {
        orgId,
        orgName: orgData.name ?? null,
        phone: orgData.phone?.[0]?.value ?? null,
        website: orgData.web ?? null,
        city: orgData.address_locality ?? null,
        deals,
        persons,
        status: 'found',
      };
    } catch (err: any) {
      console.error('[Pipedrive] Search error:', err?.response?.data ?? err?.message);
      throw err;
    }
  }

  determineLeadStatus(result: PipedriveOrgResult): PipedriveLeadStatus {
    if (result.status === 'not_found') {
      return { status: 'not_found', isCliente: false, dealStage: null, dealId: null, responsavel: null };
    }

    const wonDeal = result.deals.find(d => d.status === 'won');
    if (wonDeal) {
      return {
        status: 'cliente',
        isCliente: true,
        dealStage: wonDeal.stage,
        dealId: wonDeal.id,
        responsavel: wonDeal.ownerName,
      };
    }

    const openDeal = result.deals.find(d => d.status === 'open');
    if (openDeal) {
      return {
        status: 'deal_ativo',
        isCliente: false,
        dealStage: openDeal.stage,
        dealId: openDeal.id,
        responsavel: openDeal.ownerName,
      };
    }

    return { status: 'lead', isCliente: false, dealStage: null, dealId: null, responsavel: null };
  }

  async searchBestOrganization(terms: string[]): Promise<(PipedriveOrgResult & { matchedTerm: string | null })> {
    const normalizedTerms = [...new Set(
      terms
        .map((term) => term.trim())
        .filter((term) => term.length >= 3)
    )];

    for (const term of normalizedTerms) {
      const result = await this.searchOrganization(term);
      if (result.status === 'found') {
        return { ...result, matchedTerm: term };
      }
    }

    return {
      orgId: null,
      orgName: null,
      phone: null,
      website: null,
      city: null,
      deals: [],
      persons: [],
      status: 'not_found',
      matchedTerm: null,
    };
  }
}

export const pipedriveService = new PipedriveService();

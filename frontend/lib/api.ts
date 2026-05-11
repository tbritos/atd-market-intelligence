import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000',
  headers: { 'Content-Type': 'application/json' },
});

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: PaginationMeta;
}

export interface Brand {
  id: string;
  name: string;
  slug: string;
  avgPerformanceScore: number | null;
  avgSeoScore: number | null;
  avgResponseTime: number | null;
  totalWebsites: number | null;
  activeWebsites: number | null;
  metricsUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  counts?: { websites: number; stores: number; searchJobs: number } | null;
}

export interface BrandGroupPipedriveCheck {
  domain: string;
  websiteUrl: string;
  bucket: 'priority' | 'review' | 'single' | 'generic';
  stores: number;
  states: string[];
  saved: {
    dealerGroupId: string;
    readyForSdr: boolean;
    apolloStatus: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'SKIPPED';
    hunterStatus: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'SKIPPED';
    contacts: {
      id: string;
      source: 'PIPEDRIVE' | 'APOLLO' | 'HUNTER' | 'WEBSITE' | 'MANUAL';
      fullName: string | null;
      title: string | null;
      email: string | null;
      emailConfidence: number | null;
      phone: string | null;
      linkedinUrl: string | null;
      isDecisionMaker: boolean;
      isPrimary: boolean;
    }[];
  } | null;
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
  enrichment: {
    queue: 'blocked_crm' | 'apollo_ready' | 'hunter_fallback' | 'review';
    priorityScore: number;
    confidence: 'high' | 'medium' | 'low';
    reasons: string[];
    apollo: {
      shouldEnrich: boolean;
      mode: 'domain_enrich' | 'org_search' | 'mixed' | 'skip';
      domain: string | null;
      orgQueryTerms: string[];
      peopleQueryTerms: string[];
      titleHints: string[];
    };
    hunter: {
      shouldEnrich: boolean;
      mode: 'domain_search' | 'email_finder' | 'skip';
      domain: string | null;
      emailFinderCandidates: string[];
    };
  };
  checkedAt: string;
}

export interface Website {
  id: string;
  url: string;
  brandId: string;
  providerId: string | null;
  isActive: boolean;
  avgPerformanceScore: number | null;
  avgMonthlyVisits: number | null;
  avgResponseTime: number | null;
  downtimeSeconds: number | null;
  seoScore: number | null;
  trafficDirect: number | null;
  trafficSearch: number | null;
  trafficSocial: number | null;
  trafficReferrals: number | null;
  createdAt: string;
  updatedAt: string;
  brand?: Brand;
  provider?: Provider;
}

export interface StorePartner {
  id: string;
  nome: string;
  cpfMascarado: string | null;
  qualificacao: string | null;
  email: string | null;
  linkedinUrl: string | null;
}

export interface Store {
  id: string;
  name: string;
  brandId: string;
  groupId: string;
  stateId: string;
  cityId: string | null;
  websiteId: string | null;
  latitude: number | null;
  longitude: number | null;
  rating: number | null;
  reviews: number | null;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
  // CNPJ
  cnpj: string | null;
  razaoSocial: string | null;
  nomeFantasia: string | null;
  dataAbertura: string | null;
  porte: string | null;
  capitalSocial: number | null;
  situacaoCadastral: string | null;
  cnaeCode: string | null;
  cnaeDescricao: string | null;
  emailReceita: string | null;
  telefoneReceita: string | null;
  enderecoLogradouro: string | null;
  enderecoNumero: string | null;
  enderecoBairro: string | null;
  enderecoCep: string | null;
  cnpjEnrichedAt: string | null;
  tipo: string | null;
  discoverySource: string | null;
  // Validação do site
  siteUp: boolean | null;
  siteNameOk: boolean | null;
  siteCheckedAt: string | null;
  // Contatos scraping
  whatsapp: string | null;
  email: string | null;
  facebook: string | null;
  instagram: string | null;
  youtube: string | null;
  linkedin: string | null;
  // Relations
  brand?: Brand;
  group?: { id: string; name: string; slug: string };
  state?: { id: string; name: string; code: string };
  city?: { id: string; name: string } | null;
  website?: {
    id: string; url: string; isActive: boolean;
    avgPerformanceScore: number | null; seoScore: number | null;
    avgResponseTime: number | null; downtimeSeconds: number | null;
    provider?: { name: string } | null;
  } | null;
  partners?: StorePartner[];
}

export interface DealerGroup {
  id: string;
  brandId: string;
  domain: string;
  websiteUrl: string | null;
  providerName: string | null;
  bucket: string | null;
  storeCount: number;
  storesWithPhone: number;
  crmStatus: string;
  crmOrgName: string | null;
  crmOrgWebsite: string | null;
  crmCity: string | null;
  crmDealStage: string | null;
  crmOwnerName: string | null;
  priorityScore: number;
  readyForSdr: boolean;
  createdAt: string;
  brand?: Brand;
  stores?: Store[];
  contacts?: DealerGroupContact[];
  _count?: { stores: number; contacts: number };
}

export interface DealerGroupContact {
  id: string;
  fullName: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  isDecisionMaker: boolean;
  isPrimary: boolean;
}

export interface DealerGroupStats {
  total: number;
  clientes: number;
  priorityA: number;
  readyForSdr: number;
}

export interface Provider {
  id: string;
  name: string;
  slug: string;
  avgPerformanceScore: number | null;
  avgSeoScore: number | null;
  avgDowntimeSeconds: number | null;
  createdAt: string;
  updatedAt: string;
  _count?: { websites: number };
}

export interface GlobalStats {
  websites: number;
  stores: number;
  providers: number;
  avgPerformanceScore: number | null;
  avgSeoScore: number | null;
  avgResponseTime: number | null;
  avgMonthlyVisits: number | null;
}

interface GlobalStatsResponse {
  metrics: GlobalStats;
  filters: { includeInactive: boolean };
  lastUpdated: string;
}

export interface WebsiteDetail extends Website {
  brand: { id: string; name: string; slug: string } | null;
  provider: { id: string; name: string; slug: string } | null;
  stores: {
    id: string;
    name: string;
    isActive: boolean;
    city: { name: string } | null;
    state: { code: string } | null;
    brand: { id: string; name: string } | null;
    dealerGroup: { id: string; name: string } | null;
  }[];
  uptimePercentage: number | null;
  problems: string[];
  totalUptimeChecks: number;
}

// ─── API calls ───────────────────────────────────────────────────────────────

export async function fetchGlobalStats(includeInactive = false): Promise<GlobalStats> {
  const { data } = await api.get<ApiResponse<GlobalStatsResponse>>('/dashboard/global-stats', {
    params: { includeInactive },
  });
  return data.data.metrics;
}

export async function fetchWebsite(id: string): Promise<WebsiteDetail> {
  const { data } = await api.get<{ success: boolean; data: WebsiteDetail }>(`/websites/${id}`);
  return data.data;
}

export async function fetchBrands(params: {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  hasMetrics?: boolean;
}): Promise<{ data: Brand[]; meta: PaginationMeta }> {
  const { data } = await api.get<ApiResponse<Brand[]>>('/brands', { params });
  return { data: data.data, meta: data.meta! };
}

export async function fetchBrandGroupsPipedrive(
  brandId: string,
  params?: { limit?: number; bucket?: 'all' | 'priority' | 'review' | 'single' | 'generic'; refresh?: boolean }
): Promise<{
  brand: { id: string; name: string; slug: string };
  checked: number;
  limit: number;
  bucket: string;
  data: BrandGroupPipedriveCheck[];
}> {
  const { data } = await api.get<ApiResponse<{
    brand: { id: string; name: string; slug: string };
    checked: number;
    limit: number;
    bucket: string;
    data: BrandGroupPipedriveCheck[];
  }>>(`/brands/${brandId}/pipedrive-groups`, { params });
  return data.data;
}

export async function fetchWebsites(params: {
  page?: number;
  limit?: number;
  brandId?: string;
  providerId?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}): Promise<{ data: Website[]; meta: PaginationMeta }> {
  const { data } = await api.get<ApiResponse<Website[]>>('/websites', { params });
  return { data: data.data, meta: data.meta! };
}

export async function fetchStores(params: {
  page?: number;
  limit?: number;
  brandId?: string;
  stateId?: string;
  cityId?: string;
  groupId?: string;
  isActive?: boolean;
  all?: boolean;
  search?: string;
  cnaeCode?: string;
  uf?: string;
  situacaoCadastral?: string;
  hasCnpj?: boolean;
  hasWebsite?: boolean;
  onlyQualified?: boolean;
  tipo?: string;
  discoverySource?: string;
}): Promise<{ data: Store[]; meta: PaginationMeta }> {
  const { data } = await api.get<ApiResponse<Store[]>>('/stores', { params });
  return { data: data.data, meta: data.meta! };
}

export async function fetchProviders(params: {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}): Promise<{ data: Provider[]; meta: PaginationMeta }> {
  const { data } = await api.get<ApiResponse<Provider[]>>('/providers', { params });
  return { data: data.data, meta: data.meta! };
}

export async function fetchStore(id: string): Promise<Store> {
  const { data } = await api.get<ApiResponse<Store>>(`/stores/${id}`);
  return data.data;
}

export async function enqueueBulkEnrichment(cnaeCode?: string): Promise<{ queued: number; total: number }> {
  const { data } = await api.post('/stores/enrich-bulk', undefined, {
    params: cnaeCode ? { cnaeCode } : undefined,
  });
  return data;
}

export async function fetchCnaes(): Promise<{ code: string; descricao: string; total: number }[]> {
  const { data } = await api.get<ApiResponse<{ code: string; descricao: string; total: number }[]>>('/stores/cnaes');
  return data.data;
}

export async function enrichStore(id: string): Promise<{ queued: boolean }> {
  const { data } = await api.post(`/stores/${id}/enrich`);
  return data;
}

export async function startSearchForBrand(brandId: string): Promise<{ jobsCreated: number; totalCombinations: number }> {
  const { data } = await api.post('/search-sites/start', { brandIds: [brandId] });
  return data.data ?? data;
}

export async function matchWebsitesFromBrandAdapters(cnaeCode?: string): Promise<{ matched: number; skipped: number; total: number }> {
  const { data } = await api.post('/stores/website-match', undefined, {
    params: cnaeCode ? { cnaeCode } : undefined,
  });
  return data;
}

export async function enqueueBulkWebsiteSearch(cnaeCode?: string): Promise<{ queued: number; total: number }> {
  const { data } = await api.post('/stores/website-search-bulk', undefined, {
    params: cnaeCode ? { cnaeCode } : undefined,
  });
  return data;
}

export interface ContactInput {
  email?: string;
  nome?: string;
  telefone?: string;
  celular?: string;
  cargo?: string;
  empresa?: string;
  site?: string;
  [key: string]: string | number | boolean | null | undefined;
}

export interface MatchedContact extends ContactInput {
  matched: boolean;
  matchMethod: string | null;
  cnpj: string | null;
  razaoSocial: string | null;
  nomeFantasia: string | null;
  capitalSocial: number | null;
  situacaoCadastral: string | null;
  cidade: string | null;
  uf: string | null;
  telefoneReceita: string | null;
  emailReceita: string | null;
  websiteEncontrado: string | null;
  provedor: string | null;
  pagespeed: number | null;
  seo: number | null;
  tempoResposta: number | null;
  visitasMensais: number | null;
  socios: string | null;
  dataAbertura: string | null;
  porte: string | null;
}

export async function createFromContacts(contacts: ContactInput[]): Promise<{
  created: number; skipped: number; enrichQueued: number;
}> {
  const { data } = await api.post('/stores/create-from-contacts', { contacts });
  return data;
}

export async function matchContacts(contacts: ContactInput[]): Promise<{
  total: number; matched: number; unmatched: number; data: MatchedContact[];
}> {
  const { data } = await api.post('/stores/match-contacts', { contacts });
  return data;
}

export async function startDealerDiscovery(params: {
  brandIds?: string[];
  stateIds?: string[];
  sources?: ('google_places' | 'cnae' | 'brand_site')[];
  onlyMissing?: boolean;
}): Promise<{ jobsCreated: number; totalCombinations: number; sources: string[] }> {
  const { data } = await api.post('/search-sites/discover', params);
  return data;
}

// ─── Discovery ───────────────────────────────────────────────────────────────

export interface DiscoveryStateCoverage {
  id: string;
  code: string;
  name: string;
  region: string;
  regionPriority: number;
  totalStores: number;
  storesComSite: number;
  coberturaPercent: number;
  jobs: {
    total: number;
    completed: number;
    failed: number;
    pending: number;
    running: number;
  };
  discoveryStatus: 'pending' | 'partial' | 'done' | 'running';
}

export interface DiscoveryCoverage {
  states: DiscoveryStateCoverage[];
  summary: {
    totalStores: number;
    totalComSite: number;
    statesDiscovered: number;
    statesPartial: number;
    statesPending: number;
  };
}

export interface DiscoveryQueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  total: number;
}

export interface DiscoveryStateBrands {
  state: { id: string; code: string; name: string };
  brands: { id: string; name: string; slug: string; totalStores: number; storesComSite: number }[];
}

export async function fetchDiscoveryCoverage(): Promise<DiscoveryCoverage> {
  const { data } = await api.get<ApiResponse<DiscoveryCoverage>>('/discovery/coverage');
  return data.data;
}

export async function fetchDiscoveryQueueStats(): Promise<DiscoveryQueueStats> {
  const { data } = await api.get<ApiResponse<DiscoveryQueueStats>>('/discovery/queue-stats');
  return data.data;
}

export async function fetchStateBrands(stateCode: string): Promise<DiscoveryStateBrands> {
  const { data } = await api.get<ApiResponse<DiscoveryStateBrands>>(`/discovery/state/${stateCode}/brands`);
  return data.data;
}

// ─── Store Enrichment ─────────────────────────────────────────────────────────

export interface StoreEnrichmentStats {
  stores: {
    total: number;
    pending: number;
    done: number;
    skipped: number;
    error: number;
    running: number;
    autoforce: number;
    semCobertura: number;
    comDados: number;
  };
  queue: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  };
  phoneReveal: {
    pending: number;
    withPhoneFlag: number;
    revealed: number;
    requested: number;
  };
}

export interface EligibleStore {
  id: string;
  name: string;
  brand: { name: string };
  state: { code: string; region: string };
  website: { url: string; provider: { name: string } | null } | null;
}

export async function fetchStoreEnrichmentStats(): Promise<StoreEnrichmentStats> {
  const { data } = await api.get<ApiResponse<StoreEnrichmentStats>>('/store-enrichment/stats');
  return data.data;
}

export async function fetchEligibleStores(limit = 50, region?: string): Promise<EligibleStore[]> {
  const { data } = await api.get<ApiResponse<EligibleStore[]>>('/store-enrichment/eligible', {
    params: { limit, region },
  });
  return data.data;
}

export async function enqueueEnrichmentBatch(params: {
  limit?: number;
  region?: string;
  delayBetweenMs?: number;
}): Promise<{ enqueued: number; region: string; estimatedTimeMin: number; stores: any[] }> {
  const { data } = await api.post('/store-enrichment/enqueue-batch', params);
  return data.data;
}

export async function pauseEnrichmentQueue(): Promise<void> {
  await api.post('/store-enrichment/pause');
}

export async function resumeEnrichmentQueue(): Promise<void> {
  await api.post('/store-enrichment/resume');
}

export async function revealApolloPhones(params: {
  limit?: number;
}): Promise<{ total: number; revealed: number; noPhone: number; errors: number; results: any[] }> {
  const { data } = await api.post('/store-enrichment/apollo-phone-reveal', params);
  return data.data;
}

export async function syncApolloPhones(limit = 50): Promise<{ total: number; synced: number; noPhone: number; errors: number; firstError: string[] }> {
  const { data } = await api.post('/store-enrichment/sync-apollo-phones', { limit });
  return data.data;
}

export interface EnrichedStore {
  id: string;
  name: string;
  contactName: string | null;
  contactLastName: string | null;
  contactRole: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  apolloEnrichedAt: string | null;
  hunterEnrichedAt: string | null;
  brand: { name: string };
  state: { code: string };
  website: { url: string; provider: { name: string } | null } | null;
  partners: {
    nome: string;
    qualificacao: string | null;
    email: string | null;
    phone: string | null;
    linkedinUrl: string | null;
    source?: string | null;
    apolloHasPhone: boolean | null;
  }[];
}

export interface NoCoverageStore {
  id: string;
  name: string;
  apolloOrgId: string | null;
  apolloEnrichedAt: string | null;
  hunterEnrichedAt: string | null;
  brand: { name: string };
  state: { code: string; region: string };
  website: { url: string; provider: { name: string } | null } | null;
  partners: { nome: string; qualificacao: string | null; email: string | null; linkedinUrl: string | null }[];
}

export async function fetchEnrichedStores(limit = 50): Promise<EnrichedStore[]> {
  const { data } = await api.get(`/store-enrichment/enriched?limit=${limit}`);
  return data.data;
}

export async function savePartnerPhone(storeId: string, nome: string, phone: string): Promise<void> {
  await api.patch(`/store-enrichment/partners/${encodeURIComponent(storeId)}/${encodeURIComponent(nome)}/phone`, { phone });
}

export interface BestLeadContato {
  nome: string;
  cargo: string | null;
  email: string | null;
  phone: string | null;
  linkedin: string | null;
  hasPhone: boolean | null;
  decisor: boolean;
}

export interface BestLeadGroup {
  grupo: string;
  domain: string;
  marcas: string;
  estados: string;
  regioes: string[];
  site: string;
  provedor: string;
  lojas: number;
  totalContatos: number;
  decisores: number;
  comLinkedin: number;
  comEmail: number;
  comPhone: number;
  comHasPhone: number;
  score: number;
  contatos: BestLeadContato[];
}

export interface BestLeadsResumo {
  totalGrupos: number;
  totalContatos: number;
  totalLojas: number;
  comPhone: number;
  comHasPhone: number;
  comLinkedin: number;
  comEmail: number;
  decisores: number;
}

export async function fetchBestLeads(limit = 150): Promise<{ data: BestLeadGroup[]; resumo: BestLeadsResumo }> {
  const { data } = await api.get(`/store-enrichment/best-leads?limit=${limit}`);
  return { data: data.data, resumo: data.resumo };
}

export async function fetchNoCoverageStores(limit = 300): Promise<NoCoverageStore[]> {
  const { data } = await api.get(`/store-enrichment/no-coverage?limit=${limit}`);
  return data.data;
}

export async function fetchRunningEnrichments(): Promise<{ id: string; name: string; brand: { name: string }; state: { code: string }; website: { url: string; provider: { name: string } | null } | null }[]> {
  const { data } = await api.get('/store-enrichment/running');
  return data.data;
}

export async function startDiscoveryForState(
  stateCode: string,
  options?: { forceRedo?: boolean }
): Promise<{ state: { code: string; name: string }; enqueued: number; skipped: number; totalBrands: number }> {
  const { data } = await api.post(`/discovery/state/${stateCode}/start`, options ?? {});
  return data.data;
}

export async function fetchDealerGroups(params: {
  page?: number;
  limit?: number;
  search?: string;
  brandId?: string;
  crmStatus?: string;
  readyForSdr?: boolean;
}): Promise<{ data: DealerGroup[]; meta: PaginationMeta }> {
  const { data } = await api.get<ApiResponse<DealerGroup[]>>('/dealer-groups', { params });
  return { data: data.data, meta: data.meta! };
}

export async function fetchDealerGroup(id: string): Promise<DealerGroup> {
  const { data } = await api.get<ApiResponse<DealerGroup>>(`/dealer-groups/${id}`);
  return data.data;
}

export async function fetchDealerGroupStats(): Promise<DealerGroupStats> {
  const { data } = await api.get<ApiResponse<DealerGroupStats>>('/dealer-groups/stats');
  return data.data;
}

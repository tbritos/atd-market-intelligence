'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchBrandGroupsPipedrive, fetchBrands, fetchStores, fetchWebsites, startDealerDiscovery, startSearchForBrand } from '@/lib/api';
import { PageHeader } from '@/components/page-header';
import { ScoreBadge } from '@/components/score-badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Clock,
  ExternalLink,
  Filter,
  Globe,
  Layers3,
  Loader2,
  MapPin,
  Phone,
  Search,
  TrendingUp,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';

function formatVisits(n: number | null): string {
  if (n === null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return `${n}`;
}

function formatDowntime(s: number | null): string {
  if (s === null || s === 0) return '0s';
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m`;
}

const SORT_OPTIONS = [
  { value: 'avgPerformanceScore', label: 'Performance' },
  { value: 'seoScore', label: 'SEO' },
  { value: 'avgResponseTime', label: 'Resposta' },
  { value: 'downtimeSeconds', label: 'Downtime' },
];

type GroupedStore = Awaited<ReturnType<typeof fetchStores>>['data'][number];

function extractDomain(url: string | undefined): string {
  if (!url) return 'sem-dominio';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function queueLabel(queue: 'blocked_crm' | 'apollo_ready' | 'hunter_fallback' | 'review') {
  switch (queue) {
    case 'blocked_crm':
      return 'Bloqueado CRM';
    case 'apollo_ready':
      return 'Pronto para Apollo';
    case 'hunter_fallback':
      return 'Fallback Hunter';
    case 'review':
      return 'Revisar';
  }
}

export default function BrandDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState('avgPerformanceScore');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [groupSearch, setGroupSearch] = useState('');
  const [viewMode, setViewMode] = useState<'groups' | 'websites'>('groups');
  const [groupFilter, setGroupFilter] = useState<'all' | 'priority' | 'review' | 'single' | 'generic'>('all');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [groupInsights, setGroupInsights] = useState<Record<string, Awaited<ReturnType<typeof fetchBrandGroupsPipedrive>>['data'][number]>>({});

  const { data: groupsCacheData } = useQuery({
    queryKey: ['brand-groups-pipedrive-cache', id],
    queryFn: () => fetchBrandGroupsPipedrive(id, { limit: 500, bucket: 'all' }),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!groupsCacheData?.data) return;

    setGroupInsights((current) => {
      const next = { ...current };
      for (const row of groupsCacheData.data) next[row.domain] = row;
      return next;
    });
  }, [groupsCacheData]);

  const { data: websitesData, isLoading: websitesLoading } = useQuery({
    queryKey: ['brand-websites', id, page, sortBy, sortOrder],
    queryFn: () => fetchWebsites({ page, limit: 20, brandId: id, sortBy, sortOrder }),
  });

  const { data: brandStoresData, isLoading: storesLoading } = useQuery({
    queryKey: ['brand-store-groups', id],
    queryFn: () => fetchStores({ brandId: id, hasWebsite: true, all: true, limit: 1000 }),
  });

  const { data: brandsData } = useQuery({
    queryKey: ['brands', 1, 'name', 'asc'],
    queryFn: () => fetchBrands({ page: 1, limit: 200 }),
  });

  const queryClient = useQueryClient();
  const [searchDone, setSearchDone] = useState(false);
  const [discoveryDone, setDiscoveryDone] = useState(false);

  const { mutate: triggerSearch, isPending: isSearching } = useMutation({
    mutationFn: () => startSearchForBrand(id),
    onSuccess: () => {
      setSearchDone(true);
      queryClient.invalidateQueries({ queryKey: ['brand-websites', id] });
      queryClient.invalidateQueries({ queryKey: ['brand-store-groups', id] });
    },
  });

  const { mutate: triggerDiscovery, isPending: isDiscovering } = useMutation({
    mutationFn: () => startDealerDiscovery({ brandIds: [id] }),
    onSuccess: () => {
      setDiscoveryDone(true);
      queryClient.invalidateQueries({ queryKey: ['brand-store-groups', id] });
    },
  });

  const { mutate: checkPipedrive, isPending: isCheckingPipedrive } = useMutation({
    mutationFn: () => fetchBrandGroupsPipedrive(id, { limit: 20, bucket: groupFilter, refresh: true }),
    onSuccess: (result) => {
      setGroupInsights((current) => {
        const next = { ...current };
        for (const row of result.data) next[row.domain] = row;
        return next;
      });
    },
  });

  const { mutate: checkAllPipedrive, isPending: isCheckingAllPipedrive } = useMutation({
    mutationFn: () => fetchBrandGroupsPipedrive(id, { limit: 500, bucket: 'all', refresh: true }),
    onSuccess: (result) => {
      setGroupInsights((current) => {
        const next = { ...current };
        for (const row of result.data) next[row.domain] = row;
        return next;
      });
    },
  });

  const brand = brandsData?.data.find((b) => b.id === id);
  const websites = websitesData?.data ?? [];
  const meta = websitesData?.meta;
  const stores = brandStoresData?.data ?? [];

  const GENERIC_DOMAIN_PATTERNS = [
    'fiat.com.br',
    'facebook.com',
    'instagram.com',
    'linktr.ee',
    'api.whatsapp.com',
    'whatsapp.com',
    'seul.ink',
  ];

  const allGrouped = Object.values(
    stores.reduce<Record<string, {
      domain: string;
      websiteUrl: string;
      stores: GroupedStore[];
      states: Set<string>;
      cities: Set<string>;
      providers: Map<string, number>;
      withPhone: number;
    }>>((acc, store) => {
      const url = store.website?.url ?? '';
      const domain = extractDomain(url);
      const key = domain || store.id;

      if (!acc[key]) {
        acc[key] = {
          domain,
          websiteUrl: url,
          stores: [],
          states: new Set<string>(),
          cities: new Set<string>(),
          providers: new Map<string, number>(),
          withPhone: 0,
        };
      }

      acc[key].stores.push(store);
      if (store.state?.code) acc[key].states.add(store.state.code);
      if (store.city?.name) acc[key].cities.add(store.city.name);
      if (store.phone) acc[key].withPhone += 1;

      const providerName = store.website?.provider?.name ?? 'Sem provedor';
      acc[key].providers.set(providerName, (acc[key].providers.get(providerName) ?? 0) + 1);
      return acc;
    }, {})
  )
    .map((group) => {
      const provider = [...group.providers.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Sem provedor';
      const states = [...group.states].sort();
      const domain = group.domain;
      const isGeneric = GENERIC_DOMAIN_PATTERNS.some((pattern) => domain.includes(pattern));
      const bucket: 'priority' | 'review' | 'single' | 'generic' =
        isGeneric ? 'generic'
        : states.length > 1 ? 'review'
        : group.stores.length === 1 ? 'single'
        : 'priority';

      return {
        domain,
        websiteUrl: group.websiteUrl,
        provider,
        stores: [...group.stores].sort((a, b) => {
          const stateCompare = (a.state?.code ?? '').localeCompare(b.state?.code ?? '');
          if (stateCompare !== 0) return stateCompare;
          return a.name.localeCompare(b.name);
        }),
        states,
        cities: [...group.cities].sort(),
        withPhone: group.withPhone,
        bucket,
        isGeneric,
      };
    })
    .filter((group) => {
      if (!groupSearch.trim()) return true;
      const needle = groupSearch.toLowerCase();
      return (
        group.domain.toLowerCase().includes(needle) ||
        group.provider.toLowerCase().includes(needle) ||
        group.stores.some((store) => store.name.toLowerCase().includes(needle))
      );
    });

  const grouped = allGrouped
    .filter((group) => groupFilter === 'all' || group.bucket === groupFilter)
    .sort((a, b) => {
      const order = { priority: 0, review: 1, single: 2, generic: 3 };
      return order[a.bucket] - order[b.bucket] || b.stores.length - a.stores.length || a.domain.localeCompare(b.domain);
    });

  const groupedSummary = {
    totalStores: stores.length,
    totalDomains: Object.values(
      stores.reduce<Record<string, boolean>>((acc, store) => {
        acc[extractDomain(store.website?.url)] = true;
        return acc;
      }, {})
    ).length,
    multiStoreDomains: Object.values(
      stores.reduce<Record<string, number>>((acc, store) => {
        const key = extractDomain(store.website?.url);
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {})
    ).filter((count) => count > 1).length,
    multiStateDomains: Object.values(
      stores.reduce<Record<string, Set<string>>>((acc, store) => {
        const key = extractDomain(store.website?.url);
        if (!acc[key]) acc[key] = new Set<string>();
        if (store.state?.code) acc[key].add(store.state.code);
        return acc;
      }, {})
    ).filter((states) => states.size > 1).length,
  };

  const groupedBuckets = {
    priority: allGrouped.filter((group) => group.bucket === 'priority').length,
    review: allGrouped.filter((group) => group.bucket === 'review').length,
    single: allGrouped.filter((group) => group.bucket === 'single').length,
    generic: allGrouped.filter((group) => group.bucket === 'generic').length,
  };

  const pipedriveSummary = Object.values(groupInsights).reduce(
    (acc, item) => {
      acc[item.pipedrive.status] += 1;
      return acc;
    },
    { cliente: 0, deal_ativo: 0, lead: 0, not_found: 0 }
  );

  const enrichmentSummary = Object.values(groupInsights).reduce(
    (acc, item) => {
      acc[item.enrichment.queue] += 1;
      return acc;
    },
    { blocked_crm: 0, apollo_ready: 0, hunter_fallback: 0, review: 0 }
  );

  const pipedriveChecks = Object.fromEntries(
    Object.entries(groupInsights).map(([domain, item]) => [domain, item.pipedrive])
  );

  const toggleGroup = (domain: string) => {
    setExpandedGroups((current) => ({ ...current, [domain]: !current[domain] }));
  };

  return (
    <div>
      <Link
        href="/brands"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Voltar para Marcas
      </Link>

      <PageHeader
        title={brand?.name ?? 'Marca'}
        description={`Organização por domínio, grupo e websites de ${brand?.name ?? '...'}`}
      >
        <div className="flex items-center gap-2">
          <button
            onClick={() => triggerDiscovery()}
            disabled={isDiscovering}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {isDiscovering ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : discoveryDone ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <MapPin className="w-4 h-4" />
            )}
            {isDiscovering ? 'Descobrindo...' : discoveryDone ? 'Descoberta disparada' : 'Descobrir Lojas'}
          </button>
          <button
            onClick={() => triggerSearch()}
            disabled={isSearching}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {isSearching ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : searchDone ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <Search className="w-4 h-4" />
            )}
            {isSearching ? 'Buscando...' : searchDone ? 'Busca disparada' : 'Buscar Sites'}
          </button>
          <button
            onClick={() => checkPipedrive()}
            disabled={isCheckingPipedrive}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-slate-700 text-white hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {isCheckingPipedrive ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Users className="w-4 h-4" />
            )}
            {isCheckingPipedrive ? 'Consultando Pipedrive...' : 'Checar CRM'}
          </button>
          <button
            onClick={() => checkAllPipedrive()}
            disabled={isCheckingAllPipedrive}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-zinc-900 text-white hover:bg-black disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {isCheckingAllPipedrive ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Layers3 className="w-4 h-4" />
            )}
            {isCheckingAllPipedrive ? 'Salvando CRM...' : 'Checar CRM de Todos'}
          </button>
        </div>
      </PageHeader>

      {brand && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <Card className="border-border bg-card">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Globe className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Websites</p>
                <p className="text-xl font-bold text-foreground">
                  {brand.activeWebsites ?? 0}
                  <span className="text-sm font-normal text-muted-foreground">/{brand.totalWebsites ?? 0}</span>
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border bg-card">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-sky-500/10">
                <Layers3 className="w-4 h-4 text-sky-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Domínios</p>
                <p className="text-xl font-bold text-foreground">{storesLoading ? '—' : groupedSummary.totalDomains}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border bg-card">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">SEO Médio</p>
                <p className="text-xl font-bold text-foreground">
                  {brand.avgSeoScore != null ? brand.avgSeoScore.toFixed(1) : '—'}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border bg-card">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-500/10">
                <Clock className="w-4 h-4 text-yellow-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Resposta Média</p>
                <p className="text-xl font-bold text-foreground">
                  {brand.avgResponseTime != null ? `${brand.avgResponseTime}ms` : '—'}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setViewMode('groups')}
          className={cn(
            'inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg border transition-colors',
            viewMode === 'groups'
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-card border-border text-muted-foreground hover:text-foreground'
          )}
        >
          <Layers3 className="w-4 h-4" />
          Domínios e Grupos
        </button>
        <button
          onClick={() => setViewMode('websites')}
          className={cn(
            'inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg border transition-colors',
            viewMode === 'websites'
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-card border-border text-muted-foreground hover:text-foreground'
          )}
        >
          <Globe className="w-4 h-4" />
          Websites Monitorados
        </button>
      </div>

      {viewMode === 'groups' ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <Card className="border-border bg-card">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Stores com site</p>
                <p className="text-2xl font-bold">{storesLoading ? '—' : groupedSummary.totalStores}</p>
              </CardContent>
            </Card>
            <Card className="border-border bg-card">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Domínios únicos</p>
                <p className="text-2xl font-bold">{storesLoading ? '—' : groupedSummary.totalDomains}</p>
              </CardContent>
            </Card>
            <Card className="border-border bg-card">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Grupos com 2+ lojas</p>
                <p className="text-2xl font-bold">{storesLoading ? '—' : groupedSummary.multiStoreDomains}</p>
              </CardContent>
            </Card>
          <Card className="border-border bg-card">
            <CardContent className="p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Grupos multiestado</p>
                <p className="text-2xl font-bold">{storesLoading ? '—' : groupedSummary.multiStateDomains}</p>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            <button
              onClick={() => setGroupFilter('all')}
              className={cn(
                'px-3 py-2 text-sm rounded-lg border transition-colors',
                groupFilter === 'all'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card border-border text-muted-foreground hover:text-foreground'
              )}
            >
              Todos ({groupedSummary.totalDomains})
            </button>
            <button
              onClick={() => setGroupFilter('priority')}
              className={cn(
                'px-3 py-2 text-sm rounded-lg border transition-colors',
                groupFilter === 'priority'
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-card border-border text-muted-foreground hover:text-foreground'
              )}
            >
              Prioridade ({groupedBuckets.priority})
            </button>
            <button
              onClick={() => setGroupFilter('review')}
              className={cn(
                'px-3 py-2 text-sm rounded-lg border transition-colors',
                groupFilter === 'review'
                  ? 'bg-amber-500 text-black border-amber-500'
                  : 'bg-card border-border text-muted-foreground hover:text-foreground'
              )}
            >
              Revisar ({groupedBuckets.review})
            </button>
            <button
              onClick={() => setGroupFilter('single')}
              className={cn(
                'px-3 py-2 text-sm rounded-lg border transition-colors',
                groupFilter === 'single'
                  ? 'bg-sky-600 text-white border-sky-600'
                  : 'bg-card border-border text-muted-foreground hover:text-foreground'
              )}
            >
              Loja única ({groupedBuckets.single})
            </button>
            <button
              onClick={() => setGroupFilter('generic')}
              className={cn(
                'px-3 py-2 text-sm rounded-lg border transition-colors',
                groupFilter === 'generic'
                  ? 'bg-zinc-700 text-white border-zinc-700'
                  : 'bg-card border-border text-muted-foreground hover:text-foreground'
              )}
            >
              Genéricos ({groupedBuckets.generic})
            </button>
          </div>

          <Card className="border-border bg-card mb-4">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Filter className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    value={groupSearch}
                    onChange={(e) => setGroupSearch(e.target.value)}
                    placeholder="Filtrar por domínio, provedor ou nome da loja"
                    className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <p className="text-sm text-muted-foreground whitespace-nowrap">{grouped.length} grupos</p>
              </div>
            </CardContent>
          </Card>

          {Object.keys(groupInsights).length > 0 && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              <Card className="border-border bg-card">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Clientes</p>
                  <p className="text-2xl font-bold text-emerald-400">{pipedriveSummary.cliente}</p>
                </CardContent>
              </Card>
              <Card className="border-border bg-card">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Deals Ativos</p>
                  <p className="text-2xl font-bold text-amber-400">{pipedriveSummary.deal_ativo}</p>
                </CardContent>
              </Card>
              <Card className="border-border bg-card">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Leads</p>
                  <p className="text-2xl font-bold text-sky-400">{pipedriveSummary.lead}</p>
                </CardContent>
              </Card>
              <Card className="border-border bg-card">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Prontos p/ enriquecer</p>
                  <p className="text-2xl font-bold text-primary">{pipedriveSummary.lead + pipedriveSummary.not_found}</p>
                </CardContent>
              </Card>
            </div>
          )}

          {Object.keys(groupInsights).length > 0 && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              <Card className="border-border bg-card">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Bloqueado CRM</p>
                  <p className="text-2xl font-bold text-zinc-300">{enrichmentSummary.blocked_crm}</p>
                </CardContent>
              </Card>
              <Card className="border-border bg-card">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Pronto Apollo</p>
                  <p className="text-2xl font-bold text-violet-300">{enrichmentSummary.apollo_ready}</p>
                </CardContent>
              </Card>
              <Card className="border-border bg-card">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Fallback Hunter</p>
                  <p className="text-2xl font-bold text-sky-300">{enrichmentSummary.hunter_fallback}</p>
                </CardContent>
              </Card>
              <Card className="border-border bg-card">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Revisar</p>
                  <p className="text-2xl font-bold text-amber-300">{enrichmentSummary.review}</p>
                </CardContent>
              </Card>
            </div>
          )}

          <div className="space-y-4">
            {storesLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <Card key={i} className="border-border bg-card">
                  <CardContent className="p-4">
                    <Skeleton className="h-6 w-72 mb-3" />
                    <Skeleton className="h-4 w-full mb-2" />
                    <Skeleton className="h-4 w-2/3" />
                  </CardContent>
                </Card>
              ))
            ) : grouped.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground text-sm">
                Nenhum grupo com site encontrado para esta marca.
              </div>
            ) : (
              grouped.map((group) => (
                <Card key={group.domain} className="border-border bg-card">
                  <CardContent className="p-5">
                    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <a
                            href={group.websiteUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-base font-semibold text-foreground hover:text-primary transition-colors inline-flex items-center gap-2"
                          >
                            {group.domain}
                            <ExternalLink className="w-4 h-4" />
                          </a>
                          <Badge className="bg-primary/10 text-primary border-primary/20">
                            {group.stores.length} loja{group.stores.length !== 1 ? 's' : ''}
                          </Badge>
                          <Badge
                            className={cn(
                              'border text-xs',
                              group.bucket === 'priority' && 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
                              group.bucket === 'review' && 'bg-amber-500/10 text-amber-400 border-amber-500/20',
                              group.bucket === 'single' && 'bg-sky-500/10 text-sky-400 border-sky-500/20',
                              group.bucket === 'generic' && 'bg-zinc-500/10 text-zinc-300 border-zinc-500/20'
                            )}
                          >
                            {group.bucket === 'priority' && 'Prioridade'}
                            {group.bucket === 'review' && 'Revisar'}
                            {group.bucket === 'single' && 'Loja única'}
                            {group.bucket === 'generic' && 'Genérico'}
                          </Badge>
                          {group.states.length > 1 && (
                            <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20">
                              {group.states.length} estados
                            </Badge>
                          )}
                          {groupInsights[group.domain]?.saved?.readyForSdr && (
                            <Badge className="bg-emerald-500/10 text-emerald-300 border-emerald-500/20">
                              Pronto para SDR
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Provedor: {group.provider} · {group.withPhone}/{group.stores.length} com telefone
                        </p>
                        {groupInsights[group.domain] && (
                          <div className="flex flex-wrap items-center gap-2 mt-2">
                            <Badge
                              className={cn(
                                'border text-xs',
                                pipedriveChecks[group.domain].status === 'cliente' && 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
                                pipedriveChecks[group.domain].status === 'deal_ativo' && 'bg-amber-500/10 text-amber-400 border-amber-500/20',
                                pipedriveChecks[group.domain].status === 'lead' && 'bg-sky-500/10 text-sky-400 border-sky-500/20',
                                pipedriveChecks[group.domain].status === 'not_found' && 'bg-zinc-500/10 text-zinc-300 border-zinc-500/20'
                              )}
                            >
                              Pipedrive: {pipedriveChecks[group.domain].status}
                            </Badge>
                            {pipedriveChecks[group.domain].orgName && (
                              <span className="text-xs text-muted-foreground">
                                {pipedriveChecks[group.domain].orgName}
                              </span>
                            )}
                            {pipedriveChecks[group.domain].responsavel && (
                              <span className="text-xs text-muted-foreground">
                                Resp.: {pipedriveChecks[group.domain].responsavel}
                              </span>
                            )}
                            {pipedriveChecks[group.domain].dealStage && (
                              <span className="text-xs text-muted-foreground">
                                Etapa: {pipedriveChecks[group.domain].dealStage}
                              </span>
                            )}
                            {pipedriveChecks[group.domain].dealId && (
                              <a
                                href={`https://autoforce2.pipedrive.com/deal/${pipedriveChecks[group.domain].dealId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-primary hover:underline"
                              >
                                Deal #{pipedriveChecks[group.domain].dealId}
                              </a>
                            )}
                            {pipedriveChecks[group.domain].orgId && (
                              <a
                                href={`https://autoforce2.pipedrive.com/organization/${pipedriveChecks[group.domain].orgId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-primary hover:underline"
                              >
                                Organização #{pipedriveChecks[group.domain].orgId}
                              </a>
                            )}
                            {pipedriveChecks[group.domain].matchedTerm && (
                              <span className="text-xs text-muted-foreground">
                                Match: {pipedriveChecks[group.domain].matchedTerm}
                              </span>
                            )}
                            <span className="text-xs text-muted-foreground">
                              Pessoas: {pipedriveChecks[group.domain].persons.length}
                            </span>
                            <Badge
                              className={cn(
                                'border text-xs',
                                ['lead', 'not_found'].includes(pipedriveChecks[group.domain].status)
                                  ? 'bg-violet-500/10 text-violet-300 border-violet-500/20'
                                  : 'bg-zinc-500/10 text-zinc-300 border-zinc-500/20'
                              )}
                            >
                              {['lead', 'not_found'].includes(pipedriveChecks[group.domain].status)
                                ? 'Pode enriquecer'
                                : 'Segurar enriquecimento'}
                            </Badge>
                            {groupInsights[group.domain].saved && (
                              <p className="text-xs text-muted-foreground">
                                Contatos salvos: {groupInsights[group.domain].saved.contacts.length} · Apollo {groupInsights[group.domain].saved.apolloStatus} · Hunter {groupInsights[group.domain].saved.hunterStatus}
                              </p>
                            )}
                          </div>
                        )}
                        {groupInsights[group.domain] && (
                          <div className="mt-2 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge
                                className={cn(
                                  'border text-xs',
                                  groupInsights[group.domain].enrichment.queue === 'blocked_crm' && 'bg-zinc-500/10 text-zinc-300 border-zinc-500/20',
                                  groupInsights[group.domain].enrichment.queue === 'apollo_ready' && 'bg-violet-500/10 text-violet-300 border-violet-500/20',
                                  groupInsights[group.domain].enrichment.queue === 'hunter_fallback' && 'bg-sky-500/10 text-sky-300 border-sky-500/20',
                                  groupInsights[group.domain].enrichment.queue === 'review' && 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                                )}
                              >
                                {queueLabel(groupInsights[group.domain].enrichment.queue)}
                              </Badge>
                              <Badge className="bg-primary/10 text-primary border-primary/20">
                                Score {groupInsights[group.domain].enrichment.priorityScore}
                              </Badge>
                              <Badge
                                className={cn(
                                  'border text-xs',
                                  groupInsights[group.domain].enrichment.apollo.shouldEnrich
                                    ? 'bg-violet-500/10 text-violet-300 border-violet-500/20'
                                    : 'bg-zinc-500/10 text-zinc-300 border-zinc-500/20'
                                )}
                              >
                                Apollo: {groupInsights[group.domain].enrichment.apollo.mode}
                              </Badge>
                              <Badge
                                className={cn(
                                  'border text-xs',
                                  groupInsights[group.domain].enrichment.hunter.shouldEnrich
                                    ? 'bg-sky-500/10 text-sky-300 border-sky-500/20'
                                    : 'bg-zinc-500/10 text-zinc-300 border-zinc-500/20'
                                )}
                              >
                                Hunter: {groupInsights[group.domain].enrichment.hunter.mode}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Razões: {groupInsights[group.domain].enrichment.reasons.slice(0, 2).join(' · ') || '—'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Apollo termos: {groupInsights[group.domain].enrichment.apollo.orgQueryTerms.slice(0, 3).join(' · ') || '—'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Hunter candidatos: {groupInsights[group.domain].enrichment.hunter.emailFinderCandidates.slice(0, 3).join(' · ') || 'sem nome forte ainda'}
                            </p>
                          </div>
                        )}
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="flex flex-wrap gap-2">
                          {group.states.map((state) => (
                            <Badge key={state} variant="secondary" className="text-xs">
                              {state}
                            </Badge>
                          ))}
                        </div>
                        <button
                          onClick={() => toggleGroup(group.domain)}
                          className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-border bg-background hover:bg-muted/40 transition-colors"
                        >
                          {expandedGroups[group.domain] ? (
                            <>
                              <ChevronUp className="w-4 h-4" />
                              Recolher
                            </>
                          ) : (
                            <>
                              <ChevronDown className="w-4 h-4" />
                              Expandir
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {expandedGroups[group.domain] && (
                      <div className="space-y-4">
                        {groupInsights[group.domain]?.saved?.contacts?.length ? (
                          <div className="rounded-lg border border-border/60 bg-background/30 p-3">
                            <div className="flex items-center justify-between gap-3 mb-3">
                              <p className="text-sm font-medium">Contatos Enriquecidos</p>
                              <Badge className="bg-primary/10 text-primary border-primary/20">
                                {groupInsights[group.domain].saved.contacts.length} contato{groupInsights[group.domain].saved.contacts.length !== 1 ? 's' : ''}
                              </Badge>
                            </div>
                            <div className="space-y-2">
                              {groupInsights[group.domain].saved.contacts.map((contact) => (
                                <div key={contact.id} className="rounded-lg border border-border/50 bg-background/50 px-3 py-2">
                                  <div className="flex flex-wrap items-center gap-2 mb-1">
                                    <p className="text-sm font-medium">
                                      {contact.fullName || contact.email || 'Contato sem nome'}
                                    </p>
                                    <Badge
                                      className={cn(
                                        'border text-xs',
                                        contact.source === 'HUNTER' && 'bg-sky-500/10 text-sky-300 border-sky-500/20',
                                        contact.source === 'APOLLO' && 'bg-violet-500/10 text-violet-300 border-violet-500/20',
                                        contact.source === 'PIPEDRIVE' && 'bg-zinc-500/10 text-zinc-300 border-zinc-500/20'
                                      )}
                                    >
                                      {contact.source}
                                    </Badge>
                                    {contact.isDecisionMaker && (
                                      <Badge className="bg-emerald-500/10 text-emerald-300 border-emerald-500/20">
                                        Decisor
                                      </Badge>
                                    )}
                                    {contact.isPrimary && (
                                      <Badge className="bg-amber-500/10 text-amber-300 border-amber-500/20">
                                        Principal
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                    {contact.title && <span>{contact.title}</span>}
                                    {contact.email && <span>{contact.email}</span>}
                                    {contact.emailConfidence != null && <span>ConfianÃ§a {contact.emailConfidence}</span>}
                                    {contact.phone && <span>{contact.phone}</span>}
                                    {contact.linkedinUrl && (
                                      <a
                                        href={contact.linkedinUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-primary hover:underline"
                                      >
                                        LinkedIn
                                      </a>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        {group.stores.map((store) => (
                          <Link key={store.id} href={`/stores/${store.id}`}>
                            <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/40 px-3 py-2 hover:bg-muted/40 transition-colors">
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{store.name}</p>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground mt-1">
                                  {store.state?.code && (
                                    <span className="inline-flex items-center gap-1">
                                      <MapPin className="w-3 h-3" />
                                      {store.state.code}{store.city?.name ? ` · ${store.city.name}` : ''}
                                    </span>
                                  )}
                                  {store.phone && (
                                    <span className="inline-flex items-center gap-1">
                                      <Phone className="w-3 h-3" />
                                      {store.phone}
                                    </span>
                                  )}
                                  {store.discoverySource && (
                                    <span className="inline-flex items-center gap-1">
                                      <Building2 className="w-3 h-3" />
                                      {store.discoverySource}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-4">
            <Select value={sortBy} onValueChange={(v) => { if (v) { setSortBy(v); setPage(1); } }}>
              <SelectTrigger className="w-40 bg-card border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sortOrder} onValueChange={(v) => { if (v) { setSortOrder(v as 'asc' | 'desc'); setPage(1); } }}>
              <SelectTrigger className="w-36 bg-card border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="desc">Maior primeiro</SelectItem>
                <SelectItem value="asc">Menor primeiro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            {websitesLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <Card key={i} className="border-border bg-card">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-4">
                        <Skeleton className="h-5 w-48" />
                        <Skeleton className="h-5 w-16" />
                        <Skeleton className="h-5 w-16" />
                      </div>
                    </CardContent>
                  </Card>
                ))
              : websites.length === 0
              ? (
                <div className="text-center py-16 text-muted-foreground text-sm">
                  Nenhum website encontrado para esta marca.
                </div>
              )
              : websites.map((site) => {
                  const isDown = (site.downtimeSeconds ?? 0) > 0;
                  return (
                    <Card key={site.id} className="border-border bg-card hover:border-primary/50 transition-colors">
                      <CardContent className="p-4">
                        <div className="flex flex-col md:flex-row md:items-center gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span
                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold flex-shrink-0 ${
                                  isDown ? 'bg-red-500/15 text-red-400' : 'bg-emerald-500/15 text-emerald-400'
                                }`}
                              >
                                {isDown ? <WifiOff className="w-2.5 h-2.5" /> : <Wifi className="w-2.5 h-2.5" />}
                                {isDown ? 'DOWN' : 'UP'}
                              </span>
                              <a
                                href={site.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm font-medium text-foreground hover:text-primary truncate flex items-center gap-1 transition-colors"
                              >
                                {site.url.replace(/^https?:\/\//, '')}
                                <ExternalLink className="w-3 h-3 flex-shrink-0" />
                              </a>
                              <Badge
                                variant={site.isActive ? 'default' : 'secondary'}
                                className={site.isActive ? 'bg-emerald-500/20 text-emerald-400 border-0 text-xs' : 'text-xs'}
                              >
                                {site.isActive ? 'Ativo' : 'Inativo'}
                              </Badge>
                            </div>
                            {site.provider && (
                              <p className="text-xs text-muted-foreground mt-0.5">{site.provider.name}</p>
                            )}
                          </div>

                          <div className="flex items-center gap-3 flex-shrink-0">
                            <div className="text-center bg-muted/40 rounded-lg px-3 py-2">
                              <div className="flex items-center gap-1 justify-center mb-1">
                                <Activity className="w-3 h-3 text-muted-foreground" />
                                <span className="text-xs text-muted-foreground">Perf.</span>
                              </div>
                              <ScoreBadge score={site.avgPerformanceScore} />
                            </div>
                            <div className="text-center bg-muted/40 rounded-lg px-3 py-2">
                              <div className="flex items-center gap-1 justify-center mb-1">
                                <TrendingUp className="w-3 h-3 text-muted-foreground" />
                                <span className="text-xs text-muted-foreground">SEO</span>
                              </div>
                              <ScoreBadge score={site.seoScore} />
                            </div>
                            <div className="text-center bg-muted/40 rounded-lg px-3 py-2">
                              <div className="flex items-center gap-1 justify-center mb-1">
                                <Clock className="w-3 h-3 text-muted-foreground" />
                                <span className="text-xs text-muted-foreground">Resp.</span>
                              </div>
                              <span className="text-xs font-semibold text-foreground">
                                {site.avgResponseTime != null ? `${site.avgResponseTime}ms` : '—'}
                              </span>
                            </div>
                            <div className="text-center bg-muted/40 rounded-lg px-3 py-2">
                              <div className="flex items-center gap-1 justify-center mb-1">
                                <AlertTriangle className="w-3 h-3 text-muted-foreground" />
                                <span className="text-xs text-muted-foreground">Down</span>
                              </div>
                              <span className={`text-xs font-semibold ${isDown ? 'text-red-400' : 'text-foreground'}`}>
                                {formatDowntime(site.downtimeSeconds)}
                              </span>
                            </div>
                            <div className="text-center bg-muted/40 rounded-lg px-3 py-2">
                              <div className="flex items-center gap-1 justify-center mb-1">
                                <Users className="w-3 h-3 text-muted-foreground" />
                                <span className="text-xs text-muted-foreground">Visitas</span>
                              </div>
                              <span className="text-xs font-semibold text-foreground">
                                {formatVisits(site.avgMonthlyVisits)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
          </div>

          {meta && meta.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-8">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 text-sm rounded-lg border border-border bg-card hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Anterior
              </button>
              <span className="text-sm text-muted-foreground">
                Página {page} de {meta.totalPages} · {meta.total} websites
              </span>
              <button
                onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
                disabled={page === meta.totalPages}
                className="px-4 py-2 text-sm rounded-lg border border-border bg-card hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Próxima
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchWebsites, fetchProviders } from '@/lib/api';
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
  ExternalLink,
  Clock,
  Activity,
  TrendingUp,
  AlertTriangle,
  Users,
  ArrowLeft,
  Wifi,
  WifiOff,
} from 'lucide-react';

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

export default function ProviderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState('avgPerformanceScore');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Fetch websites for this provider
  const { data: websitesData, isLoading: websitesLoading } = useQuery({
    queryKey: ['provider-websites', id, page, sortBy, sortOrder],
    queryFn: () => fetchWebsites({ page, limit: 20, providerId: id, sortBy, sortOrder }),
  });

  // Fetch providers to find this provider's metadata
  const { data: providersData } = useQuery({
    queryKey: ['providers', 1, 'name', 'asc'],
    queryFn: () => fetchProviders({ page: 1, limit: 100 }),
  });

  const provider = providersData?.data.find((p) => p.id === id);
  const websites = websitesData?.data ?? [];
  const meta = websitesData?.meta;

  return (
    <div>
      {/* Back link */}
      <Link
        href="/providers"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Voltar para Provedores
      </Link>

      <PageHeader
        title={provider?.name ?? 'Provedor'}
        description={`Websites hospedados em ${provider?.name ?? '...'}`}
      >
        <div className="flex items-center gap-2">
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
      </PageHeader>

      {/* Provider summary */}
      {provider && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card className="border-border bg-card">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Activity className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Performance Média</p>
                <p className="text-xl font-bold text-foreground">
                  {provider.avgPerformanceScore != null ? provider.avgPerformanceScore.toFixed(1) : '—'}
                </p>
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
                  {provider.avgSeoScore != null ? provider.avgSeoScore.toFixed(1) : '—'}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border bg-card">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-500/10">
                <AlertTriangle className="w-4 h-4 text-yellow-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Downtime Médio</p>
                <p className="text-xl font-bold text-foreground">
                  {formatDowntime(provider.avgDowntimeSeconds)}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Websites list */}
      <div className="space-y-3">
        {websitesLoading
          ? Array.from({ length: 6 }).map((_, i) => (
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
              Nenhum website encontrado para este provedor.
            </div>
          )
          : websites.map((site) => {
              const isDown = (site.downtimeSeconds ?? 0) > 0;
              return (
                <Card key={site.id} className="border-border bg-card hover:border-primary/50 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex flex-col md:flex-row md:items-center gap-4">
                      {/* URL + Status */}
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
                        {site.brand && (
                          <p className="text-xs text-muted-foreground mt-0.5">{site.brand.name}</p>
                        )}
                      </div>

                      {/* Metrics */}
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

      {/* Pagination */}
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
    </div>
  );
}

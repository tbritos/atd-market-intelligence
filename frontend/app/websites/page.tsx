'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchWebsites } from '@/lib/api';
import { PageHeader } from '@/components/page-header';
import { ScoreBadge } from '@/components/score-badge';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ExternalLink, Clock, Activity, TrendingUp, AlertTriangle, Users, Search, Wifi, WifiOff } from 'lucide-react';

const SORT_OPTIONS = [
  { value: 'avgPerformanceScore', label: 'Performance' },
  { value: 'seoScore', label: 'SEO' },
  { value: 'avgResponseTime', label: 'Resposta' },
  { value: 'downtimeSeconds', label: 'Downtime' },
];

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

export default function WebsitesPage() {
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState('avgPerformanceScore');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  // Debounce search by 400ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data, isLoading } = useQuery({
    queryKey: ['websites', page, sortBy, sortOrder, search],
    queryFn: () =>
      fetchWebsites({
        page,
        limit: 20,
        sortBy,
        sortOrder,
        ...(search ? { search } : {}),
      } as Parameters<typeof fetchWebsites>[0]),
  });

  const websites = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div>
      <PageHeader
        title="Websites"
        description="Performance, SEO e disponibilidade dos sites monitorados"
      >
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Buscar por URL..."
              className="pl-8 w-48 bg-card border-border h-9 text-sm"
            />
          </div>

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

      <div className="space-y-3">
        {isLoading
          ? Array.from({ length: 8 }).map((_, i) => (
              <Card key={i} className="border-border bg-card">
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="h-5 w-16" />
                    <Skeleton className="h-5 w-16" />
                    <Skeleton className="h-5 w-16" />
                  </div>
                </CardContent>
              </Card>
            ))
          : websites.map((site) => {
              const isDown = (site.downtimeSeconds ?? 0) > 0;
              return (
                <Card key={site.id} className="border-border bg-card hover:border-primary/50 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex flex-col md:flex-row md:items-center gap-4">
                      {/* URL + Status */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {/* UP/DOWN dot */}
                          <span className="relative flex-shrink-0">
                            <span
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                isDown
                                  ? 'bg-red-500/15 text-red-400'
                                  : 'bg-emerald-500/15 text-emerald-400'
                              }`}
                            >
                              {isDown ? (
                                <WifiOff className="w-2.5 h-2.5" />
                              ) : (
                                <Wifi className="w-2.5 h-2.5" />
                              )}
                              {isDown ? 'DOWN' : 'UP'}
                            </span>
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

                      {/* Metrics — subtle background on each cell */}
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
            Página {page} de {meta.totalPages}
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

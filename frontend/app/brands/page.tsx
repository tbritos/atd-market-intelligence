'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { fetchBrands } from '@/lib/api';
import { PageHeader } from '@/components/page-header';
import { ScoreBadge } from '@/components/score-badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Globe, Clock, TrendingUp, Activity, Search, ChevronRight } from 'lucide-react';

const SORT_OPTIONS = [
  { value: 'name', label: 'Nome' },
  { value: 'avgPerformanceScore', label: 'Performance' },
  { value: 'avgSeoScore', label: 'SEO' },
  { value: 'avgResponseTime', label: 'Tempo de Resposta' },
  { value: 'totalWebsites', label: 'Total de Sites' },
  { value: 'activeWebsites', label: 'Sites Ativos' },
];

function getBarColor(score: number | null) {
  if (score === null) return 'bg-muted-foreground';
  if (score >= 90) return 'bg-emerald-400';
  if (score >= 70) return 'bg-yellow-400';
  return 'bg-red-400';
}

function MiniBar({ score }: { score: number | null }) {
  if (score === null) return null;
  return (
    <div className="w-full bg-black/20 rounded-full h-0.5 mt-1">
      <div
        className={`h-0.5 rounded-full ${getBarColor(score)}`}
        style={{ width: `${Math.min(score, 100)}%` }}
      />
    </div>
  );
}

export default function BrandsPage() {
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [hasMetrics, setHasMetrics] = useState(false);

  // Debounce search input by 400ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const handleSortChange = useCallback((v: string) => {
    if (v) {
      setSortBy(v);
      setPage(1);
    }
  }, []);

  const handleSortOrderChange = useCallback((v: string) => {
    if (v) {
      setSortOrder(v as 'asc' | 'desc');
      setPage(1);
    }
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ['brands', page, sortBy, sortOrder, search, hasMetrics],
    queryFn: () =>
      fetchBrands({
        page,
        limit: 20,
        sortBy,
        sortOrder,
        ...(search ? { search } : {}),
        ...(hasMetrics ? { hasMetrics: true } : {}),
      } as Parameters<typeof fetchBrands>[0]),
  });

  const brands = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div>
      <PageHeader
        title="Marcas"
        description="Performance consolidada por marca"
      >
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Buscar marca..."
              className="pl-8 w-44 bg-card border-border h-9 text-sm"
            />
          </div>

          {/* Só com métricas toggle */}
          <button
            onClick={() => { setHasMetrics((v) => !v); setPage(1); }}
            className={`px-3 py-1.5 text-xs rounded-lg border font-medium transition-all duration-150 ${
              hasMetrics
                ? 'bg-primary text-primary-foreground border-primary shadow shadow-primary/20'
                : 'bg-card text-muted-foreground border-border hover:text-foreground hover:bg-accent'
            }`}
          >
            Só com métricas
          </button>

          {/* Sort */}
          <Select value={sortBy} onValueChange={(v) => v && handleSortChange(v)}>
            <SelectTrigger className="w-44 bg-card border-border">
              <SelectValue placeholder="Ordenar por" />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sortOrder} onValueChange={(v) => v && handleSortOrderChange(v)}>
            <SelectTrigger className="w-32 bg-card border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="asc">Crescente</SelectItem>
              <SelectItem value="desc">Decrescente</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="border-border bg-card">
                <CardContent className="p-5">
                  <Skeleton className="h-5 w-32 mb-4" />
                  <div className="space-y-3">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                </CardContent>
              </Card>
            ))
          : brands.map((brand) => (
              <Link key={brand.id} href={`/brands/${brand.id}`}>
                <Card className="border-border bg-card hover:border-primary/50 hover:bg-accent/20 transition-all duration-150 cursor-pointer h-full">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="font-semibold text-foreground">{brand.name}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">@{brand.slug}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                        <Globe className="w-3 h-3" />
                        <span>{brand.activeWebsites ?? 0}/{brand.totalWebsites ?? 0}</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    {/* Performance */}
                    <div className="text-center rounded-lg bg-muted/40 px-2 py-2">
                      <div className="flex items-center justify-center gap-1 mb-1">
                        <Activity className="w-3 h-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Perf.</span>
                      </div>
                      <ScoreBadge score={brand.avgPerformanceScore} showBar />
                      <MiniBar score={brand.avgPerformanceScore} />
                    </div>

                    {/* SEO */}
                    <div className="text-center rounded-lg bg-muted/40 px-2 py-2">
                      <div className="flex items-center justify-center gap-1 mb-1">
                        <TrendingUp className="w-3 h-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">SEO</span>
                      </div>
                      <ScoreBadge score={brand.avgSeoScore} showBar />
                      <MiniBar score={brand.avgSeoScore} />
                    </div>

                    {/* Response time */}
                    <div className="text-center rounded-lg bg-muted/40 px-2 py-2">
                      <div className="flex items-center justify-center gap-1 mb-1">
                        <Clock className="w-3 h-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Resp.</span>
                      </div>
                      <span className="text-xs font-semibold text-foreground">
                        {brand.avgResponseTime != null ? `${brand.avgResponseTime}ms` : '—'}
                      </span>
                    </div>
                  </div>

                  {brand.metricsUpdatedAt && (
                    <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border">
                      Atualizado em {new Date(brand.metricsUpdatedAt).toLocaleDateString('pt-BR')}
                    </p>
                  )}
                </CardContent>
                </Card>
              </Link>
            ))}
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

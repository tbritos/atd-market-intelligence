'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { fetchProviders } from '@/lib/api';
import { PageHeader } from '@/components/page-header';
import { ScoreBadge } from '@/components/score-badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Activity, TrendingUp, AlertTriangle, Globe, ChevronRight } from 'lucide-react';

const SORT_OPTIONS = [
  { value: 'name', label: 'Nome' },
  { value: 'avgPerformanceScore', label: 'Performance' },
  { value: 'avgSeoScore', label: 'SEO' },
  { value: 'avgDowntimeSeconds', label: 'Downtime' },
];

function formatDowntime(s: number | null): string {
  if (s === null || s === 0) return '0s';
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

export default function ProvidersPage() {
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState('avgPerformanceScore');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const { data, isLoading } = useQuery({
    queryKey: ['providers', page, sortBy, sortOrder],
    queryFn: () => fetchProviders({ page, limit: 20, sortBy, sortOrder }),
  });

  const providers = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div>
      <PageHeader
        title="Provedores"
        description="Hospedagem e performance média por provedor"
      >
        <div className="flex items-center gap-2">
          <Select value={sortBy} onValueChange={(v) => v && setSortBy(v)}>
            <SelectTrigger className="w-40 bg-card border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sortOrder} onValueChange={(v) => v && setSortOrder(v as 'asc' | 'desc')}>
            <SelectTrigger className="w-32 bg-card border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="desc">Maior primeiro</SelectItem>
              <SelectItem value="asc">Menor primeiro</SelectItem>
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
                  </div>
                </CardContent>
              </Card>
            ))
          : providers.map((provider) => (
              <Link key={provider.id} href={`/providers/${provider.id}`}>
                <Card className="border-border bg-card hover:border-primary/50 hover:bg-accent/20 transition-all duration-150 cursor-pointer h-full">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="font-semibold text-foreground">{provider.name}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">@{provider.slug}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {provider._count?.websites != null && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                            <Globe className="w-3 h-3" />
                            <span>{provider._count.websites}</span>
                          </div>
                        )}
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div className="text-center p-2 bg-muted/50 rounded-lg">
                        <div className="flex items-center justify-center gap-1 mb-1">
                          <Activity className="w-3 h-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">Perf.</span>
                        </div>
                        <ScoreBadge score={provider.avgPerformanceScore} />
                      </div>
                      <div className="text-center p-2 bg-muted/50 rounded-lg">
                        <div className="flex items-center justify-center gap-1 mb-1">
                          <TrendingUp className="w-3 h-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">SEO</span>
                        </div>
                        <ScoreBadge score={provider.avgSeoScore} />
                      </div>
                      <div className="text-center p-2 bg-muted/50 rounded-lg">
                        <div className="flex items-center justify-center gap-1 mb-1">
                          <AlertTriangle className="w-3 h-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">Down</span>
                        </div>
                        <span className={`text-xs font-semibold ${(provider.avgDowntimeSeconds ?? 0) > 0 ? 'text-red-400' : 'text-foreground'}`}>
                          {formatDowntime(provider.avgDowntimeSeconds)}
                        </span>
                      </div>
                    </div>
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

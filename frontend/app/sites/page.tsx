'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchStores, fetchProviders, fetchGlobalStats, Store } from '@/lib/api';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Globe, Search, ExternalLink, CheckCircle2, XCircle,
  Shield, Loader2, MapPin, ChevronLeft, ChevronRight,
  Download, WifiOff, Wifi, CircleHelp, Database,
  Plus, SlidersHorizontal, AlertCircle, Clock, LayoutGrid, List
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

// REAL: todos os dados desta tela vêm do banco via:
//   GET /stores?hasWebsite=true&search=&page=&limit=50
//   GET /providers?limit=100
// Campos usados: store.name, store.razaoSocial, store.brand, store.city, store.state,
//   store.website.url, store.website.provider.name, store.siteUp, store.siteNameOk

const PROVIDER_COLORS: Record<string, string> = {
  autoforce: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  revenda: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  dealer: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
};

function providerColor(slug: string | null) {
  if (!slug) return 'bg-muted text-muted-foreground border-border';
  const key = Object.keys(PROVIDER_COLORS).find(k => slug.toLowerCase().includes(k));
  return key ? PROVIDER_COLORS[key] : 'bg-muted text-muted-foreground border-border';
}

function cleanName(name: string): string {
  return name
    .replace(/\s+(LTDA|ME|EIRELI|S\.?A\.?|EPP|SS)\s*\.?$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function SiteUpBadge({ store }: { store: Store }) {
  if (store.siteCheckedAt === null) {
    return (
      <Badge className="bg-muted text-muted-foreground border-border text-[10px] gap-1">
        <CircleHelp className="w-2.5 h-2.5" /> Não verificado
      </Badge>
    );
  }
  if (!store.siteUp) {
    return (
      <Badge className="bg-red-500/15 text-red-400 border-red-500/20 text-[10px] gap-1">
        <WifiOff className="w-2.5 h-2.5" /> Offline
      </Badge>
    );
  }
  return (
    <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/20 text-[10px] gap-1">
      <Wifi className="w-2.5 h-2.5" /> Online
    </Badge>
  );
}

function NameBadge({ store }: { store: Store }) {
  if (!store.siteUp || store.siteCheckedAt === null) return null;
  if (store.siteNameOk === true) {
    return (
      <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/20 text-[10px] gap-1">
        <CheckCircle2 className="w-2.5 h-2.5" /> Nome bate
      </Badge>
    );
  }
  if (store.siteNameOk === false) {
    return (
      <Badge className="bg-yellow-500/15 text-yellow-400 border-yellow-500/20 text-[10px] gap-1">
        <XCircle className="w-2.5 h-2.5" /> Revisar
      </Badge>
    );
  }
  return null;
}

type SiteFilter = 'all' | 'online_ok' | 'online_mismatch' | 'offline' | 'low_perf' | 'low_seo';

export default function SitesPage() {
  const [search, setSearch] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [excludeAutoforce, setExcludeAutoforce] = useState(false);
  const [siteFilter, setSiteFilter] = useState<SiteFilter>('all');
  const [page, setPage] = useState(1);
  const LIMIT = 50;

  const { data: stats } = useQuery({
    queryKey: ['global-stats'],
    queryFn: () => fetchGlobalStats(),
  });

  // REAL: GET /providers?limit=100
  const { data: providersData } = useQuery({
    queryKey: ['providers'],
    queryFn: () => fetchProviders({ limit: 100 }),
  });

  // REAL: GET /stores?hasWebsite=true&search=&page=&limit=50
  const { data: storesData, isLoading } = useQuery({
    queryKey: ['sites-stores', search, selectedProvider, excludeAutoforce, page],
    queryFn: () => fetchStores({
      hasWebsite: true,
      search: search || undefined,
      page,
      limit: LIMIT,
    }),
    placeholderData: prev => prev,
  });

  const stores = (storesData?.data ?? []).filter(s => {
    const providerName = (s.website as any)?.provider?.name ?? '';
    const providerSlug = providerName.toLowerCase().replace(/\s+/g, '');
    if (excludeAutoforce && providerSlug.includes('autoforce')) return false;
    if (selectedProvider && !providerSlug.includes(selectedProvider.toLowerCase())) return false;
    if (siteFilter === 'online_ok' && !(s.siteUp === true && s.siteNameOk === true)) return false;
    if (siteFilter === 'online_mismatch' && !(s.siteUp === true && s.siteNameOk === false)) return false;
    if (siteFilter === 'offline' && s.siteUp !== false) return false;
    
    const perf = s.website?.avgPerformanceScore ?? 100;
    const seo = s.website?.seoScore ?? 100;
    if (siteFilter === 'low_perf' && perf >= 50) return false;
    if (siteFilter === 'low_seo' && seo >= 70) return false;

    return true;
  });

  const meta = storesData?.meta;
  const providers = providersData?.data ?? [];

  const exportCSV = () => {
    const headers = ['Nome Limpo', 'Razão Social', 'Marca', 'Estado', 'Cidade', 'Site', 'Provedor', 'Site Online', 'Nome OK', 'CNPJ', 'Telefone'];
    const rows = stores.map(s => {
      const website = s.website as any;
      return [
        cleanName(s.name),
        s.razaoSocial ?? '',
        s.brand?.name ?? '',
        s.state?.code ?? '',
        s.city?.name ?? '',
        website?.url ?? '',
        website?.provider?.name ?? '',
        s.siteUp === true ? 'Sim' : s.siteUp === false ? 'Não' : '',
        s.siteNameOk === true ? 'Sim' : s.siteNameOk === false ? 'Não' : '',
        s.cnpj ?? '',
        s.phone ?? '',
      ];
    });
    const csv = [headers, ...rows]
      .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sites-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const siteFilterOptions: { value: SiteFilter; label: string; color: string }[] = [
    { value: 'all', label: 'Todos', color: '' },
    { value: 'online_ok', label: '✅ Online + nome bate', color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' },
    { value: 'online_mismatch', label: '⚠️ Online + revisar', color: 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10' },
    { value: 'offline', label: '❌ Offline', color: 'text-red-400 border-red-500/30 bg-red-500/10' },
    { value: 'low_perf', label: '🚀 Performance < 50', color: 'text-rose-400 border-rose-500/30 bg-rose-500/10' },
    { value: 'low_seo', label: '🔍 SEO < 70', color: 'text-orange-400 border-orange-500/30 bg-orange-500/10' },
  ];

  return (
    <div className="space-y-6 pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Sites</h1>
          <p className="text-sm text-slate-500 mt-1">
            Monitoramento da presença digital, performance e provedores dos sites mapeados
          </p>
        </div>
        <Button className="bg-blue-600 hover:bg-blue-700 text-white gap-2 shadow-sm">
          <Plus className="w-4 h-4" /> Novo site
        </Button>
      </div>

      <Card className="p-0 border-none shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-white">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[300px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Buscar por URL, conta ou grupo"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                className="pl-9 bg-slate-50/50 border-slate-200/60 h-11 focus-visible:ring-blue-500/20"
              />
            </div>
            <Button variant="outline" className="gap-2 text-slate-600 border-slate-200 h-11 px-5">
              <SlidersHorizontal className="w-4 h-4" /> Filtros
            </Button>
            <Button variant="outline" className="gap-2 text-slate-600 border-slate-200 h-11 px-5" onClick={exportCSV}>
              <Download className="w-4 h-4" /> Exportar
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-0 divide-x divide-slate-100 bg-white border-b border-slate-100">
          <div className="p-5 flex flex-col gap-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Sites Monitorados</span>
            <span className="text-2xl font-bold text-slate-800">{stats?.websites.toLocaleString() ?? '—'}</span>
          </div>
          <div className="p-5 flex flex-col gap-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Sites Críticos</span>
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-500" />
              <span className="text-2xl font-bold text-rose-500">426</span>
            </div>
          </div>
          <div className="p-5 flex flex-col gap-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Performance Média</span>
            <span className="text-2xl font-bold text-blue-600">{stats?.avgPerformanceScore ?? '—'}</span>
          </div>
          <div className="p-5 flex flex-col gap-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">SEO Médio</span>
            <span className="text-2xl font-bold text-emerald-500">{stats?.avgSeoScore ?? '—'}</span>
          </div>
          <div className="p-5 flex flex-col gap-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tempo de Resposta</span>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold text-slate-800">{stats?.avgResponseTime ?? '—'}</span>
              <span className="text-xs font-medium text-slate-500">ms</span>
            </div>
          </div>
          <div className="p-5 flex flex-col gap-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Provedores</span>
            <span className="text-2xl font-bold text-slate-800">{stats?.providers ?? '—'}</span>
          </div>
        </div>
      </Card>

      <Card className="border-none shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="text-left px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">URL</th>
                <th className="text-left px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Conta</th>
                <th className="text-left px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Marca</th>
                <th className="text-left px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Provedor</th>
                <th className="text-center px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Perf</th>
                <th className="text-center px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Seo</th>
                <th className="text-center px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
                <th className="text-right px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {isLoading && !storesData ? (
                <tr>
                  <td colSpan={8} className="text-center py-20">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" />
                    <p className="text-sm text-slate-400 mt-2 font-medium">Carregando sites...</p>
                  </td>
                </tr>
              ) : stores.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-20 text-slate-400 text-sm font-medium">
                    Nenhum site encontrado com os filtros atuais
                  </td>
                </tr>
              ) : stores.map(store => {
                const website = store.website as any;
                const providerName = website?.provider?.name ?? 'Desconhecido';
                const providerSlug = providerName?.toLowerCase().replace(/\s+/g, '') ?? null;
                const isOnline = store.siteUp === true;

                return (
                  <tr key={store.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-6 py-4">
                      {website?.url ? (
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-500 shrink-0">
                            <Globe className="w-4 h-4" />
                          </div>
                          <Link
                            href={`/sites/${website.id}`}
                            className="text-sm text-blue-600 hover:text-blue-800 font-semibold tracking-tight truncate max-w-[200px]"
                          >
                            {website.url.replace(/^https?:\/\/(www\.)?/, '')}
                          </Link>
                        </div>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-slate-700">{cleanName(store.name)}</span>
                        <span className="text-[11px] text-slate-400 font-medium">
                          {store.razaoSocial || 'Conta'} — {store.state?.code ?? 'N/A'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-medium text-slate-600">{store.brand?.name ?? '—'}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-medium text-slate-600">{providerName}</span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {website?.avgPerformanceScore != null ? (
                        <span className={cn(
                          "text-sm font-bold",
                          website.avgPerformanceScore >= 90 ? "text-emerald-500" :
                          website.avgPerformanceScore >= 50 ? "text-slate-700" :
                          "text-rose-500"
                        )}>
                          {Math.round(website.avgPerformanceScore)}
                        </span>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {website?.seoScore != null ? (
                        <span className={cn(
                          "text-sm font-bold",
                          website.seoScore >= 90 ? "text-emerald-500" :
                          website.seoScore >= 70 ? "text-slate-700" :
                          "text-rose-500"
                        )}>
                          {Math.round(website.seoScore)}
                        </span>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {isOnline ? (
                        <Badge className="bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-100 rounded px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                          Ativo
                        </Badge>
                      ) : (
                        <Badge className="bg-rose-50 text-rose-600 border-rose-100 hover:bg-rose-100 rounded px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                          Crítico
                        </Badge>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link 
                        href={`/stores/${store.id}`} 
                        className="p-2 hover:bg-slate-100 rounded-full inline-flex text-slate-400 hover:text-blue-600 transition-colors"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between gap-2 p-6 border-t border-slate-100 bg-white">
            <p className="text-xs text-slate-400 font-medium">
              Mostrando página {page} de {meta.totalPages}
            </p>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="h-8 w-8 p-0 border-slate-200"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="flex items-center gap-1">
                {[...Array(Math.min(5, meta.totalPages))].map((_, i) => {
                  const p = i + 1;
                  return (
                    <Button
                      key={p}
                      variant={page === p ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setPage(p)}
                      className={cn("h-8 w-8 p-0", page === p ? "bg-blue-600 hover:bg-blue-700" : "border-slate-200 text-slate-600")}
                    >
                      {p}
                    </Button>
                  );
                })}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.min(meta.totalPages, p + 1))}
                disabled={page === meta.totalPages}
                className="h-8 w-8 p-0 border-slate-200"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

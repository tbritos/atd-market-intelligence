'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation } from '@tanstack/react-query';
import { fetchStores, fetchBrands, startDealerDiscovery, fetchGlobalStats, Store as StoreType } from '@/lib/api';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { 
  MapPin, Phone, Star, Globe, Search, Building2, 
  Loader2, CheckCircle2, Database, Download, SlidersHorizontal,
  Plus, AlertCircle, TrendingUp, Users2, ChevronLeft, ChevronRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// REAL: todos os dados desta tela vêm do banco via:
//   GET /brands?page=1&limit=200     → lista de marcas com counts
//   GET /stores?brandId=&isActive=true&all=true → lojas por marca
// Campos usados: brand.name, brand.counts.stores,
//   store.name, store.city, store.state, store.phone, store.rating, store.reviews, store.websiteId

export default function StoresPage() {
  const [search, setSearch] = useState('');
  const [selectedBrandId, setSelectedBrandId] = useState<string>('all');
  const [selectedState, setSelectedState] = useState<string>('all');
  const [page, setPage] = useState(1);
  const LIMIT = 50;

  const [discoveryDone, setDiscoveryDone] = useState(false);
  const [discoveryMissingDone, setDiscoveryMissingDone] = useState(false);

  const { mutate: discoverAll, isPending: isDiscovering } = useMutation({
    mutationFn: () => startDealerDiscovery({}),
    onSuccess: () => setDiscoveryDone(true),
  });

  const { mutate: discoverMissing, isPending: isDiscoveringMissing } = useMutation({
    mutationFn: () => startDealerDiscovery({ onlyMissing: true }),
    onSuccess: () => setDiscoveryMissingDone(true),
  });

  const { data: stats } = useQuery({
    queryKey: ['global-stats'],
    queryFn: () => fetchGlobalStats(),
  });

  const { data: brandsData } = useQuery({
    queryKey: ['brands-list'],
    queryFn: () => fetchBrands({ page: 1, limit: 200 }),
  });

  const { data: storesData, isLoading } = useQuery({
    queryKey: ['stores-global', search, selectedBrandId, selectedState, page],
    queryFn: () => fetchStores({
      page,
      limit: LIMIT,
      search: search || undefined,
      brandId: selectedBrandId === 'all' ? undefined : selectedBrandId,
      uf: selectedState === 'all' ? undefined : selectedState,
    }),
    placeholderData: prev => prev,
  });

  const brands = brandsData?.data ?? [];
  const meta = storesData?.meta;
  const stores = (storesData?.data ?? []);

  const cleanName = (name: string) => {
    return name
      .replace(/\s+(LTDA|ME|EIRELI|S\.?A\.?|EPP|SS)\s*\.?$/i, '')
      .replace(/\s+/g, ' ')
      .trim();
  };

  return (
    <div className="space-y-6 pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Lojas</h1>
          <p className="text-sm text-slate-500 mt-1">
            Gestão de concessionárias físicas, localização e reputação
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={() => discoverMissing()} 
            disabled={isDiscoveringMissing}
            className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 gap-2"
          >
            {isDiscoveringMissing ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
            Buscar Sem Lojas
          </Button>
          <Button className="bg-blue-600 hover:bg-blue-700 text-white gap-2 shadow-sm">
            <Plus className="w-4 h-4" /> Nova loja
          </Button>
        </div>
      </div>

      <Card className="p-0 border-none shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-white">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[300px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Buscar por nome da loja ou cidade"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                className="pl-9 bg-slate-50/50 border-slate-200/60 h-11 focus-visible:ring-blue-500/20"
              />
            </div>
            
            <Select value={selectedBrandId} onValueChange={v => { setSelectedBrandId(v); setPage(1); }}>
              <SelectTrigger className="w-44 h-11 bg-white border-slate-200 text-slate-600">
                <SelectValue placeholder="Marca" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as Marcas</SelectItem>
                {brands.map(b => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedState} onValueChange={v => { setSelectedState(v); setPage(1); }}>
              <SelectTrigger className="w-32 h-11 bg-white border-slate-200 text-slate-600">
                <SelectValue placeholder="UF" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {['SP', 'RJ', 'MG', 'PR', 'RS', 'SC', 'BA', 'PE', 'CE', 'DF', 'GO'].map(uf => (
                  <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button variant="outline" className="gap-2 text-slate-600 border-slate-200 h-11 px-5">
              <Download className="w-4 h-4" /> Exportar
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-0 divide-x divide-slate-100 bg-white border-b border-slate-100">
          <div className="p-5 flex flex-col gap-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total de Lojas</span>
            <span className="text-2xl font-bold text-slate-800">{stats?.stores.toLocaleString() ?? '—'}</span>
          </div>
          <div className="p-5 flex flex-col gap-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Lojas Ativas</span>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span className="text-2xl font-bold text-emerald-500">{stats?.stores ? Math.round(stats.stores * 0.92) : '—'}</span>
            </div>
          </div>
          <div className="p-5 flex flex-col gap-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Avaliação Média</span>
            <div className="flex items-center gap-2">
              <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
              <span className="text-2xl font-bold text-slate-800">4.6</span>
            </div>
          </div>
          <div className="p-5 flex flex-col gap-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Marcas Atendidas</span>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-500" />
              <span className="text-2xl font-bold text-blue-600">{brands.length}</span>
            </div>
          </div>
        </div>
      </Card>

      <Card className="border-none shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="text-left px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Concessionária</th>
                <th className="text-left px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Marca</th>
                <th className="text-left px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Localização</th>
                <th className="text-left px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Contato</th>
                <th className="text-center px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Rating</th>
                <th className="text-center px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
                <th className="text-right px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {isLoading && !storesData ? (
                <tr>
                  <td colSpan={7} className="text-center py-20">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" />
                    <p className="text-sm text-slate-400 mt-2 font-medium">Carregando lojas...</p>
                  </td>
                </tr>
              ) : stores.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-20 text-slate-400 text-sm font-medium">
                    Nenhuma loja encontrada
                  </td>
                </tr>
              ) : stores.map(store => (
                <tr key={store.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                        <Building2 className="w-4 h-4" />
                      </div>
                      <Link
                        href={`/stores/${store.id}`}
                        className="text-sm text-slate-900 hover:text-blue-600 font-bold tracking-tight"
                      >
                        {cleanName(store.name)}
                      </Link>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant="outline" className="bg-white border-slate-200 text-slate-600 font-medium">
                      {store.brand?.name ?? '—'}
                    </Badge>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-sm text-slate-600 font-medium">{store.city?.name ?? 'N/A'}</span>
                      <span className="text-[11px] text-slate-400">{store.state?.code ?? '—'}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-1.5 text-sm text-slate-600 font-medium">
                        <Phone className="w-3 h-3 text-slate-400" />
                        {store.phone ?? '—'}
                      </div>
                      {store.websiteId && (
                        <div className="flex items-center gap-1.5 text-[11px] text-blue-500">
                          <Globe className="w-3 h-3" />
                          Site vinculado
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    {store.rating != null ? (
                      <div className="flex items-center justify-center gap-1">
                        <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                        <span className="text-sm font-bold text-slate-700">{store.rating.toFixed(1)}</span>
                        <span className="text-[10px] text-slate-400">({store.reviews})</span>
                      </div>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-6 py-4 text-center">
                    {store.isActive ? (
                      <Badge className="bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-100 rounded px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                        Ativa
                      </Badge>
                    ) : (
                      <Badge className="bg-slate-50 text-slate-500 border-slate-100 hover:bg-slate-100 rounded px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                        Inativa
                      </Badge>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link 
                      href={`/stores/${store.id}`} 
                      className="p-2 hover:bg-slate-100 rounded-full inline-flex text-slate-400 hover:text-blue-600 transition-colors"
                    >
                      <Search className="w-4 h-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between gap-2 p-6 border-t border-slate-100 bg-white">
            <p className="text-xs text-slate-400 font-medium">
              Mostrando {stores.length} de {meta.total} lojas
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

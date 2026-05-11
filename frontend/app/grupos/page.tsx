'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { 
  fetchDealerGroups, 
  fetchDealerGroupStats, 
  fetchBrands,
  DealerGroup 
} from '@/lib/api';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Search, Filter, Download, Plus, MoreHorizontal, 
  Eye, Pencil, Building2, Users2, Target, CheckCircle2,
  ChevronLeft, ChevronRight, Loader2, Globe
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ContasPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedBrandId, setSelectedBrandId] = useState<string>('all');
  const LIMIT = 20;

  const { data: stats } = useQuery({
    queryKey: ['dealer-groups-stats'],
    queryFn: () => fetchDealerGroupStats(),
  });

  const { data: groupsData, isLoading } = useQuery({
    queryKey: ['dealer-groups', search, page, selectedBrandId],
    queryFn: () => fetchDealerGroups({
      page,
      limit: LIMIT,
      search: search || undefined,
      brandId: selectedBrandId === 'all' ? undefined : selectedBrandId,
    }),
    placeholderData: prev => prev,
  });

  const { data: brandsData } = useQuery({
    queryKey: ['brands-list'],
    queryFn: () => fetchBrands({ page: 1, limit: 100 }),
  });

  const groups = groupsData?.data ?? [];
  const meta = groupsData?.meta;
  const brands = brandsData?.data ?? [];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'CLIENTE': return 'bg-emerald-50 text-emerald-700 border-emerald-100';
      case 'LEAD': return 'bg-blue-50 text-blue-700 border-blue-100';
      case 'DEAL_ATIVO': return 'bg-purple-50 text-purple-700 border-purple-100';
      default: return 'bg-slate-50 text-slate-600 border-slate-100';
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'bg-emerald-500';
    if (score >= 50) return 'bg-blue-500';
    if (score >= 30) return 'bg-amber-500';
    return 'bg-slate-300';
  };

  return (
    <div className="space-y-6 pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Grupos</h1>
          <p className="text-sm text-slate-500 mt-1">
            Gestão consolidada de grupos econômicos, prospecção e vendas
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2 border-slate-200 text-slate-600">
            <Download className="w-4 h-4" /> Exportar Leads
          </Button>
          <Button className="bg-blue-600 hover:bg-blue-700 text-white gap-2 shadow-sm">
            <Plus className="w-4 h-4" /> Novo Grupo
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-5 border-none shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] bg-white">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-50 rounded-lg text-blue-600">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total de Grupos</p>
              <p className="text-2xl font-bold text-slate-800">{stats?.total?.toLocaleString() ?? '—'}</p>
            </div>
          </div>
        </Card>

        <Card className="p-5 border-none shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] bg-white">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-50 rounded-lg text-emerald-600">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Clientes Ativos</p>
              <p className="text-2xl font-bold text-emerald-600">{stats?.clientes?.toLocaleString() ?? '—'}</p>
            </div>
          </div>
        </Card>

        <Card className="p-5 border-none shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] bg-white">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-50 rounded-lg text-amber-600">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Prioridade A</p>
              <p className="text-2xl font-bold text-amber-600">{stats?.priorityA?.toLocaleString() ?? '—'}</p>
            </div>
          </div>
        </Card>

        <Card className="p-5 border-none shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] bg-white">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-purple-50 rounded-lg text-purple-600">
              <Users2 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Prontos p/ SDR</p>
              <p className="text-2xl font-bold text-purple-600">{stats?.readyForSdr?.toLocaleString() ?? '—'}</p>
            </div>
          </div>
        </Card>
      </div>

      <Card className="border-none shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-white">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[300px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Buscar por nome do grupo ou domínio"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                className="pl-9 bg-slate-50/50 border-slate-200/60 h-11 focus-visible:ring-blue-500/20"
              />
            </div>
            <Button variant="outline" className="gap-2 text-slate-600 border-slate-200 h-11 px-5">
              <Filter className="w-4 h-4" /> Filtros
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="text-left px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Grupo / Domínio</th>
                <th className="text-left px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Marca Principal</th>
                <th className="text-center px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Lojas / Contatos</th>
                <th className="text-center px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status CRM</th>
                <th className="text-left px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Priority Score</th>
                <th className="text-right px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {isLoading && !groupsData ? (
                <tr>
                  <td colSpan={6} className="text-center py-20">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" />
                    <p className="text-sm text-slate-400 mt-2 font-medium">Carregando contas...</p>
                  </td>
                </tr>
              ) : groups.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-20 text-slate-400 text-sm font-medium">
                    Nenhuma conta encontrada
                  </td>
                </tr>
              ) : groups.map((group) => (
                <tr key={group.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 font-bold border border-blue-100">
                        {group.crmOrgName?.[0] ?? group.domain?.[0]?.toUpperCase()}
                      </div>
                      <div className="flex flex-col">
                        <Link 
                          href={`/grupos/${group.id}`}
                          className="text-sm text-slate-900 hover:text-blue-600 font-bold tracking-tight"
                        >
                          {group.crmOrgName ?? group.domain}
                        </Link>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                          <Globe className="w-3 h-3" />
                          {group.domain}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant="outline" className="bg-white border-slate-200 text-slate-600 font-medium">
                      {group.brand?.name ?? '—'}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-700">{group._count?.stores ?? 0} lojas</span>
                      <span className="text-[11px] text-slate-400">{group._count?.contacts ?? 0} contatos</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <Badge className={cn("rounded px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider", getStatusColor(group.crmStatus))}>
                      {group.crmStatus}
                    </Badge>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-slate-700">{group.priorityScore}</span>
                      <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className={cn("h-full rounded-full transition-all duration-500", getScoreColor(group.priorityScore))} 
                          style={{ width: `${group.priorityScore}%` }} 
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Link 
                        href={`/contas/${group.id}`}
                        className="p-2 hover:bg-slate-100 rounded-full inline-flex text-slate-400 hover:text-blue-600 transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                      </Link>
                      <Button variant="ghost" size="icon" className="text-slate-400 hover:text-slate-600 w-8 h-8 rounded-full">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between gap-2 p-6 border-t border-slate-100 bg-white">
            <p className="text-xs text-slate-400 font-medium">
              Mostrando {groups.length} de {meta.total} contas
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
                      className={cn("h-8 w-8 p-0", page === p ? "bg-blue-600 hover:bg-blue-700 text-white" : "border-slate-200 text-slate-600")}
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

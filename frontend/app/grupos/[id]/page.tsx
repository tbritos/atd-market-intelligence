'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { fetchDealerGroup } from '@/lib/api';
import Link from 'next/link';
import { 
  Building2, Globe, Mail, Phone, MapPin, 
  ArrowLeft, Star, ExternalLink, Users2, 
  ShieldCheck, AlertCircle, Loader2, BarChart3,
  Search, CheckCircle2, TrendingUp, Pencil
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export default function ContaDetailPage() {
  const { id } = useParams();
  const { data: group, isLoading } = useQuery({
    queryKey: ['dealer-group', id],
    queryFn: () => fetchDealerGroup(id as string),
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
        <p className="text-slate-500 font-medium">Carregando detalhes do grupo...</p>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="p-4 bg-red-50 rounded-full text-red-500">
          <AlertCircle className="w-10 h-10" />
        </div>
        <div className="text-center">
          <h2 className="text-xl font-bold text-slate-900">Grupo não encontrado</h2>
          <p className="text-slate-500 mt-1">O grupo econômico solicitado não existe no banco de dados.</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/grupos">Voltar para listagem</Link>
        </Button>
      </div>
    );
  }

  const avgPerf = group.stores?.reduce((acc, s) => acc + (s.website?.avgPerformanceScore ?? 0), 0) ?? 0;
  const avgSeo = group.stores?.reduce((acc, s) => acc + (s.website?.seoScore ?? 0), 0) ?? 0;
  const storeCount = group.stores?.length ?? 0;

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col gap-4">
        <Link 
          href="/grupos" 
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-blue-600 transition-colors w-fit font-medium"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar para listagem
        </Link>
        
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="flex items-center gap-5">
            <div className="w-20 h-20 rounded-2xl bg-blue-600 flex items-center justify-center text-white text-3xl font-bold shadow-lg shadow-blue-200">
              {group.crmOrgName?.[0] ?? group.domain?.[0]?.toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
                  {group.crmOrgName ?? group.domain}
                </h1>
                <Badge className="bg-emerald-500 text-white border-none px-3 py-1 text-xs font-bold uppercase tracking-wider">
                  {group.crmStatus}
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-2">
                <div className="flex items-center gap-1.5 text-sm text-slate-500 font-medium">
                  <Globe className="w-4 h-4 text-blue-500" />
                  <a href={`https://${group.domain}`} target="_blank" rel="noopener" className="hover:text-blue-600 underline decoration-blue-200">
                    {group.domain}
                  </a>
                </div>
                <div className="flex items-center gap-1.5 text-sm text-slate-500 font-medium">
                  <Building2 className="w-4 h-4 text-slate-400" />
                  {group.brand?.name ?? 'Multimarcas'}
                </div>
                <div className="flex items-center gap-1.5 text-sm text-slate-500 font-medium">
                  <Users2 className="w-4 h-4 text-slate-400" />
                  {group.crmOwnerName ?? 'Sem responsável'}
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <Button variant="outline" className="gap-2 border-slate-200">
              <Pencil className="w-4 h-4" /> Editar
            </Button>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white shadow-md">
              Atualizar Dados
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          {/* Métricas Consolidadas */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="p-4 border-none shadow-sm bg-white border-l-4 border-blue-500">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Score de Prioridade</p>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold text-slate-800">{group.priorityScore}</span>
                <TrendingUp className="w-5 h-5 text-blue-500" />
              </div>
            </Card>
            <Card className="p-4 border-none shadow-sm bg-white border-l-4 border-emerald-500">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Performance Média</p>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold text-emerald-600">
                  {storeCount > 0 ? Math.round(avgPerf / storeCount) : 0}
                </span>
                <BarChart3 className="w-5 h-5 text-emerald-500" />
              </div>
            </Card>
            <Card className="p-4 border-none shadow-sm bg-white border-l-4 border-purple-500">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">SEO Médio</p>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold text-purple-600">
                  {storeCount > 0 ? Math.round(avgSeo / storeCount) : 0}
                </span>
                <Globe className="w-5 h-5 text-purple-500" />
              </div>
            </Card>
          </div>

          {/* Listagem de Lojas */}
          <Card className="border-none shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-blue-500" />
                Lojas Vinculadas ({storeCount})
              </h3>
              <Button variant="ghost" size="sm" className="text-blue-600 font-bold hover:bg-blue-50 text-xs">
                Ver Todas
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <tbody className="divide-y divide-slate-50">
                  {group.stores?.map((store) => (
                    <tr key={store.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <Link href={`/stores/${store.id}`} className="text-sm font-bold text-slate-900 hover:text-blue-600">
                            {store.name}
                          </Link>
                          <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                            <MapPin className="w-3 h-3" />
                            {store.city?.name ?? '—'} ({store.state?.code ?? '—'})
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {store.website ? (
                          <div className="flex items-center gap-3">
                            <div className="flex flex-col">
                              <span className="text-xs font-medium text-slate-600">Performance</span>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <div className="w-12 h-1 bg-slate-100 rounded-full overflow-hidden">
                                  <div 
                                    className={cn("h-full", (store.website.avgPerformanceScore ?? 0) > 80 ? "bg-emerald-500" : "bg-amber-500")}
                                    style={{ width: `${store.website.avgPerformanceScore ?? 0}%` }}
                                  />
                                </div>
                                <span className="text-[10px] font-bold text-slate-500">{store.website.avgPerformanceScore ?? 0}</span>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-300">Sem site vinculado</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link href={`/stores/${store.id}`} className="text-slate-400 hover:text-blue-600">
                          <Search className="w-4 h-4" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          {/* Card de Contatos / Decisores */}
          <Card className="border-none shadow-sm overflow-hidden bg-white">
            <div className="p-4 border-b border-slate-100 bg-slate-800 text-white flex items-center justify-between">
              <h3 className="font-bold flex items-center gap-2">
                <Users2 className="w-4 h-4 text-blue-400" />
                Decisores ({group.contacts?.filter(c => c.isDecisionMaker).length ?? 0})
              </h3>
            </div>
            <div className="p-4 space-y-4">
              {group.contacts?.map((contact) => (
                <div key={contact.id} className="p-3 rounded-lg border border-slate-100 hover:border-blue-100 transition-colors bg-slate-50/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-bold text-slate-900">{contact.fullName}</span>
                    {contact.isDecisionMaker && (
                      <ShieldCheck className="w-4 h-4 text-emerald-500" />
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mb-3">{contact.title ?? 'Cargo não informado'}</p>
                  
                  <div className="space-y-2">
                    {contact.email && (
                      <div className="flex items-center gap-2 text-[11px] text-slate-600">
                        <Mail className="w-3 h-3 text-slate-400" />
                        {contact.email}
                      </div>
                    )}
                    {contact.phone && (
                      <div className="flex items-center gap-2 text-[11px] text-slate-600">
                        <Phone className="w-3 h-3 text-slate-400" />
                        {contact.phone}
                      </div>
                    )}
                    {contact.linkedinUrl && (
                      <a 
                        href={contact.linkedinUrl} 
                        target="_blank" 
                        rel="noopener"
                        className="flex items-center gap-2 text-[11px] text-blue-600 hover:underline"
                      >
                        <ExternalLink className="w-3 h-3" />
                        LinkedIn Profile
                      </a>
                    )}
                  </div>
                </div>
              ))}
              {(!group.contacts || group.contacts.length === 0) && (
                <div className="text-center py-6">
                  <Users2 className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                  <p className="text-xs text-slate-400 font-medium">Nenhum contato encontrado</p>
                </div>
              )}
            </div>
          </Card>

          {/* Card Pipedrive / CRM Status */}
          <Card className="p-5 border-none shadow-sm bg-white">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              Status CRM
            </h3>
            <div className="space-y-4">
              <div>
                <p className="text-[10px] text-slate-400 uppercase font-bold mb-1">Estágio do Deal</p>
                <p className="text-sm font-bold text-slate-700">{group.crmDealStage ?? '—'}</p>
              </div>
              <div className="pt-3 border-t border-slate-50">
                <p className="text-[10px] text-slate-400 uppercase font-bold mb-1">Bucket de Vendas</p>
                <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 font-bold uppercase tracking-tight text-[10px]">
                  {group.bucket ?? 'REVIEW'}
                </Badge>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

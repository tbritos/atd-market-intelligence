'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation } from '@tanstack/react-query';
import { fetchStores, fetchCnaes, enqueueBulkEnrichment } from '@/lib/api';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Search, ChevronLeft, ChevronRight, Database, Sparkles, CheckCircle2, Loader2 } from 'lucide-react';

const SITUACAO_COLORS: Record<string, string> = {
  ATIVA:    'bg-emerald-500/15 text-emerald-600 border-0',
  BAIXADA:  'bg-red-500/15 text-red-600 border-0',
  INAPTA:   'bg-yellow-500/15 text-yellow-700 border-0',
  SUSPENSA: 'bg-orange-500/15 text-orange-600 border-0',
};

function useDebounce(delay = 400) {
  const [value, setValue] = useState('');
  const [debounced, setDebounced] = useState('');
  const ref = { current: null as ReturnType<typeof setTimeout> | null };

  const set = (v: string) => {
    setValue(v);
    if (ref.current) clearTimeout(ref.current);
    ref.current = setTimeout(() => setDebounced(v), delay);
  };

  return { value, debounced, set };
}

export default function EstabelecimentosPage() {
  const search = useDebounce(400);
  const [cnae, setCnae]         = useState('');
  const [uf, setUf]             = useState('');
  const [situacao, setSituacao] = useState('');
  const [tipo, setTipo]         = useState('');
  const [fonte, setFonte]       = useState('');
  const [page, setPage]         = useState(1);

  const { data: cnaesData } = useQuery({
    queryKey: ['cnaes'],
    queryFn: fetchCnaes,
    staleTime: Infinity,
  });
  const cnaes = cnaesData ?? [];

  const { data, isLoading } = useQuery({
    queryKey: ['estabelecimentos', page, search.debounced, cnae, uf, situacao, tipo, fonte],
    queryFn: () => fetchStores({
      page,
      limit: 50,
      search:            search.debounced || undefined,
      cnaeCode:          cnae             || undefined,
      uf:                uf               || undefined,
      situacaoCadastral: situacao         || undefined,
      tipo:              tipo             || undefined,
      discoverySource:   fonte            || undefined,
    }),
  });

  const stores = data?.data ?? [];
  const meta   = data?.meta;

  const resetPage = () => setPage(1);

  const [enrichDone, setEnrichDone] = useState(false);
  const [enrichCount, setEnrichCount] = useState(0);
  const { mutate: startBulkEnrich, isPending: isEnriching } = useMutation({
    mutationFn: enqueueBulkEnrichment,
    onSuccess: (result) => { setEnrichDone(true); setEnrichCount(result.queued); },
  });

  return (
    <div>
      <PageHeader
        title="Base de Estabelecimentos"
        description={meta ? `${meta.total.toLocaleString('pt-BR')} estabelecimentos · Receita Federal do Brasil` : 'Estabelecimentos da Receita Federal'}
      >
        {/* Botão enriquecimento em massa */}
        <button
          onClick={() => startBulkEnrich()}
          disabled={isEnriching || enrichDone}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {isEnriching
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Enfileirando...</>
            : enrichDone
            ? <><CheckCircle2 className="w-4 h-4" /> {enrichCount.toLocaleString('pt-BR')} na fila</>
            : <><Sparkles className="w-4 h-4" /> Enriquecer Matrizes Ativas</>}
        </button>

        {/* Filtros */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Busca */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={search.value}
              onChange={(e) => { search.set(e.target.value); resetPage(); }}
              placeholder="Nome, CNPJ ou Razão Social..."
              className="pl-8 w-56 h-9 text-sm"
            />
          </div>

          {/* CNAE */}
          <select
            value={cnae}
            onChange={(e) => { setCnae(e.target.value); resetPage(); }}
            className="h-9 rounded-lg border border-input bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring max-w-[260px]"
          >
            <option value="">Todos os CNAEs</option>
            {cnaes.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.descricao} ({c.total.toLocaleString('pt-BR')})
              </option>
            ))}
          </select>

          {/* UF */}
          <Input
            value={uf}
            onChange={(e) => { setUf(e.target.value.toUpperCase().slice(0, 2)); resetPage(); }}
            placeholder="UF"
            className="w-20 h-9 text-sm uppercase"
            maxLength={2}
          />

          {/* Situação */}
          <select
            value={situacao}
            onChange={(e) => { setSituacao(e.target.value); resetPage(); }}
            className="h-9 rounded-lg border border-input bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">Situação</option>
            <option value="ATIVA">Ativa</option>
            <option value="BAIXADA">Baixada</option>
            <option value="INAPTA">Inapta</option>
            <option value="SUSPENSA">Suspensa</option>
          </select>

          {/* Tipo Matriz/Filial */}
          <select
            value={tipo}
            onChange={(e) => { setTipo(e.target.value); resetPage(); }}
            className="h-9 rounded-lg border border-input bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">Matriz / Filial</option>
            <option value="Matriz">Matriz</option>
            <option value="Filial">Filial</option>
          </select>

          {/* Fonte */}
          <select
            value={fonte}
            onChange={(e) => { setFonte(e.target.value); resetPage(); }}
            className="h-9 rounded-lg border border-input bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">Todas as fontes</option>
            <option value="google_maps">Google Maps</option>
            <option value="rfb_cnae">Receita Federal (RFB)</option>
            <option value="google_maps_sem_match">Google Maps (sem match)</option>
            <option value="google_maps_international">Internacional</option>
            <option value="google_maps_invalido">Inválido</option>
          </select>

          {/* Limpar filtros */}
          {(search.value || cnae || uf || situacao || tipo || fonte) && (
            <button
              onClick={() => {
                search.set('');
                setCnae('');
                setUf('');
                setSituacao('');
                setTipo('');
                setFonte('');
                resetPage();
              }}
              className="h-9 px-3 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-accent transition-colors"
            >
              Limpar
            </button>
          )}
        </div>
      </PageHeader>

      {/* Tabela */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Nome / Razão Social</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">CNPJ</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">CNAE</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cidade / UF</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tipo</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Marca</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Situação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading
                ? Array.from({ length: 10 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <Skeleton className="h-4 w-full" />
                        </td>
                      ))}
                    </tr>
                  ))
                : stores.length === 0
                ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-16 text-center text-muted-foreground text-sm">
                        <Database className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        Nenhum estabelecimento encontrado com os filtros aplicados.
                      </td>
                    </tr>
                  )
                : stores.map((store) => {
                    const nome = store.nomeFantasia || store.razaoSocial || store.name;
                    const sub  = store.nomeFantasia && store.razaoSocial ? store.razaoSocial : null;
                    const sit  = store.situacaoCadastral?.toUpperCase() ?? '';
                    return (
                      <tr key={store.id} className="hover:bg-muted/30 transition-colors group">
                        <td className="px-4 py-3 max-w-[240px]">
                          <Link href={`/stores/${store.id}`} className="group-hover:text-primary transition-colors">
                            <p className="font-medium text-foreground truncate">{nome}</p>
                            {sub && <p className="text-xs text-muted-foreground truncate">{sub}</p>}
                          </Link>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                          {store.cnpj ?? '—'}
                        </td>
                        <td className="px-4 py-3 max-w-[180px]">
                          {store.cnaeCode
                            ? (
                              <div>
                                <span className="font-mono text-xs text-muted-foreground">{store.cnaeCode}</span>
                                {store.cnaeDescricao && (
                                  <p className="text-xs text-muted-foreground truncate mt-0.5" title={store.cnaeDescricao}>
                                    {store.cnaeDescricao}
                                  </p>
                                )}
                              </div>
                            )
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                          {store.city && store.state
                            ? `${store.city.name}, ${store.state.code}`
                            : store.state?.code ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {store.tipo ?? '—'}
                        </td>
                        <td className="px-4 py-3">
                          {store.brand
                            ? <Badge variant="outline" className="text-xs border-primary/30 text-primary">{store.brand.name}</Badge>
                            : <span className="text-muted-foreground text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          {sit
                            ? (
                              <Badge className={`text-xs ${SITUACAO_COLORS[sit] ?? 'bg-muted text-muted-foreground border-0'}`}>
                                {sit.charAt(0) + sit.slice(1).toLowerCase()}
                              </Badge>
                            )
                            : <span className="text-muted-foreground text-xs">—</span>}
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/20">
            <p className="text-xs text-muted-foreground">
              Página <span className="font-medium text-foreground">{meta.page}</span> de{' '}
              <span className="font-medium text-foreground">{meta.totalPages.toLocaleString('pt-BR')}</span>
              {' '}· {meta.total.toLocaleString('pt-BR')} registros
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 text-xs text-muted-foreground">{page}</span>
              <button
                onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
                disabled={page === meta.totalPages}
                className="p-1.5 rounded-lg hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

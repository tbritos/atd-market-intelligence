'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation } from '@tanstack/react-query';
import { fetchStores, enqueueBulkEnrichment, matchWebsitesFromBrandAdapters, enqueueBulkWebsiteSearch } from '@/lib/api';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import {
  Search, ChevronLeft, ChevronRight, Globe, Phone,
  Mail, MessageCircle, Sparkles, Loader2, CheckCircle2,
  Building2, ExternalLink, Link2,
} from 'lucide-react';

const CNAE_TARGET = '4511101';

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

export default function ConcessionariasPage() {
  const search        = useDebounce(400);
  const [uf, setUf]   = useState('');
  const [page, setPage] = useState(1);
  const [enrichDone, setEnrichDone]   = useState(false);
  const [enrichCount, setEnrichCount] = useState(0);
  const [matchDone, setMatchDone]     = useState(false);
  const [matchCount, setMatchCount]   = useState(0);
  const [searchDone, setSearchDone]   = useState(false);
  const [searchCount, setSearchCount] = useState(0);

  const { mutate: startEnrich, isPending: isEnriching } = useMutation({
    mutationFn: () => enqueueBulkEnrichment(CNAE_TARGET),
    onSuccess: (r) => { setEnrichDone(true); setEnrichCount(r.queued); },
  });

  const { mutate: startMatch, isPending: isMatching } = useMutation({
    mutationFn: () => matchWebsitesFromBrandAdapters(CNAE_TARGET),
    onSuccess: (r) => { setMatchDone(true); setMatchCount(r.matched); },
  });

  const { mutate: startSearch, isPending: isSearching } = useMutation({
    mutationFn: () => enqueueBulkWebsiteSearch(CNAE_TARGET),
    onSuccess: (r) => { setSearchDone(true); setSearchCount(r.queued); },
  });

  const { data, isLoading } = useQuery({
    queryKey: ['concessionarias', page, search.debounced, uf],
    queryFn: () => fetchStores({
      page,
      limit: 50,
      situacaoCadastral: 'ATIVA',
      tipo:              'Matriz',
      cnaeCode:          CNAE_TARGET,
      search:            search.debounced || undefined,
      uf:                uf               || undefined,
    }),
  });

  const stores = data?.data ?? [];
  const meta   = data?.meta;
  const resetPage = () => setPage(1);

  return (
    <div>
      <PageHeader
        title="Concessionárias — Automóveis Novos"
        description={
          meta
            ? `${meta.total.toLocaleString('pt-BR')} matrizes ativas · CNAE 4511-1/01`
            : 'Matrizes ativas · CNAE 4511-1/01 · Varejo de Automóveis Novos'
        }
      >
        {/* Enriquecer CNPJ */}
        <button
          onClick={() => startEnrich()}
          disabled={isEnriching || enrichDone}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
        >
          {isEnriching
            ? <><Loader2 className="w-4 h-4 animate-spin" />Enfileirando...</>
            : enrichDone
            ? <><CheckCircle2 className="w-4 h-4" />{enrichCount.toLocaleString('pt-BR')} na fila</>
            : <><Sparkles className="w-4 h-4" />Enriquecer CNPJ</>}
        </button>

        {/* Match por marcas (grátis) */}
        <button
          onClick={() => startMatch()}
          disabled={isMatching || matchDone}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-border bg-card hover:bg-accent disabled:opacity-60 transition-colors"
        >
          {isMatching
            ? <><Loader2 className="w-4 h-4 animate-spin" />Buscando...</>
            : matchDone
            ? <><CheckCircle2 className="w-4 h-4 text-emerald-600" />{matchCount.toLocaleString('pt-BR')} sites encontrados</>
            : <><Link2 className="w-4 h-4" />Match por Marcas</>}
        </button>

        {/* Busca via SerpAPI/Apify */}
        <button
          onClick={() => startSearch()}
          disabled={isSearching || searchDone}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-border bg-card hover:bg-accent disabled:opacity-60 transition-colors"
        >
          {isSearching
            ? <><Loader2 className="w-4 h-4 animate-spin" />Enfileirando...</>
            : searchDone
            ? <><CheckCircle2 className="w-4 h-4 text-emerald-600" />{searchCount.toLocaleString('pt-BR')} na fila</>
            : <><Globe className="w-4 h-4" />Buscar Sites</>}
        </button>

        {/* Filtros */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={search.value}
            onChange={(e) => { search.set(e.target.value); resetPage(); }}
            placeholder="Nome, CNPJ ou Razão Social..."
            className="pl-8 w-52 h-9 text-sm"
          />
        </div>
        <Input
          value={uf}
          onChange={(e) => { setUf(e.target.value.toUpperCase().slice(0, 2)); resetPage(); }}
          placeholder="UF"
          className="w-20 h-9 text-sm uppercase"
          maxLength={2}
        />
      </PageHeader>

      {/* Tabela */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-[260px]">Estabelecimento</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">CNPJ</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cidade / UF</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Capital Social</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contatos</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Digital</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Marca</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading
                ? Array.from({ length: 10 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                      ))}
                    </tr>
                  ))
                : stores.length === 0
                ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-16 text-center text-muted-foreground text-sm">
                        <Building2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        Nenhuma concessionária encontrada.
                      </td>
                    </tr>
                  )
                : stores.map((store) => {
                    const nome = store.nomeFantasia || store.razaoSocial || store.name;
                    const sub  = store.nomeFantasia && store.razaoSocial ? store.razaoSocial : null;
                    const capital = store.capitalSocial
                      ? store.capitalSocial.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
                      : null;
                    const temContato = store.email || store.whatsapp || store.emailReceita || store.telefoneReceita;
                    const temDigital = store.websiteId || store.instagram || store.facebook;

                    return (
                      <tr key={store.id} className="hover:bg-muted/30 transition-colors group">

                        {/* Nome */}
                        <td className="px-4 py-3 max-w-[260px]">
                          <Link href={`/stores/${store.id}`} className="group-hover:text-primary transition-colors">
                            <p className="font-medium text-foreground truncate">{nome}</p>
                            {sub && <p className="text-xs text-muted-foreground truncate">{sub}</p>}
                            {!store.cnpjEnrichedAt && (
                              <span className="text-[10px] text-yellow-600 font-medium">Não enriquecido</span>
                            )}
                          </Link>
                        </td>

                        {/* CNPJ */}
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                          {store.cnpj ?? '—'}
                        </td>

                        {/* Cidade/UF */}
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                          {store.city && store.state
                            ? `${store.city.name}, ${store.state.code}`
                            : store.state?.code ?? '—'}
                        </td>

                        {/* Capital Social */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          {capital
                            ? <span className="text-foreground font-medium">{capital}</span>
                            : <span className="text-muted-foreground">—</span>}
                        </td>

                        {/* Contatos */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {(store.email || store.emailReceita) && (
                              <a
                                href={`mailto:${store.email ?? store.emailReceita}`}
                                title={store.email ?? store.emailReceita ?? ''}
                                className="text-muted-foreground hover:text-primary transition-colors"
                              >
                                <Mail className="w-4 h-4" />
                              </a>
                            )}
                            {store.whatsapp && (
                              <a
                                href={`https://wa.me/${store.whatsapp.replace(/\D/g, '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={store.whatsapp}
                                className="text-muted-foreground hover:text-emerald-600 transition-colors"
                              >
                                <MessageCircle className="w-4 h-4" />
                              </a>
                            )}
                            {(store.phone || store.telefoneReceita) && (
                              <a
                                href={`tel:${store.phone ?? store.telefoneReceita}`}
                                title={store.phone ?? store.telefoneReceita ?? ''}
                                className="text-muted-foreground hover:text-primary transition-colors"
                              >
                                <Phone className="w-4 h-4" />
                              </a>
                            )}
                            {!temContato && <span className="text-muted-foreground text-xs">—</span>}
                          </div>
                        </td>

                        {/* Digital */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {store.website && (
                              <a
                                href={store.website.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={store.website.url}
                                className="text-muted-foreground hover:text-primary transition-colors"
                              >
                                <Globe className="w-4 h-4" />
                              </a>
                            )}
                            {store.instagram && (
                              <a href={store.instagram} target="_blank" rel="noopener noreferrer"
                                className="text-muted-foreground hover:text-pink-500 transition-colors" title="Instagram">
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}
                            {!temDigital && <span className="text-muted-foreground text-xs">—</span>}
                          </div>
                        </td>

                        {/* Marca */}
                        <td className="px-4 py-3">
                          {store.brand
                            ? <Badge variant="outline" className="text-xs border-primary/30 text-primary">{store.brand.name}</Badge>
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
              {' · '}{meta.total.toLocaleString('pt-BR')} concessionárias
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

'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchStore, enrichStore } from '@/lib/api';
import { PageHeader } from '@/components/page-header';
import { ScoreBadge } from '@/components/score-badge';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft, Star, Phone, Globe, MapPin, Building2,
  Users, Mail, MessageCircle, Facebook, Instagram,
  Youtube, Linkedin, Briefcase, Calendar, DollarSign,
  CheckCircle2, AlertTriangle, Loader2, RefreshCw,
  Activity, TrendingUp, Clock, Wifi, WifiOff, ExternalLink,
  FileText, ShieldCheck,
} from 'lucide-react';

function formatCapital(v: number | null) {
  if (!v) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);
}

function formatDate(s: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('pt-BR');
}

function SituacaoBadge({ s }: { s: string | null }) {
  if (!s) return <span className="text-muted-foreground text-xs">—</span>;
  const isAtiva = s.toUpperCase().includes('ATIVA');
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
      isAtiva ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
    }`}>
      {isAtiva ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
      {s}
    </span>
  );
}

type Tab = 'empresa' | 'socios' | 'contatos' | 'website';

export default function StoreDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [tab, setTab] = useState<Tab>('empresa');
  const queryClient = useQueryClient();

  const { data: store, isLoading } = useQuery({
    queryKey: ['store', id],
    queryFn: () => fetchStore(id),
  });

  const { mutate: triggerEnrich, isPending: isEnriching } = useMutation({
    mutationFn: () => enrichStore(id),
    onSuccess: () => {
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ['store', id] }), 8000);
    },
  });

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'empresa', label: 'Empresa', icon: <Building2 className="w-4 h-4" /> },
    { id: 'socios', label: 'Sócios', icon: <Users className="w-4 h-4" /> },
    { id: 'contatos', label: 'Contatos', icon: <Phone className="w-4 h-4" /> },
    { id: 'website', label: 'Website', icon: <Globe className="w-4 h-4" /> },
  ];

  if (isLoading) {
    return (
      <div>
        <Skeleton className="h-4 w-32 mb-6" />
        <Skeleton className="h-8 w-64 mb-2" />
        <Skeleton className="h-4 w-48 mb-8" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      </div>
    );
  }

  if (!store) return <div className="text-muted-foreground text-sm py-16 text-center">Loja não encontrada.</div>;

  const hasCnpj = !!store.cnpj;
  const hasContacts = !!(store.phone || store.whatsapp || store.email || store.emailReceita || store.facebook || store.instagram);
  const hasWebsite = !!store.website;

  return (
    <div>
      <Link
        href="/stores"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Voltar para Lojas
      </Link>

      <PageHeader
        title={store.name}
        description={[store.brand?.name, store.city?.name, store.state?.code].filter(Boolean).join(' · ')}
      >
        <button
          onClick={() => triggerEnrich()}
          disabled={isEnriching}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {isEnriching ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {isEnriching ? 'Enriquecendo...' : 'Enriquecer Dados'}
        </button>
      </PageHeader>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <Card className="border-border bg-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-500/10">
              <Star className="w-4 h-4 text-yellow-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Google Rating</p>
              <p className="text-xl font-bold text-foreground">
                {store.rating?.toFixed(1) ?? '—'}
                {store.reviews != null && (
                  <span className="text-xs font-normal text-muted-foreground ml-1">({store.reviews})</span>
                )}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <ShieldCheck className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Situação</p>
              <div className="mt-1">
                {hasCnpj ? <SituacaoBadge s={store.situacaoCadastral} /> : <span className="text-xs text-muted-foreground">Sem CNPJ</span>}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <Calendar className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Abertura</p>
              <p className="text-sm font-semibold text-foreground">{formatDate(store.dataAbertura)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/10">
              <Users className="w-4 h-4 text-purple-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Sócios</p>
              <p className="text-xl font-bold text-foreground">{store.partners?.length ?? 0}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border mb-6">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Empresa */}
      {tab === 'empresa' && (
        <div className="space-y-4">
          {!hasCnpj ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              <FileText className="w-8 h-8 mx-auto mb-3 opacity-40" />
              <p>CNPJ não encontrado ainda.</p>
              <p className="mt-1">Clique em <strong>Enriquecer Dados</strong> para buscar.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="border-border bg-card">
                <CardContent className="p-5 space-y-3">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-primary" /> Identificação
                  </h3>
                  <Row label="CNPJ" value={store.cnpj} mono />
                  <Row label="Razão Social" value={store.razaoSocial} />
                  <Row label="Nome Fantasia" value={store.nomeFantasia} />
                  <Row label="Porte" value={store.porte} />
                  <div className="flex justify-between items-center py-1 border-b border-border/50 last:border-0">
                    <span className="text-xs text-muted-foreground">Situação</span>
                    <SituacaoBadge s={store.situacaoCadastral} />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border bg-card">
                <CardContent className="p-5 space-y-3">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-primary" /> Dados Econômicos
                  </h3>
                  <Row label="Abertura" value={formatDate(store.dataAbertura)} />
                  <Row label="Capital Social" value={formatCapital(store.capitalSocial)} />
                  <Row label="CNAE" value={store.cnaeCode ? `${store.cnaeCode} — ${store.cnaeDescricao}` : null} />
                  <Row label="Email Receita" value={store.emailReceita} />
                  <Row label="Telefone Receita" value={store.telefoneReceita} />
                </CardContent>
              </Card>

              <Card className="border-border bg-card md:col-span-2">
                <CardContent className="p-5 space-y-3">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-primary" /> Endereço Cadastral
                  </h3>
                  <div className="text-sm text-foreground">
                    {[store.enderecoLogradouro, store.enderecoNumero].filter(Boolean).join(', ')}
                    {store.enderecoBairro && <span className="text-muted-foreground"> — {store.enderecoBairro}</span>}
                    {store.enderecoCep && <span className="text-muted-foreground"> · CEP {store.enderecoCep}</span>}
                  </div>
                  {store.cnpjEnrichedAt && (
                    <p className="text-xs text-muted-foreground">Atualizado em {formatDate(store.cnpjEnrichedAt)}</p>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* Tab: Sócios */}
      {tab === 'socios' && (
        <div className="space-y-3">
          {!store.partners?.length ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              <Users className="w-8 h-8 mx-auto mb-3 opacity-40" />
              <p>Nenhum sócio encontrado.</p>
              <p className="mt-1">Clique em <strong>Enriquecer Dados</strong> para buscar via CNPJ.</p>
            </div>
          ) : (
            store.partners.map((p) => (
              <Card key={p.id} className="border-border bg-card">
                <CardContent className="p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm flex-shrink-0">
                      {p.nome.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{p.nome}</p>
                      <p className="text-xs text-muted-foreground">{p.qualificacao ?? 'Sócio'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {p.cpfMascarado && (
                      <span className="text-xs text-muted-foreground font-mono bg-muted px-2 py-1 rounded">{p.cpfMascarado}</span>
                    )}
                    {p.email && (
                      <a href={`mailto:${p.email}`} className="text-xs text-primary hover:underline flex items-center gap-1">
                        <Mail className="w-3 h-3" /> {p.email}
                      </a>
                    )}
                    {p.linkedinUrl && (
                      <a href={p.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors">
                        <Linkedin className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Tab: Contatos */}
      {tab === 'contatos' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="border-border bg-card">
            <CardContent className="p-5 space-y-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Phone className="w-4 h-4 text-primary" /> Telefones
              </h3>
              <Row label="Telefone Google" value={store.phone} />
              <Row label="Telefone Receita" value={store.telefoneReceita} />
              {store.whatsapp && (
                <div className="flex justify-between items-center py-1 border-b border-border/50">
                  <span className="text-xs text-muted-foreground">WhatsApp</span>
                  <a
                    href={`https://wa.me/${store.whatsapp.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-emerald-400 hover:underline flex items-center gap-1"
                  >
                    <MessageCircle className="w-3 h-3" /> {store.whatsapp}
                  </a>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardContent className="p-5 space-y-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Mail className="w-4 h-4 text-primary" /> Email & Redes Sociais
              </h3>
              {(store.email || store.emailReceita) && (
                <div className="flex justify-between items-center py-1 border-b border-border/50">
                  <span className="text-xs text-muted-foreground">Email</span>
                  <a href={`mailto:${store.email ?? store.emailReceita}`} className="text-xs text-primary hover:underline">
                    {store.email ?? store.emailReceita}
                  </a>
                </div>
              )}
              {store.facebook && <SocialRow icon={<Facebook className="w-4 h-4 text-blue-400" />} label="Facebook" url={store.facebook} />}
              {store.instagram && <SocialRow icon={<Instagram className="w-4 h-4 text-pink-400" />} label="Instagram" url={store.instagram} />}
              {store.youtube && <SocialRow icon={<Youtube className="w-4 h-4 text-red-400" />} label="YouTube" url={store.youtube} />}
              {store.linkedin && <SocialRow icon={<Linkedin className="w-4 h-4 text-blue-500" />} label="LinkedIn" url={store.linkedin} />}
              {!store.email && !store.emailReceita && !store.facebook && !store.instagram && !store.youtube && !store.linkedin && (
                <p className="text-xs text-muted-foreground py-4 text-center">
                  Nenhum contato encontrado ainda. Clique em <strong>Enriquecer Dados</strong>.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Location */}
          {(store.latitude && store.longitude) && (
            <Card className="border-border bg-card md:col-span-2">
              <CardContent className="p-5">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
                  <MapPin className="w-4 h-4 text-primary" /> Localização
                </h3>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-muted-foreground font-mono">
                    {store.latitude.toFixed(6)}, {store.longitude.toFixed(6)}
                  </span>
                  <a
                    href={`https://www.google.com/maps?q=${store.latitude},${store.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    <ExternalLink className="w-3 h-3" /> Ver no Google Maps
                  </a>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Tab: Website */}
      {tab === 'website' && (
        <div>
          {!hasWebsite ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              <Globe className="w-8 h-8 mx-auto mb-3 opacity-40" />
              <p>Nenhum website vinculado a esta loja.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <Card className="border-border bg-card">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        (store.website!.downtimeSeconds ?? 0) > 0
                          ? 'bg-red-500/15 text-red-400'
                          : 'bg-emerald-500/15 text-emerald-400'
                      }`}>
                        {(store.website!.downtimeSeconds ?? 0) > 0 ? <WifiOff className="w-2.5 h-2.5" /> : <Wifi className="w-2.5 h-2.5" />}
                        {(store.website!.downtimeSeconds ?? 0) > 0 ? 'DOWN' : 'UP'}
                      </span>
                      <a
                        href={store.website!.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-foreground hover:text-primary flex items-center gap-1 transition-colors"
                      >
                        {store.website!.url.replace(/^https?:\/\//, '')}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <Badge
                      variant={store.website!.isActive ? 'default' : 'secondary'}
                      className={store.website!.isActive ? 'bg-emerald-500/20 text-emerald-400 border-0 text-xs' : 'text-xs'}
                    >
                      {store.website!.isActive ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <MetricBox icon={<Activity className="w-3 h-3" />} label="Performance" value={<ScoreBadge score={store.website!.avgPerformanceScore} />} />
                    <MetricBox icon={<TrendingUp className="w-3 h-3" />} label="SEO" value={<ScoreBadge score={store.website!.seoScore} />} />
                    <MetricBox
                      icon={<Clock className="w-3 h-3" />}
                      label="Resposta"
                      value={<span className="text-xs font-semibold text-foreground">{store.website!.avgResponseTime != null ? `${store.website!.avgResponseTime}ms` : '—'}</span>}
                    />
                    <MetricBox
                      icon={<AlertTriangle className="w-3 h-3" />}
                      label="Downtime"
                      value={
                        <span className={`text-xs font-semibold ${(store.website!.downtimeSeconds ?? 0) > 0 ? 'text-red-400' : 'text-foreground'}`}>
                          {(store.website!.downtimeSeconds ?? 0) === 0 ? '0s' : `${Math.floor(store.website!.downtimeSeconds! / 60)}m`}
                        </span>
                      }
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div className="flex justify-between items-center py-1 border-b border-border/50 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-xs font-medium text-foreground ${mono ? 'font-mono' : ''}`}>{value || '—'}</span>
    </div>
  );
}

function SocialRow({ icon, label, url }: { icon: React.ReactNode; label: string; url: string }) {
  return (
    <div className="flex justify-between items-center py-1 border-b border-border/50 last:border-0">
      <span className="text-xs text-muted-foreground flex items-center gap-1.5">{icon}{label}</span>
      <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
        <ExternalLink className="w-3 h-3" /> {url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}
      </a>
    </div>
  );
}

function MetricBox({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="text-center bg-muted/40 rounded-lg px-3 py-3">
      <div className="flex items-center gap-1 justify-center mb-1 text-muted-foreground">{icon}<span className="text-xs">{label}</span></div>
      {value}
    </div>
  );
}

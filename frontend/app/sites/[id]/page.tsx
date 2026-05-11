'use client';

import { use } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { fetchWebsite } from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ArrowLeft, ExternalLink, RefreshCw, Pencil, Globe,
  AlertTriangle, CheckCircle2, Wifi, WifiOff, Database,
  FlaskConical, MapPin, Building2, Users, Link2,
  TrendingUp, Activity, Clock, AlertCircle, Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// REAL: dados vindos de GET /websites/:id
// MOCK: "Análise SEO on-page" — não temos análise por página no banco

// ─── Helpers ─────────────────────────────────────────────────────────────────

function scoreColor(score: number | null) {
  if (score === null) return 'text-muted-foreground';
  if (score >= 80) return 'text-emerald-500';
  if (score >= 50) return 'text-yellow-500';
  return 'text-red-500';
}

function scoreBarColor(score: number | null) {
  if (score === null) return 'bg-muted';
  if (score >= 80) return 'bg-emerald-500';
  if (score >= 50) return 'bg-yellow-500';
  return 'bg-red-500';
}

function statusLabel(score: number | null) {
  if (score === null) return { label: '—', cls: 'bg-muted text-muted-foreground' };
  if (score >= 80) return { label: 'BOM', cls: 'bg-emerald-500/15 text-emerald-600' };
  if (score >= 50) return { label: 'MÉDIO', cls: 'bg-yellow-500/15 text-yellow-600' };
  return { label: 'CRÍTICO', cls: 'bg-red-500/15 text-red-600' };
}

function MetricCard({ label, value, sub, color }: { label: string; value: string | null; sub?: string; color?: string }) {
  return (
    <div className="bg-white border border-border rounded-lg px-4 py-3 min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">{label}</p>
      <p className={cn('text-xl font-extrabold', color ?? 'text-slate-800')}>{value ?? '—'}</p>
      {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function DiagBar({ label, value, displayValue, color }: {
  label: string; value: number; displayValue: string; color: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center text-sm">
        <span className="text-slate-600">{label}</span>
        <span className="font-semibold text-slate-700">{displayValue}</span>
      </div>
      <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
    </div>
  );
}

function LiveChip() {
  return (
    <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
      <Database className="w-2.5 h-2.5" /> live
    </span>
  );
}

function MockChip() {
  return (
    <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
      <FlaskConical className="w-2.5 h-2.5" /> mock
    </span>
  );
}

// MOCK: análise SEO por página — não existe no banco ainda
// TODO: criar tabela seo_page_metrics (websiteId, page, title, score, measuredAt)
const MOCK_SEO_PAGES = [
  { page: 'Home', title: 'Concessionária · página principal', score: 92 },
  { page: 'Estoque', title: 'Estoque de seminovos e novos', score: 88 },
  { page: 'Ofertas', title: 'Ofertas especiais', score: 65 },
  { page: 'Seminovos', title: 'Seminovos selecionados', score: 90 },
  { page: 'Contato', title: 'Fale conosco', score: 95 },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SiteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  // REAL: GET /websites/:id
  const { data: website, isLoading } = useQuery({
    queryKey: ['website', id],
    queryFn: () => fetchWebsite(id),
  });

  if (isLoading) return <SiteDetailSkeleton />;
  if (!website) return (
    <div className="text-center py-20 text-muted-foreground text-sm">
      Site não encontrado.
    </div>
  );

  const urlClean = website.url.replace(/^https?:\/\/(www\.)?/, '');
  const primaryStore = website.stores[0] ?? null;
  const conta = primaryStore?.dealerGroup?.name ?? website.brand?.name ?? '—';
  const loja = primaryStore ? `${primaryStore.name}${primaryStore.city ? ` — ${primaryStore.city.name}` : ''}` : '—';
  const marca = website.brand?.name ?? primaryStore?.brand?.name ?? '—';
  const estado = primaryStore?.state?.code ?? '—';

  // Bar widths — capped at 100
  const perfWidth = website.avgPerformanceScore ?? 0;
  const seoWidth = website.seoScore ?? 0;
  // Response time: 0ms = 100%, 3000ms = 0%
  const responseWidth = website.avgResponseTime != null
    ? Math.max(0, Math.round((1 - website.avgResponseTime / 3000) * 100))
    : 0;
  const alertsWidth = Math.min((website.problems.length / 5) * 100, 100);

  const isUp = (website.downtimeSeconds ?? 0) === 0;

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div>
        <Link href="/sites" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-2 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />
          <span className="font-semibold uppercase tracking-wider text-[10px]">Perfil do site</span>
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={cn(
                'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold',
                isUp ? 'bg-emerald-500/15 text-emerald-600' : 'bg-red-500/15 text-red-600'
              )}>
                {isUp ? <Wifi className="w-2.5 h-2.5" /> : <WifiOff className="w-2.5 h-2.5" />}
                {isUp ? 'UP' : 'DOWN'}
              </span>
              <h1 className="text-2xl font-extrabold text-slate-900">{urlClean}</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Diagnóstico técnico completo, análise SEO e contexto comercial do site
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-border rounded-lg hover:bg-muted/50 transition-colors">
              <Pencil className="w-3.5 h-3.5" /> Editar site
            </button>
            <button className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-border rounded-lg hover:bg-muted/50 transition-colors">
              <RefreshCw className="w-3.5 h-3.5" /> Atualizar análise
            </button>
            <a
              href={website.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              <Globe className="w-3.5 h-3.5" /> Abrir site
            </a>
          </div>
        </div>
      </div>

      {/* ── Métricas rápidas ─────────────────────────────────────────── */}
      {/* REAL: todos vindos do banco */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard
          label="Performance"
          value={website.avgPerformanceScore?.toFixed(0) ?? null}
          color={scoreColor(website.avgPerformanceScore)}
        />
        <MetricCard
          label="SEO"
          value={website.seoScore?.toFixed(0) ?? null}
          color={scoreColor(website.seoScore)}
        />
        <MetricCard
          label="Resp. Médio"
          value={website.avgResponseTime != null ? `${website.avgResponseTime}ms` : null}
          color={website.avgResponseTime != null && website.avgResponseTime > 1500 ? 'text-red-500' : 'text-purple-600'}
        />
        <MetricCard
          label="Lojas Vinculadas"
          value={String(website.stores.length)}
        />
        <MetricCard
          label="Alertas Críticos"
          value={String(website.problems.length)}
          color={website.problems.length > 0 ? 'text-red-500' : 'text-emerald-500'}
        />
        <MetricCard
          label="Disponibilidade"
          value={website.uptimePercentage != null ? `${website.uptimePercentage}%` : website.totalUptimeChecks === 0 ? 'Sem dados' : null}
          color={website.uptimePercentage != null && website.uptimePercentage >= 99 ? 'text-emerald-500' : 'text-yellow-500'}
          sub={website.totalUptimeChecks > 0 ? `${website.totalUptimeChecks} checks` : undefined}
        />
      </div>

      {/* ── Conteúdo principal: 2 colunas ───────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* ── Coluna esquerda (2/3) ──────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-5">

          {/* Diagnóstico técnico — REAL */}
          <Card className="border-border bg-white shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-500" />
                Diagnóstico técnico
                <LiveChip />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <DiagBar
                label="Performance média"
                value={perfWidth}
                displayValue={website.avgPerformanceScore?.toFixed(0) ?? '—'}
                color={scoreBarColor(website.avgPerformanceScore)}
              />
              <DiagBar
                label="SEO médio"
                value={seoWidth}
                displayValue={website.seoScore?.toFixed(0) ?? '—'}
                color={scoreBarColor(website.seoScore)}
              />
              <DiagBar
                label="Tempo médio de resposta"
                value={responseWidth}
                displayValue={website.avgResponseTime != null ? `${website.avgResponseTime}ms` : '—'}
                color="bg-purple-500"
              />
              <DiagBar
                label="Alertas críticos"
                value={alertsWidth}
                displayValue={String(website.problems.length)}
                color={website.problems.length > 0 ? 'bg-red-500' : 'bg-emerald-500'}
              />
            </CardContent>
          </Card>

          {/* Análise SEO on-page — MOCK */}
          <Card className="border-amber-200 bg-white shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Activity className="w-4 h-4 text-amber-500" />
                Análise SEO on-page
                <MockChip />
              </CardTitle>
              <p className="text-[10px] text-amber-600 mt-1">
                TODO: criar tabela <code className="bg-amber-100 rounded px-1">seo_page_metrics</code> com análise por página
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-amber-50/60">
                  <tr className="border-b border-amber-200/60">
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Página</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Título</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Status</th>
                    <th className="text-right px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">SEO</th>
                  </tr>
                </thead>
                <tbody>
                  {MOCK_SEO_PAGES.map(p => {
                    const st = statusLabel(p.score);
                    return (
                      <tr key={p.page} className="border-b border-amber-100/60 hover:bg-amber-50/30 transition-colors">
                        <td className="px-4 py-2.5 font-medium text-slate-700 text-xs">{p.page}</td>
                        <td className="px-4 py-2.5 text-slate-500 text-xs max-w-[200px] truncate">{p.title}</td>
                        <td className="px-4 py-2.5">
                          <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded', st.cls)}>
                            {st.label}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold text-sm text-slate-700">{p.score}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>

        {/* ── Coluna direita (1/3) ──────────────────────────────────── */}
        <div className="space-y-4">

          {/* Vínculos do site — REAL */}
          <Card className="border-border bg-white shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Link2 className="w-4 h-4 text-blue-500" />
                Vínculos do site
                <LiveChip />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {[
                { label: 'CONTA', value: conta, icon: <Building2 className="w-3 h-3" /> },
                { label: 'LOJA', value: loja, icon: <MapPin className="w-3 h-3" /> },
                { label: 'MARCA', value: marca, icon: <Zap className="w-3 h-3" /> },
                { label: 'ESTADO', value: estado, icon: <MapPin className="w-3 h-3" /> },
                { label: 'PROVEDOR', value: website.provider?.name ?? '—', icon: <Globe className="w-3 h-3" /> },
                {
                  label: 'TIPO DE CONTA',
                  value: primaryStore?.dealerGroup ? 'Grupo automotivo' : '—',
                  icon: <Users className="w-3 h-3" />,
                },
              ].map(({ label, value, icon }) => (
                <div key={label} className="flex items-start justify-between gap-2 py-1.5 border-b border-border/40 last:border-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1 mt-0.5 shrink-0">
                    {icon}{label}
                  </span>
                  <span className="text-xs font-medium text-slate-700 text-right leading-snug">{value}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Problemas encontrados — REAL (derivado das métricas) */}
          <Card className="border-border bg-white shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-red-600">
                <AlertCircle className="w-4 h-4" />
                Problemas encontrados
                <LiveChip />
              </CardTitle>
            </CardHeader>
            <CardContent>
              {website.problems.length === 0 ? (
                <div className="flex items-center gap-2 text-emerald-600 text-sm">
                  <CheckCircle2 className="w-4 h-4" />
                  Nenhum problema crítico identificado
                </div>
              ) : (
                <ul className="space-y-2">
                  {website.problems.map((p, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
                      {p}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Ações rápidas */}
          <Card className="border-border bg-white shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Zap className="w-4 h-4 text-blue-500" />
                Ações rápidas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                {/* TODO: link para /contas/:dealerGroupId */}
                <button
                  disabled={!primaryStore?.dealerGroup}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium border border-border rounded-lg hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Building2 className="w-3.5 h-3.5" /> Ver Conta
                </button>
                {/* TODO: modal de vinculação de loja */}
                <button className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium border border-border rounded-lg hover:bg-muted/50 transition-colors">
                  <Link2 className="w-3.5 h-3.5" /> Vincular Loja
                </button>
              </div>
              {/* TODO: criar oportunidade no Pipedrive para esta conta */}
              <button className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
                <Zap className="w-3.5 h-3.5" /> Criar Oportunidade
              </button>
            </CardContent>
          </Card>

          {/* Lojas vinculadas (se mais de 1) */}
          {website.stores.length > 1 && (
            <Card className="border-border bg-white shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-blue-500" />
                  Lojas vinculadas
                  <span className="ml-auto text-base font-extrabold text-slate-700">
                    {website.stores.length}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {website.stores.slice(0, 5).map(store => (
                  <Link
                    key={store.id}
                    href={`/stores/${store.id}`}
                    className="flex items-center justify-between text-xs hover:text-primary transition-colors py-1 border-b border-border/30 last:border-0"
                  >
                    <span className="font-medium text-slate-700 truncate">{store.name}</span>
                    <span className="text-slate-400 shrink-0 ml-2">
                      {store.city?.name}{store.state?.code ? `, ${store.state.code}` : ''}
                    </span>
                  </Link>
                ))}
                {website.stores.length > 5 && (
                  <p className="text-[10px] text-muted-foreground text-center pt-1">
                    +{website.stores.length - 5} outras lojas
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SiteDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-3 w-24 mb-3" />
        <Skeleton className="h-8 w-64 mb-2" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <Skeleton className="h-52 rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-48 rounded-lg" />
          <Skeleton className="h-32 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

'use client';
import { useQuery } from '@tanstack/react-query';
import { fetchGlobalStats } from '@/lib/api';
import { StatCard } from '@/components/stat-card';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Globe, Store, Building2, Users, BarChart2, FlaskConical, Database } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

// ─── DADOS MOCK ──────────────────────────────────────────────────────────────
// TODO: contasMapeadas     → COUNT(dealer_groups)
// TODO: contatosEncontrados → COUNT(dealer_group_contacts)
// TODO: clientesIdentificados → COUNT(dealer_groups WHERE crmStatus = 'CLIENTE')
// TODO: sitesCriticos      → COUNT(websites WHERE avgPerformanceScore < 30 OR downtimeSeconds > 0)
// TODO: MOCK_PROVIDERS_CHART → SELECT provider_id, COUNT(*) FROM websites GROUP BY provider_id
// TODO: MOCK_CONCORRENTE_CHART → COUNT(dealer_groups WHERE providerName NOT ILIKE '%autoforce%')
const MOCK_DATA = {
  contasMapeadas: '2.760',
  contatosEncontrados: '8.430',
  clientesIdentificados: '312',
  sitesCriticos: '426',
};

const MOCK_PROVIDERS_CHART = [
  { name: 'Outro', value: 100 },
  { name: 'AutoForce', value: 150 },
  { name: 'Dealer Sites', value: 130 },
  { name: 'Revenda Mais', value: 170 },
  { name: 'AutoAvaliar', value: 200 },
];

const MOCK_CONCORRENTE_CHART = [
  { name: 'Concorrente', value: 1148 },
  { name: 'Restante', value: 1612 },
];
const COLORS = ['#3b82f6', '#bfdbfe'];
// ─── END MOCK ────────────────────────────────────────────────────────────────

function getBarColor(score: number | null) {
  if (score === null) return 'bg-muted-foreground';
  if (score >= 90) return 'bg-emerald-500';
  if (score >= 70) return 'bg-yellow-500';
  return 'bg-red-500';
}

function formatResponseTime(ms: number | null): string {
  if (ms === null) return '—';
  return `${ms}ms`;
}

function MockChip() {
  return (
    <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
      <FlaskConical className="w-2.5 h-2.5" /> mock
    </span>
  );
}

function LiveChip({ src }: { src: string }) {
  return (
    <span title={`Fonte: ${src}`} className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5 cursor-help">
      <Database className="w-2.5 h-2.5" /> live
    </span>
  );
}

export default function DashboardPage() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['global-stats'],
    queryFn: () => fetchGlobalStats(),
  });

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Visão geral da base comercial e da inteligência digital dos sites monitorados"
      />

      {/* ── Status de dados ────────────────────────────────────────────── */}
      <div className="flex items-center gap-6 mb-6 px-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <LiveChip src="GET /dashboard/global-stats" /> = conectado ao banco
        </span>
        <span className="flex items-center gap-1.5">
          <MockChip /> = dado simulado, ainda sem endpoint
        </span>
      </div>

      {/* ── Row 1: Visão Geral (5 cards) ─────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">

        {/* MOCK */}
        <div className="flex flex-col gap-1">
          <StatCard
            title="Contas Mapeadas"
            value={MOCK_DATA.contasMapeadas}
            subtitle="Empresas e grupos identificados"
            icon={Building2}
            loading={false}
          />
          <div className="flex justify-end pr-1"><MockChip /></div>
        </div>

        {/* REAL */}
        <div className="flex flex-col gap-1">
          <StatCard
            title="Lojas Físicas"
            value={stats?.stores ?? null}
            subtitle="Unidades encontradas"
            icon={Store}
            loading={isLoading}
          />
          <div className="flex justify-end pr-1"><LiveChip src="stats.stores" /></div>
        </div>

        {/* REAL */}
        <div className="flex flex-col gap-1">
          <StatCard
            title="Sites Monitorados"
            value={stats?.websites ?? null}
            subtitle="URLs acompanhadas"
            icon={Globe}
            loading={isLoading}
          />
          <div className="flex justify-end pr-1"><LiveChip src="stats.websites" /></div>
        </div>

        {/* MOCK */}
        <div className="flex flex-col gap-1">
          <StatCard
            title="Contatos Encontrados"
            value={MOCK_DATA.contatosEncontrados}
            subtitle="Pessoas vinculadas às contas"
            icon={Users}
            loading={false}
          />
          <div className="flex justify-end pr-1"><MockChip /></div>
        </div>

        {/* MOCK */}
        <div className="flex flex-col gap-1">
          <StatCard
            title="Clientes Identificados"
            value={MOCK_DATA.clientesIdentificados}
            subtitle="Contas já atendidas"
            icon={BarChart2}
            loading={false}
          />
          <div className="flex justify-end pr-1"><MockChip /></div>
        </div>

      </div>

      {/* ── Row 2: Inteligência Digital ──────────────────────────────── */}
      <div className="flex items-center justify-between mb-4 mt-8">
        <h2 className="text-lg font-bold">Inteligência digital dos sites</h2>
        <LiveChip src="GET /dashboard/global-stats" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {/* REAL */}
        <Card className="border-border bg-card">
          <CardContent className="p-6">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Performance Média
            </p>
            {isLoading ? (
              <div className="h-8 w-16 bg-muted rounded animate-pulse mb-3" />
            ) : (
              <p className="text-3xl font-bold text-foreground mb-3">
                {stats?.avgPerformanceScore != null ? `${stats.avgPerformanceScore.toFixed(0)}` : '—'}
              </p>
            )}
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all duration-500 ${getBarColor(stats?.avgPerformanceScore ?? null)}`}
                style={{ width: `${Math.min(stats?.avgPerformanceScore ?? 0, 100)}%` }}
              />
            </div>
          </CardContent>
        </Card>

        {/* REAL */}
        <Card className="border-border bg-card">
          <CardContent className="p-6">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              SEO Médio
            </p>
            {isLoading ? (
              <div className="h-8 w-16 bg-muted rounded animate-pulse mb-3" />
            ) : (
              <p className="text-3xl font-bold text-foreground mb-3">
                {stats?.avgSeoScore != null ? `${stats.avgSeoScore.toFixed(0)}` : '—'}
              </p>
            )}
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all duration-500 ${getBarColor(stats?.avgSeoScore ?? null)}`}
                style={{ width: `${Math.min(stats?.avgSeoScore ?? 0, 100)}%` }}
              />
            </div>
          </CardContent>
        </Card>

        {/* REAL */}
        <Card className="border-border bg-card">
          <CardContent className="p-6">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Tempo Médio de Resposta
            </p>
            {isLoading ? (
              <div className="h-8 w-24 bg-muted rounded animate-pulse" />
            ) : (
              <p className="text-3xl font-bold text-foreground">
                {formatResponseTime(stats?.avgResponseTime ?? null)}
              </p>
            )}
          </CardContent>
        </Card>

        {/* MOCK */}
        <Card className="border-border bg-card border-amber-200">
          <CardContent className="p-6">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
              Sites Críticos
              <MockChip />
            </p>
            <p className="text-3xl font-bold text-red-500">
              {MOCK_DATA.sitesCriticos}
            </p>
            <p className="text-[10px] text-amber-600 mt-2">
              TODO: COUNT websites WHERE perf &lt; 30 OR down
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Row 3: Gráficos (100% MOCK) ──────────────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-slate-700">Distribuição de provedores</h2>
        <MockChip />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-border bg-card border-amber-200">
          <CardHeader>
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              Provedores mais presentes
              <MockChip />
            </CardTitle>
            <p className="text-[10px] text-amber-600">
              TODO: SELECT provider_id, COUNT(*) FROM websites GROUP BY provider_id ORDER BY count DESC
            </p>
          </CardHeader>
          <CardContent className="h-[250px] w-full pb-0 pt-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={MOCK_PROVIDERS_CHART}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <Tooltip cursor={{ fill: '#fef9c3' }} />
                <Bar dataKey="value" fill="#f59e0b" radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border bg-card border-amber-200">
          <CardHeader>
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              Contas usando concorrente
              <MockChip />
            </CardTitle>
            <p className="text-[10px] text-amber-600">
              TODO: COUNT(dealer_groups WHERE providerName NOT ILIKE '%autoforce%')
            </p>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center h-[250px] relative pb-0 pt-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={MOCK_CONCORRENTE_CHART}
                  cx="50%"
                  cy="45%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                >
                  {MOCK_CONCORRENTE_CHART.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute top-[40%] left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none mt-2">
              <span className="text-3xl font-bold block">{MOCK_CONCORRENTE_CHART[0].value.toLocaleString('pt-BR')}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-4 text-center">Contas com fornecedor concorrente identificado</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

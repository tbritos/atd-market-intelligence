'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Loader2, Search, Trash2, Upload, User } from 'lucide-react';
import axios from 'axios';

const api = axios.create({ baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001' });

interface Cliente {
  id: string; empresa: string; cnpj: string; csResponsavel: string;
  contato: string; emailContato: string; telefoneContato: string; cargoContato: string;
  emailEmpresa: string; telefoneEmpresa: string;
  cidade: string; uf: string; site: string; provedor: string;
  pagespeed: number | string; situacao: string; anoAbertura: number | string;
}

interface ClientesResult {
  total: number;
  porCS: Record<string, number>;
  clientes: Cliente[];
}

function downloadCSV(clientes: Cliente[]) {
  const cols: (keyof Cliente)[] = ['empresa','cnpj','csResponsavel','contato','emailContato','telefoneContato','cargoContato','emailEmpresa','telefoneEmpresa','cidade','uf','site','provedor','pagespeed','anoAbertura'];
  const headers = ['Empresa','CNPJ','CS Responsável','Contato','Email Contato','Tel. Contato','Cargo','Email Empresa','Tel. Empresa','Cidade','UF','Site','Provedor','PageSpeed','Ano Abertura'];
  const rows = clientes.map(r => cols.map(c => `"${String(r[c] ?? '').replace(/"/g,'""')}"`).join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url;
  a.download = `clientes_autoforce_${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

export default function ClientesPage() {
  const [search, setSearch] = useState('');
  const [csFilter, setCsFilter] = useState('');
  const [resetting, setResetting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<ClientesResult>({
    queryKey: ['clientes', search],
    queryFn: async () => {
      const params = search ? `?search=${encodeURIComponent(search)}` : '';
      const r = await api.get(`/stores/clientes${params}`);
      return r.data;
    },
    debounce: 400,
  } as any);

  const filtered = csFilter
    ? data?.clientes.filter(c => c.csResponsavel === csFilter) ?? []
    : data?.clientes ?? [];

  const cssUnicos = Object.keys(data?.porCS ?? {}).sort();

  async function handleReset() {
    if (!confirm('Isso vai desmarcar TODOS os clientes. Tem certeza?')) return;
    setResetting(true);
    try {
      await api.post('/stores/clientes/reset');
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
    } finally { setResetting(false); }
  }

  async function handleCsUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadMsg(null);
    const text = await file.text();
    const lines = text.trim().split('\n');
    const sep = lines[0].includes('\t') ? '\t' : ',';
    const headers = lines[0].split(sep).map(h => h.replace(/"/g, '').trim());
    // Detecta coluna empresa e cs
    const empresaIdx = headers.findIndex(h => h.toLowerCase().includes('empresa') || h.toLowerCase().includes('negócio') || h.toLowerCase() === 'nome');
    const csIdx = headers.findIndex(h => h.toLowerCase().includes('proprietário') || h.toLowerCase().includes('proprietario') || h.toLowerCase().includes('cs') || h.toLowerCase().includes('responsável'));
    if (empresaIdx === -1 || csIdx === -1) {
      setUploadMsg('Não encontrei coluna de Empresa ou CS Responsável. Verifique o arquivo.');
      setUploading(false);
      return;
    }
    const rows = lines.slice(1).map(l => {
      const cols = l.split(sep).map(c => c.replace(/"/g, '').trim());
      return { empresa: cols[empresaIdx] || '', cs: cols[csIdx] || '' };
    }).filter(r => r.empresa && r.cs);

    try {
      const res = await api.post('/stores/clientes/update-cs', { rows });
      setUploadMsg(`${res.data.atualizados} clientes atualizados com CS Responsável`);
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
    } catch {
      setUploadMsg('Erro ao atualizar CS');
    } finally { setUploading(false); e.target.value = ''; }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Clientes Autoforce</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Base de clientes ativos — excluídos da prospecção SDR
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Upload CSV de CS */}
          <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm font-medium cursor-pointer hover:bg-muted transition-colors">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? 'Atualizando...' : 'Importar CS'}
            <input type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={handleCsUpload} disabled={uploading} />
          </label>
          {/* Reset */}
          <button
            onClick={handleReset}
            disabled={resetting}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 transition-colors disabled:opacity-60"
          >
            {resetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Resetar
          </button>
          {data && (
            <button
              onClick={() => downloadCSV(filtered)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--autoforce-600)] text-white text-sm font-medium hover:bg-[var(--autoforce-700)] transition-colors"
            >
              <Download className="w-4 h-4" />
              Exportar {filtered.length.toLocaleString('pt-BR')} clientes
            </button>
          )}
        </div>
      </div>

      {uploadMsg && (
        <p className={`text-sm px-3 py-2 rounded-lg border ${uploadMsg.includes('Erro') ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'}`}>
          {uploadMsg}
        </p>
      )}

      {/* Stats por CS */}
      {data && Object.keys(data.porCS).length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          <button
            onClick={() => setCsFilter('')}
            className={`rounded-xl border p-3 text-left transition-colors ${!csFilter ? 'border-[var(--autoforce-600)] bg-[var(--autoforce-50)]' : 'border-border bg-card hover:bg-muted/30'}`}
          >
            <p className="text-lg font-semibold">{data.total.toLocaleString('pt-BR')}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Todos os clientes</p>
          </button>
          {cssUnicos.map(cs => (
            <button
              key={cs}
              onClick={() => setCsFilter(cs === csFilter ? '' : cs)}
              className={`rounded-xl border p-3 text-left transition-colors ${csFilter === cs ? 'border-[var(--autoforce-600)] bg-[var(--autoforce-50)]' : 'border-border bg-card hover:bg-muted/30'}`}
            >
              <p className="text-lg font-semibold">{data.porCS[cs].toLocaleString('pt-BR')}</p>
              <div className="flex items-center gap-1 mt-0.5">
                <User className="w-3 h-3 text-muted-foreground" />
                <p className="text-xs text-muted-foreground truncate">{cs}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Busca */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Buscar por empresa, CNPJ ou CS..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-[var(--autoforce-400)]"
        />
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando clientes...
        </div>
      )}
      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          Erro ao carregar clientes
        </div>
      )}

      {/* Tabela */}
      {data && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <p className="text-sm font-medium">
              {filtered.length.toLocaleString('pt-BR')} cliente{filtered.length !== 1 ? 's' : ''}
              {csFilter && <span className="text-muted-foreground"> — CS: {csFilter}</span>}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="text-xs w-full">
              <thead className="bg-muted/50">
                <tr>
                  {['Empresa', 'CS Responsável', 'Contato', 'Email', 'Telefone', 'Cidade/UF', 'Site', 'Provedor', 'Speed'].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((c, i) => (
                  <tr key={c.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-3 py-2 font-medium max-w-[160px] truncate" title={c.empresa}>{c.empresa}</td>
                    <td className="px-3 py-2">
                      {c.csResponsavel
                        ? <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-medium">{c.csResponsavel}</span>
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-2 max-w-[120px] truncate">{c.contato || '—'}</td>
                    <td className="px-3 py-2 max-w-[160px] truncate">{c.emailContato || c.emailEmpresa || '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{c.telefoneContato || c.telefoneEmpresa || '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{c.cidade && c.uf ? `${c.cidade}/${c.uf}` : '—'}</td>
                    <td className="px-3 py-2">
                      {c.site
                        ? <a href={c.site} target="_blank" rel="noopener noreferrer" className="text-[var(--autoforce-600)] hover:underline max-w-[110px] block truncate">{c.site.replace(/https?:\/\/(www\.)?/, '')}</a>
                        : '—'}
                    </td>
                    <td className="px-3 py-2">
                      {c.provedor ? <span className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-medium">{c.provedor}</span> : '—'}
                    </td>
                    <td className="px-3 py-2">
                      {c.pagespeed !== ''
                        ? <span className={`font-medium ${Number(c.pagespeed) >= 70 ? 'text-green-600' : Number(c.pagespeed) >= 50 ? 'text-yellow-600' : 'text-red-500'}`}>{c.pagespeed}</span>
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && !isLoading && (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhum cliente encontrado</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Upload, ArrowRight, Check, Loader2, AlertCircle, History } from 'lucide-react';
import axios from 'axios';

const api = axios.create({ baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001' });

type Step = 'upload' | 'mapping' | 'preview' | 'done';
type MatchStrategy = 'email' | 'domain' | 'cnpj' | 'empresa';

const MATCH_STRATEGIES: { value: MatchStrategy; label: string; desc: string }[] = [
  { value: 'email',   label: 'Email exato',    desc: 'Compara email da planilha com emailReceita ou email do banco' },
  { value: 'domain',  label: 'Domínio do email', desc: 'Extrai domínio do email e compara com URLs de websites' },
  { value: 'cnpj',    label: 'CNPJ',           desc: 'Compara CNPJ (remove formatação automaticamente)' },
  { value: 'empresa', label: 'Nome da empresa', desc: 'Busca por similaridade de nome (mais lento)' },
];

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return { headers: [], rows: [] };
  const sep = lines[0].includes('\t') ? '\t' : ',';
  const headers = lines[0].split(sep).map(h => h.replace(/"/g, '').trim());
  const rows = lines.slice(1).map(line => {
    const cols = line.split(sep).map(c => c.replace(/"/g, '').trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = cols[i] || ''; });
    return row;
  }).filter(r => Object.values(r).some(v => v));
  return { headers, rows };
}

const SOURCE_LABELS: Record<string, string> = {
  rd_station: 'RD Station',
  google_sheets: 'Google Sheets',
  manual: 'Manual',
  hubspot: 'HubSpot',
  outro: 'Outro',
};

export default function ImportacaoPage() {
  const [step, setStep] = useState<Step>('upload');
  const [filename, setFilename] = useState('');
  const [source, setSource] = useState('rd_station');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({}); // csvCol → storeField
  const [strategies, setStrategies] = useState<MatchStrategy[]>(['email', 'domain']);
  const [marcarComoCliente, setMarcarComoCliente] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createResult, setCreateResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: fields } = useQuery({
    queryKey: ['import-fields'],
    queryFn: async () => { const r = await api.get('/imports/fields'); return r.data.data; },
  });

  const { data: jobs, refetch: refetchJobs } = useQuery({
    queryKey: ['import-jobs'],
    queryFn: async () => { const r = await api.get('/imports'); return r.data.data; },
  });

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFilename(file.name);
    const reader = new FileReader();
    reader.onload = ev => {
      const { headers, rows } = parseCSV(ev.target?.result as string);
      setHeaders(headers);
      setRows(rows);
      // Auto-mapping por nome de coluna
      const autoMap: Record<string, string> = {};
      for (const h of headers) {
        const hl = h.toLowerCase().trim();
        if (hl.includes('email') && !hl.includes('receita')) autoMap[h] = 'contactEmail';
        else if ((hl === 'nome' || hl === 'name' || hl === 'primeiro nome' || hl === 'first name') && !hl.includes('fantasia') && !hl.includes('empresa')) autoMap[h] = 'contactName';
        else if (hl.includes('cargo') || hl.includes('role') || hl.includes('position') || hl.includes('ocupação') || hl.includes('ocupacao')) autoMap[h] = 'contactRole';
        else if (hl.includes('celular') || hl.includes('mobile') || hl.includes('número de celular')) autoMap[h] = 'contactPhone';
        else if ((hl.includes('telefone') || hl.includes('número de telefone') || hl.includes('phone')) && !hl.includes('receita') && !hl.includes('celular')) autoMap[h] = 'phone';
        else if (hl.includes('whatsapp')) autoMap[h] = 'whatsapp';
        else if (hl.includes('instagram')) autoMap[h] = 'instagram';
        else if (hl.includes('facebook')) autoMap[h] = 'facebook';
        else if (hl.includes('linkedin')) autoMap[h] = 'linkedin';
        else if (hl.includes('cnpj')) autoMap[h] = 'cnpj';
        else if (hl === 'empresa' || hl === 'company' || hl.includes('nome fantasia') || hl.includes('razao') || hl.includes('razão')) autoMap[h] = 'nomeFantasia';
        else if (hl === 'site' || hl === 'url' || hl === 'website' || hl === 'url pública' || hl === 'url publica' || hl === 'url do site' || hl.includes('url do site') || hl.includes('website url')) autoMap[h] = 'websiteUrl';
        else if (hl === 'marca' || hl === 'brand') autoMap[h] = 'brandName';
        else if (hl.includes('proprietário') || hl.includes('proprietario') || hl === 'cs' || hl.includes('cs responsavel') || hl.includes('responsável')) autoMap[h] = 'csResponsavel';
      }
      setMapping(autoMap);
      setStep('mapping');
    };
    reader.readAsText(file, 'UTF-8');
  }

  async function handlePreview() {
    const columnMapping = Object.entries(mapping)
      .filter(([, v]) => v)
      .map(([csvColumn, storeField]) => ({ csvColumn, storeField }));

    setLoading(true);
    setError(null);
    try {
      const res = await api.post('/imports/preview', { rows, columnMapping, matchStrategies: strategies, filename });
      setPreview(res.data);
      setStep('preview');
    } catch (e: any) {
      setError(e?.message || 'Erro ao gerar preview');
    } finally {
      setLoading(false);
    }
  }

  async function handleExecute() {
    const columnMapping = Object.entries(mapping)
      .filter(([, v]) => v)
      .map(([csvColumn, storeField]) => ({ csvColumn, storeField }));

    setLoading(true);
    setError(null);
    try {
      const res = await api.post('/imports/execute', { rows, columnMapping, matchStrategies: strategies, filename, source, marcarComoCliente });
      setResult(res.data);
      setStep('done');
      refetchJobs();
    } catch (e: any) {
      setError(e?.message || 'Erro ao executar importação');
    } finally {
      setLoading(false);
    }
  }

  async function handleCriarNaoEncontrados() {
    if (!result?.unmatchedRows || !rows.length) return;
    // Pega as linhas que não foram encontradas — envia todas, o backend deduplica
    const emailCol = Object.entries(mapping).find(([, v]) => v === 'contactEmail')?.[0]
      || headers.find(h => h.toLowerCase().includes('email'));
    const nomeCol = Object.entries(mapping).find(([, v]) => v === 'contactName')?.[0];
    const empresaCol = Object.entries(mapping).find(([, v]) => v === 'nomeFantasia')?.[0]
      || headers.find(h => h.toLowerCase() === 'empresa' || h.toLowerCase().includes('company') || h.toLowerCase().includes('nome da empresa'));
    const telefoneCol = Object.entries(mapping).find(([, v]) => v === 'phone')?.[0]
      || Object.entries(mapping).find(([, v]) => v === 'contactPhone')?.[0];
    const siteCol = Object.entries(mapping).find(([, v]) => v === 'websiteUrl')?.[0];

    const contacts = rows.map(r => ({
      email: emailCol ? r[emailCol] : undefined,
      nome: nomeCol ? r[nomeCol] : undefined,
      empresa: empresaCol ? r[empresaCol] : undefined,
      telefone: telefoneCol ? r[telefoneCol] : undefined,
      site: siteCol ? r[siteCol] : undefined,
    })).filter(c => c.empresa?.trim());

    setCreating(true);
    try {
      const res = await api.post('/stores/create-from-contacts', { contacts, marcarComoCliente });
      setCreateResult(res.data);
    } catch (e: any) {
      setError(e?.message || 'Erro ao criar registros');
    } finally {
      setCreating(false);
    }
  }

  function reset() {
    setStep('upload'); setFilename(''); setHeaders([]); setRows([]);
    setMapping({}); setPreview(null); setResult(null); setError(null);
    setCreateResult(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Importação de Planilhas</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Importe dados de qualquer planilha para enriquecer os registros do banco</p>
      </div>

      {/* Steps */}
      <div className="flex items-center gap-2 text-sm">
        {(['upload','mapping','preview','done'] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${step === s ? 'bg-[var(--autoforce-600)] text-white' : ['upload','mapping','preview','done'].indexOf(step) > i ? 'bg-green-500 text-white' : 'bg-muted text-muted-foreground'}`}>
              {['upload','mapping','preview','done'].indexOf(step) > i ? <Check className="w-3 h-3" /> : i + 1}
            </div>
            <span className={step === s ? 'text-foreground font-medium' : 'text-muted-foreground'}>
              {['Upload', 'Mapeamento', 'Preview', 'Concluído'][i]}
            </span>
            {i < 3 && <ArrowRight className="w-3 h-3 text-muted-foreground" />}
          </div>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Fonte da planilha</label>
              <select value={source} onChange={e => setSource(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background">
                {Object.entries(SOURCE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>
          <div
            className="border-2 border-dashed border-border rounded-xl p-10 text-center cursor-pointer hover:border-[var(--autoforce-400)] transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm font-medium">Clique para fazer upload do CSV</p>
            <p className="text-xs text-muted-foreground mt-1">Separado por vírgula ou tab — UTF-8</p>
            <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={handleFile} />
          </div>
        </div>
      )}

      {/* Step 2: Mapping */}
      {step === 'mapping' && (
        <div className="space-y-5">
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            <p className="text-sm font-medium">{rows.length.toLocaleString('pt-BR')} linhas carregadas de <span className="text-[var(--autoforce-600)]">{filename}</span></p>

            {/* Estratégias de match */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Estratégias de cruzamento (em ordem de prioridade)</p>
              <div className="grid grid-cols-2 gap-2">
                {MATCH_STRATEGIES.map(s => (
                  <label key={s.value} className="flex items-start gap-2 p-2 rounded-lg border border-border cursor-pointer hover:bg-muted/30">
                    <input type="checkbox" checked={strategies.includes(s.value)}
                      onChange={e => setStrategies(prev => e.target.checked ? [...prev, s.value] : prev.filter(x => x !== s.value))}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="text-xs font-medium">{s.label}</p>
                      <p className="text-[10px] text-muted-foreground">{s.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Marcar como cliente */}
            <label className="flex items-center gap-3 p-3 rounded-lg border border-border cursor-pointer hover:bg-muted/30">
              <input
                type="checkbox"
                checked={marcarComoCliente}
                onChange={e => setMarcarComoCliente(e.target.checked)}
                className="w-4 h-4 accent-[var(--autoforce-600)]"
              />
              <div>
                <p className="text-sm font-medium">Marcar todos como cliente Autoforce</p>
                <p className="text-xs text-muted-foreground">Os registros encontrados serão sinalizados como clientes e removidos da lista de prospecção do SDR</p>
              </div>
            </label>

            {/* Mapeamento de colunas */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Mapeamento de colunas → campos do banco</p>
              <div className="space-y-2">
                {headers.map(h => (
                  <div key={h} className="flex items-center gap-3">
                    <span className="text-xs font-mono bg-muted px-2 py-1 rounded w-48 truncate flex-shrink-0">{h}</span>
                    <ArrowRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                    <select
                      value={mapping[h] || ''}
                      onChange={e => setMapping(prev => ({ ...prev, [h]: e.target.value }))}
                      className="flex-1 border border-border rounded-lg px-2 py-1 text-xs bg-background"
                    >
                      <option value="">— Ignorar —</option>
                      {fields && Object.entries(fields as Record<string, { label: string }>).map(([k, v]) => (
                        <option key={k} value={k}>{v.label}</option>
                      ))}
                    </select>
                    {mapping[h] && <Check className="w-3 h-3 text-green-500 flex-shrink-0" />}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={reset} className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors">Voltar</button>
            <button onClick={handlePreview} disabled={loading || !Object.values(mapping).some(v => v)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--autoforce-600)] text-white text-sm font-medium hover:bg-[var(--autoforce-700)] transition-colors disabled:opacity-60">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              {loading ? 'Gerando preview...' : 'Ver Preview'}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Preview */}
      {step === 'preview' && preview && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground">Total de linhas</p>
              <p className="text-2xl font-semibold mt-1">{preview.totalRows.toLocaleString('pt-BR')}</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground">Encontrados no banco</p>
              <p className="text-2xl font-semibold mt-1 text-green-600">{preview.matchedRows.toLocaleString('pt-BR')}</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground">Campos a preencher</p>
              <p className="text-2xl font-semibold mt-1 text-[var(--autoforce-600)]">{preview.fieldsToUpdate.toLocaleString('pt-BR')}</p>
              <p className="text-xs text-muted-foreground">apenas campos vazios</p>
            </div>
          </div>

          {preview.preview.length > 0 && (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <p className="px-4 py-3 text-sm font-medium border-b border-border">Preview (primeiros 20 registros com mudanças)</p>
              <div className="divide-y divide-border">
                {preview.preview.map((p: any, i: number) => (
                  <div key={i} className="px-4 py-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-medium">{p.empresa}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{p.matchMethod}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {p.updates.map((u: any, j: number) => (
                        <div key={j} className="text-xs bg-green-50 border border-green-200 rounded px-2 py-1">
                          <span className="text-muted-foreground">{u.label}:</span>{' '}
                          <span className="font-medium text-green-700">{u.newValue}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button onClick={() => setStep('mapping')} className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors">Voltar</button>
            <button onClick={handleExecute} disabled={loading} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--autoforce-600)] text-white text-sm font-medium hover:bg-[var(--autoforce-700)] transition-colors disabled:opacity-60">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {loading ? 'Importando...' : `Confirmar e Importar`}
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Done */}
      {step === 'done' && result && (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <Check className="w-8 h-8 text-green-500" />
              <p className="text-lg font-semibold text-green-700">Importação concluída!</p>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {[
                ['Total', result.totalRows],
                ['Encontrados', result.matchedRows],
                ['Atualizados', result.updatedRows],
                ['Não encontrados', result.unmatchedRows],
              ].map(([l, v]) => (
                <div key={l} className="bg-white rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">{l}</p>
                  <p className="text-xl font-semibold mt-0.5">{Number(v).toLocaleString('pt-BR')}</p>
                </div>
              ))}
            </div>
            {result.marcadosCliente > 0 && (
              <p className="text-sm text-green-700 mt-3">✓ {result.marcadosCliente} marcados como cliente Autoforce</p>
            )}
          </div>

          {/* Criar não encontrados */}
          {result.unmatchedRows > 0 && !createResult && (
            <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{result.unmatchedRows.toLocaleString('pt-BR')} registros não encontrados na base</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {marcarComoCliente
                    ? 'Criar esses registros e marcar como cliente Autoforce'
                    : 'Criar esses registros na base para enriquecimento'}
                </p>
              </div>
              <button
                onClick={handleCriarNaoEncontrados}
                disabled={creating}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors disabled:opacity-60 whitespace-nowrap"
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                {creating ? 'Criando...' : `Criar ${result.unmatchedRows.toLocaleString('pt-BR')} registros`}
              </button>
            </div>
          )}

          {createResult && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <p className="text-sm font-medium text-blue-700">
                ✓ {createResult.created.toLocaleString('pt-BR')} registros criados
                {createResult.enrichQueued > 0 && ` · ${createResult.enrichQueued} na fila de enriquecimento`}
                {createResult.skipped > 0 && ` · ${createResult.skipped} ignorados (já existiam)`}
              </p>
            </div>
          )}

          <button onClick={reset} className="px-4 py-2 rounded-lg bg-[var(--autoforce-600)] text-white text-sm font-medium hover:bg-[var(--autoforce-700)] transition-colors">
            Nova Importação
          </button>
        </div>
      )}

      {/* Histórico */}
      {jobs && jobs.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <History className="w-4 h-4 text-muted-foreground" />
            <p className="text-sm font-medium">Histórico de Importações</p>
          </div>
          <table className="text-xs w-full">
            <thead className="bg-muted/50">
              <tr>
                {['Arquivo','Fonte','Total','Encontrados','Atualizados','Data'].map(h => (
                  <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {jobs.map((j: any) => (
                <tr key={j.id} className="border-t border-border">
                  <td className="px-3 py-2 font-medium">{j.filename}</td>
                  <td className="px-3 py-2">{SOURCE_LABELS[j.source] || j.source}</td>
                  <td className="px-3 py-2">{j.totalRows.toLocaleString('pt-BR')}</td>
                  <td className="px-3 py-2 text-green-600">{j.matchedRows.toLocaleString('pt-BR')}</td>
                  <td className="px-3 py-2 text-[var(--autoforce-600)]">{j.updatedRows.toLocaleString('pt-BR')}</td>
                  <td className="px-3 py-2 text-muted-foreground">{new Date(j.createdAt).toLocaleDateString('pt-BR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

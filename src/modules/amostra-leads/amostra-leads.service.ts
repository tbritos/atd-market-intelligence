import prisma from '../../utils/prisma';
import axios from 'axios';

const APOLLO_API_KEY = process.env.APOLLO_API_KEY || '';
const APOLLO_BASE = 'https://api.apollo.io/api/v1';
const APOLLO_WEBHOOK_URL = process.env.APOLLO_WEBHOOK_URL ?? null;

const HUNTER_API_KEY = process.env.HUNTER_API_KEY || '';
const HUNTER_BASE = 'https://api.hunter.io/v2';

// Seniority levels que indicam poder de decisão
const DECISION_MAKER_SENIORITIES = [
  'owner', 'founder', 'c_suite', 'partner', 'vp', 'director', 'manager',
];

function extractDomain(url: string): string | null {
  try {
    const u = url.startsWith('http') ? url : `https://${url}`;
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

// Pausa para respeitar rate limit da API
function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Normalização de nome de empresa ─────────────────────────────────────────
// Remove marcas de veículos, sufixos jurídicos e palavras genéricas para
// melhorar a precisão em buscas por nome (Apollo, Hunter, Google, etc.)

const BRAND_SUFFIXES = [
  'toyota', 'ford', 'volkswagen', 'vw', 'honda', 'chevrolet', 'gm', 'hyundai',
  'fiat', 'renault', 'peugeot', 'citroen', 'mitsubishi', 'nissan', 'kia',
  'jeep', 'dodge', 'ram', 'chrysler', 'bmw', 'mercedes', 'mercedes-benz',
  'audi', 'volvo', 'land rover', 'jaguar', 'porsche', 'subaru', 'suzuki',
  'isuzu', 'agrale', 'iveco', 'scania', 'volks', 'vw caminhões',
];

const LEGAL_SUFFIXES = [
  'ltda', 'ltda.', 's.a.', 's/a', 'sa', 'me', 'mei', 'eireli', 'epp',
  's.a', 'cia', 'cia.', 'inc', 'llc', 'corp',
];

const GENERIC_WORDS_STANDALONE = [
  // só remove se a empresa tiver mais de 1 palavra restante
  'concessionaria', 'concessionária', 'automoveis', 'automóveis', 'veiculos',
  'veículos', 'motors', 'motor', 'auto', 'autos', 'cars', 'car',
];

export function normalizeCompanyName(name: string): string {
  let result = name.trim();

  // Remove sufixos jurídicos no final (case insensitive)
  for (const suffix of LEGAL_SUFFIXES) {
    const re = new RegExp(`[,\\s]+${suffix.replace('.', '\\.')}\\s*$`, 'i');
    result = result.replace(re, '').trim();
  }

  // Remove marcas de veículos onde quer que apareçam
  for (const brand of BRAND_SUFFIXES) {
    const re = new RegExp(`\\b${brand.replace('-', '\\-')}\\b`, 'gi');
    result = result.replace(re, '').trim();
  }

  // Remove espaços múltiplos e hífens/barras soltos
  result = result.replace(/\s{2,}/g, ' ').replace(/^[-/\s]+|[-/\s]+$/g, '').trim();

  // Remove palavras genéricas apenas se restar mais de 1 palavra
  const words = result.split(/\s+/);
  if (words.length > 1) {
    const filtered = words.filter(w => !GENERIC_WORDS_STANDALONE.includes(w.toLowerCase()));
    if (filtered.length > 0) result = filtered.join(' ');
  }

  return result || name.trim(); // fallback para o nome original se tudo for removido
}

export interface PessoaInput {
  nome: string;
  email?: string;
  cargo?: string;
  linkedin?: string;
  telefone?: string;
  isPrincipal?: boolean;
}

export interface AmostraLeadInput {
  email?: string;
  nome?: string;
  telefone?: string;
  celular?: string;
  cargo?: string;
  empresa: string;
  site?: string;
  plataformaDoSite?: string;
}

function calcScore(lead: {
  nome?: string | null;
  email?: string | null;
  telefone?: string | null;
  celular?: string | null;
  cargo?: string | null;
  site?: string | null;
  plataformaDoSite?: string | null;
  siteEncontrado?: string | null;
  emailDecisor?: string | null;
  cargoDecisor?: string | null;
  linkedinDecisor?: string | null;
  telefoneDecisor?: string | null;
  whatsappApify?: string | null;
  instagramApify?: string | null;
  emailEmpresaApify?: string | null;
  emailHunter?: string | null;
}): number {
  let score = 0;
  // Dados originais
  if (lead.nome) score += 10;
  if (lead.email) score += 10;
  if (lead.telefone || lead.celular) score += 5;
  if (lead.cargo) score += 5;
  if (lead.site) score += 10;
  if (lead.plataformaDoSite) score += 5;
  // Enriquecimento
  if (lead.siteEncontrado) score += 10;
  if (lead.emailDecisor) score += 15;
  if (lead.cargoDecisor) score += 5;
  if (lead.linkedinDecisor) score += 5;
  if (lead.telefoneDecisor) score += 5;
  if (lead.whatsappApify) score += 5;
  if (lead.instagramApify) score += 3;
  if (lead.emailEmpresaApify) score += 5;
  if (lead.emailHunter) score += 12;
  return Math.min(score, 100);
}

export class AmostraLeadsService {
  async importLeads(rows: AmostraLeadInput[]) {
    let created = 0;
    let skipped = 0;

    for (const row of rows) {
      if (!row.empresa?.trim()) { skipped++; continue; }

      // Deduplicação por empresa (nome normalizado)
      const empresaNorm = row.empresa.trim().toLowerCase();
      const exists = await prisma.amostraLead.findFirst({
        where: { empresa: { equals: empresaNorm, mode: 'insensitive' } },
        select: { id: true },
      });
      if (exists) { skipped++; continue; }

      const score = calcScore(row);
      await prisma.amostraLead.create({
        data: {
          email: row.email?.trim() || null,
          nome: row.nome?.trim() || null,
          telefone: row.telefone?.trim() || null,
          celular: row.celular?.trim() || null,
          cargo: row.cargo?.trim() || null,
          empresa: row.empresa.trim(),
          site: row.site?.trim() || null,
          plataformaDoSite: row.plataformaDoSite?.trim() || null,
          scoreEnriquecimento: score,
        },
      });
      created++;
    }

    return { created, skipped };
  }

  async exportCsv() {
    const leads = await prisma.amostraLead.findMany({
      orderBy: [{ empresa: 'asc' }],
      include: { pessoas: { orderBy: [{ isPrincipal: 'desc' }, { createdAt: 'asc' }] } },
    });

    const esc = (v: string | null | undefined) => {
      if (!v) return '';
      const s = String(v).replace(/"/g, '""');
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s;
    };

    const maxPessoas = leads.reduce((max, l) => Math.max(max, l.pessoas.length), 0) || 1;

    const pessoaHeaders: string[] = [];
    for (let i = 1; i <= maxPessoas; i++) {
      pessoaHeaders.push(`Pessoa ${i} Nome`, `Pessoa ${i} Cargo`, `Pessoa ${i} Email`, `Pessoa ${i} Telefone`, `Pessoa ${i} LinkedIn`);
    }

    const headers = [
      'Empresa', 'Site', 'Provedor', 'Cidade', 'Estado', 'Telefone Empresa', 'LinkedIn Empresa',
      ...pessoaHeaders,
    ];

    const rows: string[] = [headers.join(',')];

    for (const lead of leads) {
      const base = [
        esc(lead.empresa),
        esc(lead.siteEncontrado ?? lead.site),
        esc(lead.plataformaDoSite),
        esc(lead.cidadeApollo),
        esc(lead.estadoApollo),
        esc(lead.telefoneApollo),
        esc(lead.linkedinEmpresa),
      ];

      const pessoaCols: string[] = [];
      for (let i = 0; i < maxPessoas; i++) {
        const p = lead.pessoas[i];
        pessoaCols.push(
          esc(p?.nome), esc(p?.cargo), esc(p?.email), esc(p?.telefone), esc(p?.linkedin),
        );
      }

      rows.push([...base, ...pessoaCols].join(','));
    }

    return rows.join('\n');
  }

  async listLeads(search?: string) {
    const where = search
      ? {
          OR: [
            { empresa: { contains: search, mode: 'insensitive' as const } },
            { nome: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
            { site: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const leads = await prisma.amostraLead.findMany({
      where,
      orderBy: [{ scoreEnriquecimento: 'desc' }, { createdAt: 'asc' }],
      include: { pessoas: { orderBy: [{ isPrincipal: 'desc' }, { createdAt: 'asc' }] } },
    });

    return { total: leads.length, leads };
  }

  async getStats() {
    const all = await prisma.amostraLead.findMany({
      select: {
        statusSerpapi: true,
        statusApollo: true,
        statusApify: true,
        statusHunter: true,
        scoreEnriquecimento: true,
        siteEncontrado: true,
        emailDecisor: true,
        emailHunter: true,
        whatsappApify: true,
        linkedinDecisor: true,
        pessoas: { select: { email: true, telefone: true } },
      },
    });

    const total = all.length;
    const countStatus = (api: 'statusSerpapi' | 'statusApollo' | 'statusApify' | 'statusHunter', status: string) =>
      all.filter(l => l[api] === status).length;

    return {
      total,
      serpapi: {
        pending: countStatus('statusSerpapi', 'pending'),
        running: countStatus('statusSerpapi', 'running'),
        done: countStatus('statusSerpapi', 'done'),
        error: countStatus('statusSerpapi', 'error'),
      },
      apollo: {
        pending: countStatus('statusApollo', 'pending'),
        running: countStatus('statusApollo', 'running'),
        done: countStatus('statusApollo', 'done'),
        error: countStatus('statusApollo', 'error'),
      },
      apify: {
        pending: countStatus('statusApify', 'pending'),
        running: countStatus('statusApify', 'running'),
        done: countStatus('statusApify', 'done'),
        error: countStatus('statusApify', 'error'),
      },
      hunter: {
        pending: countStatus('statusHunter', 'pending'),
        running: countStatus('statusHunter', 'running'),
        done: countStatus('statusHunter', 'done'),
        error: countStatus('statusHunter', 'error'),
      },
      resultados: {
        comSite: all.filter(l => l.siteEncontrado || /* site original já tem */ false).length,
        comEmailDecisor: all.filter(l => l.emailDecisor).length,
        comEmailHunter: all.filter(l => l.emailHunter).length,
        comWhatsapp: all.filter(l => l.whatsappApify).length,
        comLinkedin: all.filter(l => l.linkedinDecisor).length,
      },
      scoreMedio: total > 0
        ? Math.round(all.reduce((acc, l) => acc + l.scoreEnriquecimento, 0) / total)
        : 0,
      pessoas: (() => {
        const totalPessoas = all.reduce((s, l) => s + l.pessoas.length, 0);
        const comEmail = all.reduce((s, l) => s + l.pessoas.filter(p => p.email).length, 0);
        const comTelefone = all.reduce((s, l) => s + l.pessoas.filter(p => p.telefone).length, 0);
        const empresasComPessoas = all.filter(l => l.pessoas.length > 0).length;
        return {
          total: totalPessoas,
          comEmail,
          comTelefone,
          mediaPorEmpresa: empresasComPessoas > 0
            ? Math.round((totalPessoas / empresasComPessoas) * 10) / 10
            : 0,
        };
      })(),
    };
  }

  async testApolloLead(leadId?: string) {
    if (!APOLLO_API_KEY) throw new Error('APOLLO_API_KEY não configurada no .env');

    // Pega o lead especificado ou o primeiro com site
    const lead = leadId
      ? await prisma.amostraLead.findUniqueOrThrow({ where: { id: leadId } })
      : await prisma.amostraLead.findFirst({
          where: { OR: [{ site: { not: null } }, { siteEncontrado: { not: null } }] },
          orderBy: { createdAt: 'asc' },
        });

    if (!lead) throw new Error('Nenhum lead com site encontrado');

    const siteUrl = lead.siteEncontrado || lead.site;
    const domain = siteUrl ? extractDomain(siteUrl) : null;
    if (!domain) throw new Error(`Lead "${lead.empresa}" não tem domínio válido`);

    // Chama Apollo e retorna resposta bruta para análise
    let rawResponse;
    try {
      rawResponse = await axios.get(
        `${APOLLO_BASE}/organizations/enrich`,
        {
          params: { domain },
          headers: { 'X-Api-Key': APOLLO_API_KEY },
        }
      );
    } catch (err: any) {
      const status = err?.response?.status;
      const msg = JSON.stringify(err?.response?.data ?? err?.message);
      console.error(`[Apollo Test] Erro ${status}:`, msg);
      throw new Error(`Apollo retornou ${status}: ${msg}`);
    }

    return {
      lead: { id: lead.id, empresa: lead.empresa, site: siteUrl, domain },
      apolloRawResponse: rawResponse.data,
      totalPeople: rawResponse.data?.people?.length ?? 0,
    };
  }

  async enrichWithApollo() {
    if (!APOLLO_API_KEY) throw new Error('APOLLO_API_KEY não configurada no .env');

    const leads = await prisma.amostraLead.findMany({
      where: {
        apolloOrgId: null,
        OR: [{ site: { not: null } }, { siteEncontrado: { not: null } }],
      },
    });

    let processed = 0;
    let found = 0;
    let errors = 0;

    for (const lead of leads) {
      const siteUrl = lead.siteEncontrado || lead.site;
      const domain = siteUrl ? extractDomain(siteUrl) : null;

      if (!domain) {
        await prisma.amostraLead.update({
          where: { id: lead.id },
          data: { statusApollo: 'skipped', erroApollo: 'Sem domínio válido' },
        });
        processed++;
        continue;
      }

      await prisma.amostraLead.update({
        where: { id: lead.id },
        data: { statusApollo: 'running' },
      });

      try {
        const resp = await axios.get(`${APOLLO_BASE}/organizations/enrich`, {
          params: { domain },
          headers: { 'X-Api-Key': APOLLO_API_KEY },
        });

        const org = resp.data?.organization;
        if (!org) {
          await prisma.amostraLead.update({
            where: { id: lead.id },
            data: { statusApollo: 'done', erroApollo: 'Empresa não encontrada no Apollo' },
          });
          processed++;
          await sleep(500);
          continue;
        }

        const techs: string[] = (org.technology_names ?? []).slice(0, 20);
        const deptos = org.departmental_head_count ?? null;

        const updateData = {
          statusApollo: 'done',
          erroApollo: null as string | null,
          apolloOrgId: org.id ?? null,
          telefoneApollo: org.phone ?? org.primary_phone?.number ?? null,
          linkedinEmpresa: org.linkedin_url ?? null,
          descricaoApollo: org.short_description ?? null,
          cidadeApollo: org.city ?? null,
          estadoApollo: org.state ?? null,
          fundadoEmApollo: org.founded_year ?? null,
          tamanhoEmpresa: org.estimated_num_employees ? String(org.estimated_num_employees) : null,
          tecnologias: techs.length > 0 ? JSON.stringify(techs) : null,
          keywordsApollo: org.keywords?.length > 0 ? JSON.stringify(org.keywords.slice(0, 30)) : null,
          departamentosApollo: deptos ? JSON.stringify(deptos) : null,
        };

        const current = await prisma.amostraLead.findUniqueOrThrow({ where: { id: lead.id } });
        await prisma.amostraLead.update({
          where: { id: lead.id },
          data: { ...updateData, scoreEnriquecimento: calcScore({ ...current, ...updateData }) },
        });

        found++;
        processed++;
      } catch (err: any) {
        const msg = err?.response?.data?.error ?? err?.message ?? 'Erro desconhecido';
        await prisma.amostraLead.update({
          where: { id: lead.id },
          data: { statusApollo: 'error', erroApollo: msg },
        });
        errors++;
        processed++;
      }

      await sleep(500);
    }

    return { processed, found, errors, total: leads.length };
  }

  async testHunterFull(domain: string, nome?: string) {
    if (!HUNTER_API_KEY) throw new Error('HUNTER_API_KEY não configurada no .env');

    const results: any = { domain, emailFinder: null, domainSearch: null, companyEnrich: null, errors: [] };

    // 1. Email Finder pelo nome (se fornecido)
    if (nome) {
      const parts = nome.trim().split(/\s+/);
      const firstName = parts[0];
      const lastName = parts.slice(1).join(' ') || undefined;
      try {
        const resp = await axios.get(`${HUNTER_BASE}/email-finder`, {
          params: { domain, first_name: firstName, last_name: lastName, api_key: HUNTER_API_KEY },
        });
        results.emailFinder = resp.data?.data ?? null;
      } catch (err: any) {
        results.errors.push(`email-finder: ${err?.response?.status} ${JSON.stringify(err?.response?.data ?? err?.message)}`);
      }
      await sleep(500);
    }

    // 2. Domain Search
    try {
      const resp = await axios.get(`${HUNTER_BASE}/domain-search`, {
        params: { domain, api_key: HUNTER_API_KEY, limit: 10 },
      });
      results.domainSearch = resp.data?.data ?? null;
    } catch (err: any) {
      results.errors.push(`domain-search: ${err?.response?.status} ${JSON.stringify(err?.response?.data ?? err?.message)}`);
    }

    await sleep(500);

    // 3. Company Enrichment
    try {
      const resp = await axios.get(`${HUNTER_BASE}/companies/find`, {
        params: { domain, api_key: HUNTER_API_KEY },
      });
      results.companyEnrich = resp.data?.data ?? null;
    } catch (err: any) {
      results.errors.push(`companies/find: ${err?.response?.status} ${JSON.stringify(err?.response?.data ?? err?.message)}`);
    }

    return results;
  }

  async enrichWithHunter() {
    if (!HUNTER_API_KEY) throw new Error('HUNTER_API_KEY não configurada no .env');

    // Prioriza leads com email (domínio certo), aceita também leads com site
    const leads = await prisma.amostraLead.findMany({
      where: {
        statusHunter: 'pending',
        OR: [
          { email: { not: null } },
          { site: { not: null } },
          { siteEncontrado: { not: null } },
        ],
      },
    });

    let processed = 0;
    let found = 0;
    let errors = 0;

    for (const lead of leads) {
      // Domínio do email tem prioridade — é o mais confiável
      const emailDomain = lead.email ? lead.email.split('@')[1]?.toLowerCase() : null;
      const siteDomain = extractDomain(lead.siteEncontrado || lead.site || '');
      const domain = emailDomain || siteDomain;

      if (!domain) {
        await prisma.amostraLead.update({
          where: { id: lead.id },
          data: { statusHunter: 'skipped', erroHunter: 'Sem domínio válido' },
        });
        processed++;
        continue;
      }

      await prisma.amostraLead.update({
        where: { id: lead.id },
        data: { statusHunter: 'running' },
      });

      try {
        let emailHunter: string | null = null;
        let emailHunterScore: number | null = null;
        let cargoHunter: string | null = null;
        let nomeHunter: string | null = null;
        let erroHunter: string | null = null;

        // 1. Se tem nome, tenta email-finder direto (mais preciso)
        if (lead.nome) {
          const parts = lead.nome.trim().split(/\s+/);
          const firstName = parts[0];
          const lastName = parts.slice(1).join(' ') || undefined;
          try {
            const finderResp = await axios.get(`${HUNTER_BASE}/email-finder`, {
              params: { domain, first_name: firstName, last_name: lastName, api_key: HUNTER_API_KEY },
            });
            const finder = finderResp.data?.data;
            if (finder?.email && (finder.score ?? 0) >= 50) {
              emailHunter = finder.email;
              emailHunterScore = finder.score;
            }
          } catch { /* segue para domain-search */ }
          await sleep(500);
        }

        // 2. Se email-finder não achou, tenta domain-search
        if (!emailHunter) {
          const searchResp = await axios.get(`${HUNTER_BASE}/domain-search`, {
            params: { domain, api_key: HUNTER_API_KEY, limit: 10 },
          });
          const emails: any[] = searchResp.data?.data?.emails ?? [];

          if (emails.length > 0) {
            const decisionKeywords = ['diretor', 'director', 'ceo', 'coo', 'cto', 'gerente', 'manager', 'presidente', 'owner', 'founder', 'socio', 'sócio'];
            const sorted = [...emails].sort((a, b) => {
              const aScore = decisionKeywords.some(k => (a.position ?? '').toLowerCase().includes(k)) ? 1 : 0;
              const bScore = decisionKeywords.some(k => (b.position ?? '').toLowerCase().includes(k)) ? 1 : 0;
              return bScore !== aScore ? bScore - aScore : (b.confidence ?? 0) - (a.confidence ?? 0);
            });
            const best = sorted[0];
            emailHunter = best.value ?? null;
            emailHunterScore = best.confidence ?? null;
            cargoHunter = best.position ?? null;
            nomeHunter = [best.first_name, best.last_name].filter(Boolean).join(' ') || null;
          } else {
            erroHunter = `Nenhum email encontrado (domínio: ${domain})`;
          }
        }

        const current = await prisma.amostraLead.findUniqueOrThrow({ where: { id: lead.id } });
        const updateData = {
          statusHunter: 'done',
          erroHunter,
          emailHunter,
          emailHunterScore,
          emailDecisor: current.emailDecisor ?? emailHunter ?? null,
          cargoDecisor: current.cargoDecisor ?? cargoHunter ?? null,
          nome: current.nome ?? nomeHunter ?? null,
        };

        await prisma.amostraLead.update({
          where: { id: lead.id },
          data: { ...updateData, scoreEnriquecimento: calcScore({ ...current, ...updateData }) },
        });

        if (emailHunter) found++;
        processed++;
      } catch (err: any) {
        const status = err?.response?.status;
        if (status === 429) {
          await prisma.amostraLead.update({
            where: { id: lead.id },
            data: { statusHunter: 'pending', erroHunter: 'Rate limit atingido' },
          });
          break;
        }
        const msg = err?.response?.data?.errors?.[0]?.details ?? err?.message ?? 'Erro desconhecido';
        await prisma.amostraLead.update({
          where: { id: lead.id },
          data: { statusHunter: 'error', erroHunter: msg },
        });
        errors++;
        processed++;
      }

      await sleep(1000);
    }

    return { processed, found, errors, total: leads.length };
  }

  async getApolloUsage() {
    if (!APOLLO_API_KEY) throw new Error('APOLLO_API_KEY não configurada no .env');

    try {
      const resp = await axios.post(
        `${APOLLO_BASE}/usage_stats/api_usage_stats`,
        {},
        { headers: { 'X-Api-Key': APOLLO_API_KEY, 'Content-Type': 'application/json' } },
      );

      const raw = resp.data as Record<string, any>;
      const extract = (endpoint: string, action: string) => {
        const key = `["${endpoint}", "${action}"]`;
        const entry = raw[key];
        if (!entry) return null;
        return {
          day: entry.day ?? null,
          hour: entry.hour ?? null,
          minute: entry.minute ?? null,
        };
      };

      return {
        peopleMatch: extract('api/v1/people', 'match'),
        peopleSearch: extract('api/v1/mixed_people', 'api_search'),
        orgEnrich: extract('api/v1/organizations', 'enrich'),
        raw,
      };
    } catch (err: any) {
      const status = err?.response?.status;
      const msg = JSON.stringify(err?.response?.data ?? err?.message);
      throw new Error(`Apollo usage_stats retornou ${status}: ${msg}`);
    }
  }

  async testOrgEnrichByDomain(domain: string) {
    if (!APOLLO_API_KEY) throw new Error('APOLLO_API_KEY não configurada no .env');

    try {
      const resp = await axios.get(`${APOLLO_BASE}/organizations/enrich`, {
        params: { domain },
        headers: { 'X-Api-Key': APOLLO_API_KEY },
      });
      return {
        domain,
        apolloRawResponse: resp.data,
        orgId: resp.data?.organization?.id ?? null,
      };
    } catch (err: any) {
      const status = err?.response?.status;
      const msg = JSON.stringify(err?.response?.data ?? err?.message);
      throw new Error(`Apollo organizations/enrich retornou ${status}: ${msg}`);
    }
  }

  async testOrgTopPeopleById(orgId: string) {
    if (!APOLLO_API_KEY) throw new Error('APOLLO_API_KEY não configurada no .env');

    try {
      const resp = await axios.get(
        `${APOLLO_BASE}/mixed_people/organization_top_people`,
        {
          params: { organization_id: orgId, page: 1, per_page: 10 },
          headers: { 'X-Api-Key': APOLLO_API_KEY },
        },
      );
      return {
        orgId,
        apolloRawResponse: resp.data,
        totalPeople: resp.data?.people?.length ?? 0,
      };
    } catch (err: any) {
      const status = err?.response?.status;
      const msg = JSON.stringify(err?.response?.data ?? err?.message);
      throw new Error(`Apollo organization_top_people retornou ${status}: ${msg}`);
    }
  }

  async testOrgTopPeople(leadId: string) {
    if (!APOLLO_API_KEY) throw new Error('APOLLO_API_KEY não configurada no .env');

    const lead = await prisma.amostraLead.findUniqueOrThrow({ where: { id: leadId } });
    if (!lead.apolloOrgId) throw new Error(`Lead "${lead.empresa}" não tem apolloOrgId — rode o Organization Enrich primeiro`);

    try {
      const resp = await axios.get(
        `${APOLLO_BASE}/mixed_people/organization_top_people`,
        {
          params: {
            organization_id: lead.apolloOrgId,
            page: 1,
            per_page: 10,
          },
          headers: { 'X-Api-Key': APOLLO_API_KEY },
        },
      );
      return {
        lead: { id: lead.id, empresa: lead.empresa, apolloOrgId: lead.apolloOrgId },
        apolloRawResponse: resp.data,
        totalPeople: resp.data?.people?.length ?? 0,
      };
    } catch (err: any) {
      const status = err?.response?.status;
      const msg = JSON.stringify(err?.response?.data ?? err?.message);
      throw new Error(`Apollo organization_top_people retornou ${status}: ${msg}`);
    }
  }

  async testPeopleMatch(leadId: string) {
    if (!APOLLO_API_KEY) throw new Error('APOLLO_API_KEY não configurada no .env');

    const lead = await prisma.amostraLead.findUniqueOrThrow({ where: { id: leadId } });
    const siteUrl = lead.siteEncontrado || lead.site;
    const domain = siteUrl ? extractDomain(siteUrl) : null;
    if (!domain) throw new Error(`Lead "${lead.empresa}" não tem domínio válido`);

    let rawResponse;
    try {
      rawResponse = await axios.post(
        `${APOLLO_BASE}/people/match`,
        { organization_name: lead.empresa, domain },
        { headers: { 'X-Api-Key': APOLLO_API_KEY, 'Content-Type': 'application/json' } },
      );
    } catch (err: any) {
      const status = err?.response?.status;
      const msg = JSON.stringify(err?.response?.data ?? err?.message);
      throw new Error(`Apollo people/match retornou ${status}: ${msg}`);
    }

    return {
      lead: { id: lead.id, empresa: lead.empresa, domain },
      apolloRawResponse: rawResponse.data,
    };
  }

  async testPeopleSearch(leadId: string) {
    if (!APOLLO_API_KEY) throw new Error('APOLLO_API_KEY não configurada no .env');

    const lead = await prisma.amostraLead.findUniqueOrThrow({ where: { id: leadId } });

    const normalizedName = normalizeCompanyName(lead.empresa);

    const payload = {
      q_organization_name: normalizedName,
      person_seniorities: ['owner', 'founder', 'c_suite', 'partner', 'vp', 'director'],
      per_page: 10,
      page: 1,
    };

    let response: any;
    try {
      response = await axios.post(`${APOLLO_BASE}/mixed_people/search`, payload, {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'X-Api-Key': APOLLO_API_KEY,
        },
      });
    } catch (err: any) {
      const status = err?.response?.status;
      const msg = JSON.stringify(err?.response?.data ?? err?.message);
      console.error(`[Apollo People Search] Erro ${status}:`, msg);
      throw new Error(`Apollo retornou ${status}: ${msg}`);
    }

    const people = response.data?.people ?? [];
    return {
      empresa: lead.empresa,
      empresaNormalizada: normalizedName,
      total: people.length,
      people: people.map((p: any) => ({
        name: p.name,
        title: p.title,
        seniority: p.seniority,
        email: p.email,
        email_status: p.email_status,
        linkedin_url: p.linkedin_url,
        organization: p.organization?.name,
        phone: p.phone_numbers?.[0]?.sanitized_number ?? null,
      })),
      rawResponse: response.data,
    };
  }

  async previewNormalizedNames() {
    const leads = await prisma.amostraLead.findMany({
      select: { id: true, empresa: true },
      orderBy: { empresa: 'asc' },
    });
    return leads.map(l => ({
      id: l.id,
      original: l.empresa,
      normalizado: normalizeCompanyName(l.empresa),
      changed: l.empresa !== normalizeCompanyName(l.empresa),
    }));
  }

  async resetLeads() {
    const { count } = await prisma.amostraLead.deleteMany({});
    return { deleted: count };
  }

  async updateEnrichment(id: string, data: Partial<{
    statusSerpapi: string;
    statusApollo: string;
    statusApify: string;
    statusHunter: string;
    siteEncontrado: string;
    contactName: string;
    emailDecisor: string;
    cargoDecisor: string;
    linkedinDecisor: string;
    telefoneDecisor: string;
    tamanhoEmpresa: string;
    tecnologias: string;
    whatsappApify: string;
    instagramApify: string;
    facebookApify: string;
    emailEmpresaApify: string;
    emailHunter: string;
    emailHunterScore: number;
    anotacoes: string;
    erroSerpapi: string;
    erroApollo: string;
    erroApify: string;
    erroHunter: string;
  }>) {
    const current = await prisma.amostraLead.findUniqueOrThrow({ where: { id } });
    const updated = await prisma.amostraLead.update({
      where: { id },
      data: {
        ...data,
        scoreEnriquecimento: calcScore({ ...current, ...data }),
      },
    });
    return updated;
  }

  // ─── Pessoas da Empresa ────────────────────────────────────────────────────

  private async syncPrincipalToLead(leadId: string, pessoa: {
    nome: string; email: string | null; cargo: string | null;
    linkedin: string | null; telefone: string | null;
  }) {
    const current = await prisma.amostraLead.findUniqueOrThrow({ where: { id: leadId } });
    await prisma.amostraLead.update({
      where: { id: leadId },
      data: {
        contactName: pessoa.nome,
        emailDecisor: pessoa.email,
        cargoDecisor: pessoa.cargo,
        linkedinDecisor: pessoa.linkedin,
        telefoneDecisor: pessoa.telefone,
        scoreEnriquecimento: calcScore({
          ...current,
          emailDecisor: pessoa.email,
          cargoDecisor: pessoa.cargo,
          linkedinDecisor: pessoa.linkedin,
          telefoneDecisor: pessoa.telefone,
        }),
      },
    });
  }

  async addPessoa(leadId: string, data: PessoaInput) {
    await prisma.amostraLead.findUniqueOrThrow({ where: { id: leadId } });
    if (data.isPrincipal) {
      await prisma.amostraLeadPessoa.updateMany({ where: { leadId }, data: { isPrincipal: false } });
    }
    const pessoa = await prisma.amostraLeadPessoa.create({
      data: {
        leadId,
        nome: data.nome.trim(),
        email: data.email?.trim() || null,
        cargo: data.cargo?.trim() || null,
        linkedin: data.linkedin?.trim() || null,
        telefone: data.telefone?.trim() || null,
        isPrincipal: data.isPrincipal ?? false,
      },
    });
    if (data.isPrincipal) await this.syncPrincipalToLead(leadId, pessoa);
    return pessoa;
  }

  async updatePessoa(leadId: string, pessoaId: string, data: Partial<PessoaInput>) {
    await prisma.amostraLeadPessoa.findFirstOrThrow({ where: { id: pessoaId, leadId } });
    if (data.isPrincipal) {
      await prisma.amostraLeadPessoa.updateMany({
        where: { leadId, id: { not: pessoaId } },
        data: { isPrincipal: false },
      });
    }
    const pessoa = await prisma.amostraLeadPessoa.update({
      where: { id: pessoaId },
      data: {
        ...(data.nome !== undefined && { nome: (data.nome as string).trim() }),
        ...(data.email !== undefined && { email: data.email ? (data.email as string).trim() || null : null }),
        ...(data.cargo !== undefined && { cargo: data.cargo ? (data.cargo as string).trim() || null : null }),
        ...(data.linkedin !== undefined && { linkedin: data.linkedin ? (data.linkedin as string).trim() || null : null }),
        ...(data.telefone !== undefined && { telefone: data.telefone ? (data.telefone as string).trim() || null : null }),
        ...(data.isPrincipal !== undefined && { isPrincipal: data.isPrincipal }),
      },
    });
    if (data.isPrincipal) await this.syncPrincipalToLead(leadId, pessoa);
    return pessoa;
  }

  async deletePessoa(leadId: string, pessoaId: string) {
    await prisma.amostraLeadPessoa.deleteMany({ where: { id: pessoaId, leadId } });
  }

  async searchPessoasApollo(leadId: string) {
    if (!APOLLO_API_KEY) throw new Error('APOLLO_API_KEY não configurada');
    const lead = await prisma.amostraLead.findUniqueOrThrow({ where: { id: leadId } });
    if (!lead.apolloOrgId) throw new Error('Lead não tem apolloOrgId — enriqueça com Apollo primeiro');

    const res = await axios.post(
      `${APOLLO_BASE}/mixed_people/api_search`,
      { organization_ids: [lead.apolloOrgId], page: 1, per_page: 25 },
      { headers: { 'X-Api-Key': APOLLO_API_KEY, 'Content-Type': 'application/json' } },
    );

    const people: any[] = res.data.people ?? [];
    let created = 0;
    let skipped = 0;

    for (const p of people) {
      const existing = await prisma.amostraLeadPessoa.findFirst({
        where: { leadId, apolloPessoaId: p.id },
        select: { id: true },
      });
      if (existing) { skipped++; continue; }

      await prisma.amostraLeadPessoa.create({
        data: {
          leadId,
          nome: `${p.first_name} ${p.last_name_obfuscated ?? ''}`.trim(),
          cargo: p.title ?? null,
          apolloPessoaId: p.id,
          apolloHasEmail: p.has_email === true,
          apolloHasPhone: p.has_direct_phone === 'Yes',
        },
      });
      created++;
    }

    const pessoas = await prisma.amostraLeadPessoa.findMany({
      where: { leadId },
      orderBy: [{ isPrincipal: 'desc' }, { createdAt: 'asc' }],
    });

    return { total: people.length, created, skipped, pessoas };
  }

  async searchPessoasApolloAll() {
    if (!APOLLO_API_KEY) throw new Error('APOLLO_API_KEY não configurada');

    const leads = await prisma.amostraLead.findMany({
      where: { apolloOrgId: { not: null } },
      select: { id: true, empresa: true, apolloOrgId: true },
    });

    const results: { leadId: string; empresa: string; created: number; skipped: number; error?: string }[] = [];

    for (const lead of leads) {
      try {
        const res = await axios.post(
          `${APOLLO_BASE}/mixed_people/api_search`,
          { organization_ids: [lead.apolloOrgId], page: 1, per_page: 25 },
          { headers: { 'X-Api-Key': APOLLO_API_KEY, 'Content-Type': 'application/json' } },
        );

        const people: any[] = res.data.people ?? [];
        let created = 0;
        let skipped = 0;

        for (const p of people) {
          const existing = await prisma.amostraLeadPessoa.findFirst({
            where: { leadId: lead.id, apolloPessoaId: p.id },
            select: { id: true },
          });
          if (existing) { skipped++; continue; }

          await prisma.amostraLeadPessoa.create({
            data: {
              leadId: lead.id,
              nome: `${p.first_name} ${p.last_name_obfuscated ?? ''}`.trim(),
              cargo: p.title ?? null,
              apolloPessoaId: p.id,
              apolloHasEmail: p.has_email === true,
              apolloHasPhone: p.has_direct_phone === 'Yes',
            },
          });
          created++;
        }

        results.push({ leadId: lead.id, empresa: lead.empresa, created, skipped });
        await sleep(500); // respeitar rate limit
      } catch (err: any) {
        results.push({ leadId: lead.id, empresa: lead.empresa, created: 0, skipped: 0, error: err?.message });
      }
    }

    const totalCreated = results.reduce((s, r) => s + r.created, 0);
    const totalSkipped = results.reduce((s, r) => s + r.skipped, 0);
    const errors = results.filter(r => r.error);
    return { processados: leads.length, totalCreated, totalSkipped, errors, results };
  }

  async revealPessoa(leadId: string, pessoaId: string) {
    if (!APOLLO_API_KEY) throw new Error('APOLLO_API_KEY não configurada');
    const pessoa = await prisma.amostraLeadPessoa.findFirstOrThrow({ where: { id: pessoaId, leadId } });
    if (!pessoa.apolloPessoaId) throw new Error('Pessoa não tem ID Apollo');

    // reveal_phone_number só é enviado se Apollo indicou que a pessoa tem telefone,
    // evitando queimar créditos de telefone em quem não tem
    const payload: Record<string, any> = { id: pessoa.apolloPessoaId };
    if (pessoa.apolloHasPhone) {
      payload.reveal_phone_number = true;
      if (APOLLO_WEBHOOK_URL) payload.webhook_url = `${APOLLO_WEBHOOK_URL}/webhooks/apollo-phone-leads`;
    }

    const res = await axios.post(
      `${APOLLO_BASE}/people/match`,
      payload,
      { headers: { 'X-Api-Key': APOLLO_API_KEY, 'Content-Type': 'application/json' } },
    );

    const person = res.data.person;
    if (!person) throw new Error('Apollo não retornou dados da pessoa');

    const nomeCompleto = [person.first_name, person.last_name].filter(Boolean).join(' ');
    const telefonePessoal = person.phone_numbers?.[0]?.sanitized_number || null;
    const telefoneEmpresa = person.organization?.primary_phone?.sanitized_number
      || person.organization?.primary_phone?.number
      || null;
    const updated = await prisma.amostraLeadPessoa.update({
      where: { id: pessoaId },
      data: {
        nome: nomeCompleto || pessoa.nome,
        email: person.email || null,
        telefone: telefonePessoal || telefoneEmpresa,
        linkedin: person.linkedin_url || null,
      },
    });

    return updated;
  }

  async countPessoasToReveal() {
    // Conta apenas quem o Apollo confirmou que tem telefone e ainda não foi revelado
    const count = await prisma.amostraLeadPessoa.count({
      where: {
        apolloPessoaId: { not: null },
        telefone: null,
        apolloHasPhone: true,
      },
    });
    return { count };
  }

  async revealAllPessoas() {
    if (!APOLLO_API_KEY) throw new Error('APOLLO_API_KEY não configurada');

    // Só revela quem o Apollo confirmou que tem telefone e ainda não tem telefone salvo.
    // Isso evita queimar créditos de reveal em pessoas sem cobertura de telefone.
    const pessoas = await prisma.amostraLeadPessoa.findMany({
      where: {
        apolloPessoaId: { not: null },
        telefone: null,
        apolloHasPhone: true,
      },
      select: { id: true, leadId: true, apolloPessoaId: true },
    });

    let revealed = 0;
    let errors = 0;

    for (const pessoa of pessoas) {
      try {
        const phonePayload: Record<string, any> = { id: pessoa.apolloPessoaId, reveal_phone_number: true };
        if (APOLLO_WEBHOOK_URL) phonePayload.webhook_url = `${APOLLO_WEBHOOK_URL}/webhooks/apollo-phone-leads`;

        const res = await axios.post(
          `${APOLLO_BASE}/people/match`,
          phonePayload,
          { headers: { 'X-Api-Key': APOLLO_API_KEY, 'Content-Type': 'application/json' } },
        );

        const person = res.data.person;
        if (!person) { errors++; continue; }

        const nomeCompleto = [person.first_name, person.last_name].filter(Boolean).join(' ');
        const telefonePessoal = person.phone_numbers?.[0]?.sanitized_number || null;
        const telefoneEmpresa = person.organization?.primary_phone?.sanitized_number
          || person.organization?.primary_phone?.number
          || null;

        await prisma.amostraLeadPessoa.update({
          where: { id: pessoa.id },
          data: {
            nome: nomeCompleto || undefined,
            email: person.email || null,
            telefone: telefonePessoal || telefoneEmpresa,
            linkedin: person.linkedin_url || null,
          },
        });

        revealed++;
        await sleep(600); // respeitar rate limit
      } catch {
        errors++;
      }
    }

    return { total: pessoas.length, revealed, errors };
  }
}

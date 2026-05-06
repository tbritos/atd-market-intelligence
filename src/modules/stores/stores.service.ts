import prisma from '../../utils/prisma';
import { cnpjEnrichmentQueue, websiteEnrichmentQueue, websiteProviderQueue, performanceCollectorQueue } from '../../config/queue';
import { ListStoresRequest } from './stores.schema';
import { brandWebsiteMatcherService } from '../../services/enrichment/brand-website-matcher.service';

function toTitleCase(str: string): string {
  if (!str) return str;
  const SKIP = ['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'a', 'o', 'com', 'ltda', 'me', 'eireli', 'sa', 's/a'];
  return str.toLowerCase().replace(/\b\w+/g, (w, i) => (i === 0 || !SKIP.includes(w)) ? w.charAt(0).toUpperCase() + w.slice(1) : w);
}

function formatPhone(phone: string): string {
  if (!phone) return '';
  const d = phone.replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return phone;
}

function hasValue(value: unknown): boolean {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function getLeadTier(score: number): 'A' | 'B' | 'C' | 'D' {
  if (score >= 85) return 'A';
  if (score >= 65) return 'B';
  if (score >= 45) return 'C';
  return 'D';
}

function getLeadPriority(score: number): 'Alta' | 'Media' | 'Baixa' {
  if (score >= 75) return 'Alta';
  if (score >= 50) return 'Media';
  return 'Baixa';
}

function normalizeCompanyKey(value: string): string {
  return (value || '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 ]/g, '');
}

function scoreMergedLead(lead: any): number {
  let score = 0;
  if (hasValue(lead.nomeContato)) score += 18;
  if (hasValue(lead.emailContato)) score += 16;
  if (hasValue(lead.telefoneContato)) score += 12;
  if (hasValue(lead.cargo)) score += 6;
  if (hasValue(lead.emailEmpresa)) score += 8;
  if (hasValue(lead.telefoneEmpresa)) score += 6;
  if (hasValue(lead.whatsapp)) score += 6;
  if (hasValue(lead.site)) score += 8;
  if (hasValue(lead.provedor)) score += 5;
  if (lead.pagespeed !== '') score += 4;
  if (lead.seo !== '') score += 4;
  if (hasValue(lead.tempoResposta)) score += 3;
  if (hasValue(lead.socio1)) score += 5;
  if (hasValue(lead.cnpj)) score += 4;
  if (hasValue(lead.capitalSocial)) score += 2;
  if (['google_places', 'brand_site'].includes(String(lead.fonte || ''))) score += 3;
  if (lead.anoAbertura && Number(lead.anoAbertura) >= 2020) score += 2;
  if (lead.rating !== '') score += 3;
  if (Number(lead.rating || 0) >= 4.2) score += 2;
  if (Number(lead.avaliacoes || 0) >= 30) score += 3;
  return Math.min(score, 100);
}

const STORE_INCLUDE_BASE = {
  brand: { select: { id: true, name: true, slug: true } },
  group: { select: { id: true, name: true, slug: true } },
  state: { select: { id: true, name: true, code: true, region: true } },
  city: { select: { id: true, name: true, isCapital: true } },
  website: { 
    select: { 
      id: true, url: true, isActive: true, 
      avgPerformanceScore: true, seoScore: true,
      provider: { select: { name: true } } 
    } 
  },
};

export class StoresService {
  private buildWhere(query: ListStoresRequest) {
    const { brandId, stateId, cityId, groupId, isActive, search, situacaoCadastral, cnaeCode, hasCnpj, hasWebsite, onlyQualified, discoverySource, tipo, uf } = query;
    return {
      ...(brandId && { brandId }),
      ...(stateId && { stateId }),
      ...(cityId && { cityId }),
      ...(groupId && { groupId }),
      ...(isActive !== undefined && { isActive }),
      ...(situacaoCadastral && { situacaoCadastral: situacaoCadastral.toUpperCase() }),
      ...(cnaeCode && { cnaeCode }),
      ...(hasCnpj !== undefined && { cnpj: hasCnpj ? { not: null } : null }),
      ...(hasWebsite !== undefined && { websiteId: hasWebsite ? { not: null } : null }),
      ...(discoverySource && { discoverySource }),
      ...(tipo && { tipo }),
      ...(uf && { state: { code: uf.toUpperCase() } }),
      ...(onlyQualified && {
        websiteId: { not: null },
        phone: { not: null },
        cityId: { not: null },
      }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { razaoSocial: { contains: search, mode: 'insensitive' as const } },
          { cnpj: { contains: search, mode: 'insensitive' as const } },
          { nomeFantasia: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
    };
  }

  async listStores(query: ListStoresRequest) {
    const { page = 1, limit = 50, all, withPartners } = query;
    const where = this.buildWhere(query);
    const include = {
      ...STORE_INCLUDE_BASE,
      ...(withPartners && { partners: { orderBy: { qualificacao: 'asc' as const } } }),
    };

    if (all) {
      const stores = await prisma.store.findMany({
        where,
        include,
        orderBy: [
          { websiteId: 'desc' },
          { cityId: 'desc' },
          { phone: 'desc' },
          { rating: 'desc' },
          { reviews: 'desc' },
          { name: 'asc' },
        ],
      });
      return {
        data: stores,
        meta: { total: stores.length, page: 1, limit: stores.length, totalPages: 1, hasNext: false, hasPrev: false },
      };
    }

    const validatedLimit = Math.min(limit, 1000);
    const offset = (page - 1) * validatedLimit;

    const [stores, total] = await Promise.all([
      prisma.store.findMany({
        where,
        include,
        orderBy: [
          { websiteId: 'desc' },
          { cityId: 'desc' },
          { phone: 'desc' },
          { rating: 'desc' },
          { reviews: 'desc' },
          { name: 'asc' },
        ],
        take: validatedLimit,
        skip: offset,
      }),
      prisma.store.count({ where }),
    ]);

    const totalPages = Math.ceil(total / validatedLimit);
    return {
      data: stores,
      meta: { total, page, limit: validatedLimit, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },
    };
  }

  async getStoreStats() {
    const [
      total,
      comCnpj,
      ativas,
      porSituacao,
      porFonte,
    ] = await Promise.all([
      prisma.store.count(),
      prisma.store.count({ where: { cnpj: { not: null } } }),
      prisma.store.count({ where: { situacaoCadastral: 'ATIVA' } }),
      prisma.store.groupBy({ by: ['situacaoCadastral'], _count: true, orderBy: { _count: { situacaoCadastral: 'desc' } } }),
      prisma.store.groupBy({ by: ['discoverySource'], _count: true, orderBy: { _count: { discoverySource: 'desc' } } }),
    ]);

    return {
      total,
      comCnpj,
      semCnpj: total - comCnpj,
      coberturaCnpj: `${((comCnpj / total) * 100).toFixed(1)}%`,
      ativas,
      porSituacao: porSituacao.map(s => ({ situacao: s.situacaoCadastral ?? 'Sem CNPJ', total: s._count })),
      porFonte: porFonte.map(f => ({ fonte: f.discoverySource ?? 'google_maps', total: f._count })),
    };
  }

  async listCnaes() {
    // Agrupa só pelo código e soma todos os registros
    const rows = await prisma.store.groupBy({
      by: ['cnaeCode'],
      where: { cnaeCode: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { cnaeCode: 'desc' } },
    });

    // Busca a descrição mais comum para cada código
    const descricoes = await prisma.store.groupBy({
      by: ['cnaeCode', 'cnaeDescricao'],
      where: { cnaeCode: { not: null }, cnaeDescricao: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { cnaeDescricao: 'desc' } },
    });

    const descMap = new Map<string, string>();
    for (const d of descricoes) {
      if (!descMap.has(d.cnaeCode!) && d.cnaeDescricao) {
        descMap.set(d.cnaeCode!, d.cnaeDescricao);
      }
    }

    return rows.map((r) => ({
      code:      r.cnaeCode!,
      descricao: descMap.get(r.cnaeCode!) ?? '',
      total:     r._count._all,
    }));
  }

  async getStore(id: string) {
    return prisma.store.findUnique({
      where: { id },
      include: {
        brand: { select: { id: true, name: true, slug: true } },
        group: { select: { id: true, name: true, slug: true } },
        state: { select: { id: true, name: true, code: true, region: true } },
        city: { select: { id: true, name: true, isCapital: true } },
        website: {
          select: {
            id: true, url: true, isActive: true,
            avgPerformanceScore: true, seoScore: true,
            avgResponseTime: true, downtimeSeconds: true,
          },
        },
        partners: {
          orderBy: { qualificacao: 'asc' },
        },
      },
    });
  }

  async enqueueBulkEnrichment(cnaeCode?: string) {
    // Apenas: ATIVA + Matriz + tem CNPJ + ainda não enriquecido
    const stores = await prisma.store.findMany({
      where: {
        situacaoCadastral: 'ATIVA',
        tipo: 'Matriz',
        cnpj: { not: null },
        cnpjEnrichedAt: null,
        ...(cnaeCode && { cnaeCode }),
      },
      select: { id: true, name: true, cnpj: true, website: { select: { url: true } } },
    });

    let queued = 0;
    for (const store of stores) {
      await cnpjEnrichmentQueue.add('enrichCnpj', {
        storeId: store.id,
        storeName: store.name,
        cnpj: store.cnpj,
        websiteUrl: store.website?.url ?? null,
      });
      queued++;
    }

    return { queued, total: stores.length };
  }

  async enqueueEnrichment(storeId: string) {
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true, name: true, website: { select: { url: true } } },
    });
    if (!store) throw new Error('Store not found');

    await cnpjEnrichmentQueue.add('enrichCnpj', {
      storeId: store.id,
      storeName: store.name,
      websiteUrl: store.website?.url ?? null,
    });

    return { queued: true };
  }

  async matchWebsitesFromBrandAdapters(cnaeCode?: string) {
    return brandWebsiteMatcherService.matchAll(cnaeCode);
  }

  async matchContacts(contacts: { email?: string; empresa?: string; telefone?: string; celular?: string; site?: string }[]) {
    console.log(`matchContacts: ${contacts.length} contatos recebidos`);
    const STORE_SELECT = {
      id: true, cnpj: true, razaoSocial: true, nomeFantasia: true, name: true,
      capitalSocial: true, situacaoCadastral: true, telefoneReceita: true,
      emailReceita: true, email: true, dataAbertura: true, porte: true,
      state: { select: { code: true } },
      city: { select: { name: true } },
      website: { select: { url: true, avgPerformanceScore: true, seoScore: true, avgResponseTime: true, avgMonthlyVisits: true, provider: { select: { name: true } } } },
      partners: { select: { nome: true }, take: 3 },
    };

    // Coleta todos os emails e domínios únicos para queries em lote
    const emails = [...new Set(contacts.map(c => c.email).filter(Boolean))] as string[];
    const domains = [...new Set(contacts.map(c => c.email?.split('@')[1]).filter(Boolean))] as string[];
    const empresas = [...new Set(contacts.map(c => c.empresa?.trim()).filter(e => e && e.length > 3))] as string[];

    // Busca em lote por email exato
    const byEmail = await prisma.store.findMany({
      where: { OR: [{ emailReceita: { in: emails } }, { email: { in: emails } }] },
      select: STORE_SELECT,
    });
    const emailMap = new Map<string, any>();
    for (const s of byEmail) {
      if (s.emailReceita) emailMap.set(s.emailReceita.toLowerCase(), s);
      if (s.email) emailMap.set(s.email.toLowerCase(), s);
    }

    // Busca em lote por domínio de email no website
    const byDomain = await prisma.store.findMany({
      where: { website: { OR: domains.map(d => ({ url: { contains: d } })) } },
      select: STORE_SELECT,
    });
    const domainMap = new Map<string, any>();
    for (const s of byDomain) {
      if (s.website?.url) {
        for (const d of domains) {
          if (s.website.url.includes(d) && !domainMap.has(d)) domainMap.set(d, s);
        }
      }
    }

    // Busca em lote por nome de empresa — em chunks de 50 para não sobrecarregar o banco
    const empresaMap = new Map<string, any>();
    const CHUNK = 50;
    for (let i = 0; i < empresas.length; i += CHUNK) {
      const chunk = empresas.slice(i, i + CHUNK);
      const rows = await prisma.store.findMany({
        where: { OR: chunk.flatMap(e => [
          { nomeFantasia: { contains: e, mode: 'insensitive' as const } },
          { razaoSocial: { contains: e, mode: 'insensitive' as const } },
          { name: { contains: e, mode: 'insensitive' as const } },
        ])},
        select: STORE_SELECT,
      });
      for (const s of rows) {
        for (const e of chunk) {
          const el = e.toLowerCase();
          if (!empresaMap.has(el) && (
            s.nomeFantasia?.toLowerCase().includes(el) ||
            s.razaoSocial?.toLowerCase().includes(el) ||
            s.name?.toLowerCase().includes(el)
          )) empresaMap.set(el, s);
        }
      }
    }

    const results = contacts.map(contact => {
      let match: any = null;
      let matchMethod: string | null = null;

      if (contact.email) {
        match = emailMap.get(contact.email.toLowerCase()) ?? null;
        if (match) matchMethod = 'email_exato';
      }
      if (!match && contact.email) {
        const domain = contact.email.split('@')[1];
        if (domain) { match = domainMap.get(domain) ?? null; if (match) matchMethod = 'dominio_email'; }
      }
      if (!match && contact.empresa?.trim().length! > 3) {
        match = empresaMap.get(contact.empresa!.trim().toLowerCase()) ?? null;
        if (match) matchMethod = 'empresa';
      }

      return {
        ...contact,
        matched: !!match,
        matchMethod,
        cnpj: match?.cnpj ?? null,
        razaoSocial: match?.razaoSocial ?? null,
        nomeFantasia: match?.nomeFantasia ?? null,
        capitalSocial: match?.capitalSocial ?? null,
        situacaoCadastral: match?.situacaoCadastral ?? null,
        cidade: match?.city?.name ?? null,
        uf: match?.state?.code ?? null,
        telefoneReceita: match?.telefoneReceita ?? null,
        emailReceita: match?.emailReceita ?? null,
        websiteEncontrado: match?.website?.url ?? null,
        provedor: match?.website?.provider?.name ?? null,
        pagespeed: match?.website?.avgPerformanceScore != null ? Math.round(match.website.avgPerformanceScore) : null,
        seo: match?.website?.seoScore != null ? Math.round(match.website.seoScore) : null,
        tempoResposta: match?.website?.avgResponseTime ?? null,
        visitasMensais: match?.website?.avgMonthlyVisits ?? null,
        socios: match?.partners?.map((p: any) => p.nome).join('; ') ?? null,
        dataAbertura: match?.dataAbertura ? new Date(match.dataAbertura).toLocaleDateString('pt-BR') : null,
        porte: match?.porte ?? null,
      };
    });

    const matched = results.filter(r => r.matched).length;
    return { total: contacts.length, matched, unmatched: contacts.length - matched, data: results };
  }

  async getSdrSample(limit = 1000) {
    const BASE_WHERE = {
      situacaoCadastral: 'ATIVA',
      tipo: 'Matriz',
      OR: [
        { cnaeCode: '4511101' },
        { discoverySource: 'google_places' },
        { discoverySource: 'brand_site' },
      ],
    };

    const SELECT = {
      id: true, name: true, nomeFantasia: true, razaoSocial: true,
      phone: true, email: true, emailReceita: true, telefoneReceita: true,
      situacaoCadastral: true, discoverySource: true,
      rating: true, reviews: true, cnaeDescricao: true, dataAbertura: true,
      state: { select: { code: true } },
      city: { select: { name: true } },
      website: { select: { url: true, avgPerformanceScore: true, seoScore: true, provider: { select: { name: true } } } },
      partners: { select: { nome: true, qualificacao: true }, take: 1 },
    };

    // Tiers
    const tier1 = await prisma.store.count({ where: { ...BASE_WHERE, websiteId: { not: null }, website: { avgPerformanceScore: { not: null } }, OR: [{ emailReceita: { not: null } }, { email: { not: null } }], partners: { some: {} } } });
    const tier2 = await prisma.store.count({ where: { ...BASE_WHERE, websiteId: { not: null }, website: { avgPerformanceScore: { not: null } }, OR: [{ emailReceita: { not: null } }, { email: { not: null } }, { telefoneReceita: { not: null } }, { phone: { not: null } }] } });
    const tier3 = await prisma.store.count({ where: { ...BASE_WHERE, websiteId: { not: null }, OR: [{ emailReceita: { not: null } }, { email: { not: null } }, { telefoneReceita: { not: null } }, { phone: { not: null } }] } });
    const tier4 = await prisma.store.count({ where: { ...BASE_WHERE, OR: [{ emailReceita: { not: null } }, { email: { not: null } }, { telefoneReceita: { not: null } }, { phone: { not: null } }] } });

    // Stats para enriquecimento pendente
    const semPagespeed = await prisma.store.count({ where: { ...BASE_WHERE, websiteId: { not: null }, website: { avgPerformanceScore: null } } });
    const semProvedor = await prisma.store.count({ where: { ...BASE_WHERE, websiteId: { not: null }, website: { providerId: null } } });

    const leads = await prisma.store.findMany({
      where: { ...BASE_WHERE, websiteId: { not: null }, OR: [{ emailReceita: { not: null } }, { email: { not: null } }, { telefoneReceita: { not: null } }, { phone: { not: null } }] },
      select: SELECT,
      orderBy: [{ website: { providerId: 'desc' } }, { website: { avgPerformanceScore: 'asc' } }],
      take: limit,
    });

    return {
      tiers: { tier1, tier2, tier3, tier4 },
      enrichmentPending: { semPagespeed, semProvedor },
      total: leads.length,
      leads: leads.map(s => ({
        empresa: toTitleCase(s.nomeFantasia || s.name),
        email: s.emailReceita || s.email || '',
        telefone: formatPhone(s.telefoneReceita || s.phone || ''),
        cidade: s.city?.name ? toTitleCase(s.city.name) : '',
        uf: s.state?.code || '',
        situacao: s.situacaoCadastral || '',
        socio: toTitleCase(s.partners?.[0]?.nome || ''),
        cargo: s.partners?.[0]?.qualificacao || '',
        site: s.website?.url || '',
        provedor: s.website?.provider?.name || '',
        pagespeed: s.website?.avgPerformanceScore != null ? Math.round(s.website.avgPerformanceScore) : '',
        seo: s.website?.seoScore != null ? Math.round(s.website.seoScore) : '',
        rating: s.rating ?? '',
        avaliacoes: s.reviews ?? '',
        cnae: s.cnaeDescricao || '',
        anoAbertura: s.dataAbertura ? new Date(s.dataAbertura).getFullYear() : '',
        fonte: s.discoverySource || '',
      })),
    };
  }

  async updateClientesCs(rows: { empresa: string; cs: string }[]) {
    let atualizados = 0;
    for (const { empresa, cs } of rows) {
      if (!empresa || !cs) continue;
      const result = await prisma.store.updateMany({
        where: {
          clienteAutoforce: true,
          OR: [
            { nomeFantasia: { contains: empresa.trim(), mode: 'insensitive' } },
            { name: { contains: empresa.trim(), mode: 'insensitive' } },
          ],
        },
        data: { csResponsavel: cs.trim() },
      });
      atualizados += result.count;
    }
    return { atualizados };
  }

  async resetClientes() {
    const result = await prisma.store.updateMany({
      where: { clienteAutoforce: true },
      data: { clienteAutoforce: false },
    });
    return { resetados: result.count };
  }

  async listClientes(search?: string) {
    const where: any = { clienteAutoforce: true };
    if (search) {
      where.OR = [
        { nomeFantasia: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
        { cnpj: { contains: search } },
        { csResponsavel: { contains: search, mode: 'insensitive' } },
      ];
    }

    const allClientes = await prisma.store.findMany({
      where,
      select: {
        id: true, name: true, nomeFantasia: true, cnpj: true,
        csResponsavel: true,
        email: true, emailReceita: true, phone: true, telefoneReceita: true,
        contactName: true, contactEmail: true, contactPhone: true, contactRole: true,
        situacaoCadastral: true, dataAbertura: true, porte: true,
        city: { select: { name: true } },
        state: { select: { code: true } },
        website: { select: { url: true, avgPerformanceScore: true, provider: { select: { name: true } } } },
      },
      orderBy: [{ csResponsavel: 'asc' }, { nomeFantasia: 'asc' }],
    });

    // Deduplica por nomeFantasia/name — normaliza acentos e espaços para comparação
    const normalize = (s: string) =>
      s.toLowerCase().trim()
       .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
       .replace(/\s+/g, ' ')                              // colapsa espaços
       .replace(/[^a-z0-9 ]/g, '');                      // remove especiais

    const seen = new Map<string, typeof allClientes[0]>();
    for (const c of allClientes) {
      const key = normalize(c.nomeFantasia || c.name);
      const existing = seen.get(key);
      if (!existing) { seen.set(key, c); continue; }
      // Prefere o que tiver csResponsavel, contactEmail ou website
      const score = (x: typeof c) =>
        ((x as any).csResponsavel ? 2 : 0) + ((x as any).contactEmail ? 1 : 0) + (x.website ? 1 : 0);
      if (score(c) > score(existing)) seen.set(key, c);
    }
    const clientes = Array.from(seen.values());

    // Agrupa por CS
    const porCS: Record<string, number> = {};
    for (const c of clientes) {
      const cs = c.csResponsavel || 'Sem CS';
      porCS[cs] = (porCS[cs] || 0) + 1;
    }

    return {
      total: clientes.length,
      porCS,
      clientes: clientes.map(s => ({
        id: s.id,
        empresa: toTitleCase(s.nomeFantasia || s.name),
        cnpj: s.cnpj || '',
        csResponsavel: s.csResponsavel || '',
        contato: toTitleCase(s.contactName || ''),
        emailContato: s.contactEmail || '',
        telefoneContato: formatPhone(s.contactPhone || ''),
        cargoContato: s.contactRole || '',
        emailEmpresa: s.emailReceita || s.email || '',
        telefoneEmpresa: formatPhone(s.telefoneReceita || s.phone || ''),
        cidade: s.city?.name ? toTitleCase(s.city.name) : '',
        uf: s.state?.code || '',
        site: s.website?.url || '',
        provedor: s.website?.provider?.name || '',
        pagespeed: s.website?.avgPerformanceScore != null ? Math.round(s.website.avgPerformanceScore) : '',
        situacao: s.situacaoCadastral || '',
        anoAbertura: s.dataAbertura ? new Date(s.dataAbertura).getFullYear() : '',
      })),
    };
  }

  async getSdrExport(limit = 5000) {
    const WHERE = {
      situacaoCadastral: 'ATIVA',
      tipo: 'Matriz',
      clienteAutoforce: false,
      OR: [
        { contactEmail: { not: null } },
        { contactName: { not: null } },
        { contactPhone: { not: null } },
        { emailReceita: { not: null } },
        { email: { not: null } },
        { telefoneReceita: { not: null } },
        { phone: { not: null } },
        { whatsapp: { not: null } },
        { websiteId: { not: null } },
      ],
    };

    const SELECT = {
      id: true, name: true, nomeFantasia: true, razaoSocial: true, cnpj: true,
      tipo: true, discoverySource: true,
      contactName: true, contactRole: true, contactEmail: true, contactPhone: true,
      phone: true, email: true, emailReceita: true, telefoneReceita: true,
      whatsapp: true, instagram: true, facebook: true, linkedin: true,
      situacaoCadastral: true, porte: true, capitalSocial: true, dataAbertura: true,
      enderecoLogradouro: true, enderecoNumero: true, enderecoBairro: true, enderecoCep: true,
      rating: true, reviews: true, cnaeDescricao: true,
      state: { select: { code: true } },
      city: { select: { name: true } },
      website: {
        select: {
          url: true,
          avgPerformanceScore: true,
          seoScore: true,
          avgResponseTime: true,
          provider: { select: { name: true } },
        },
      },
      partners: { select: { nome: true, qualificacao: true }, take: 2 },
    };

    const fetchLimit = Math.min(Math.max(limit * 4, 20000), 50000);

    const [leads, total] = await Promise.all([
      prisma.store.findMany({
        where: WHERE,
        select: SELECT,
        orderBy: [
          { websiteId: 'asc' },
          { contactEmail: 'asc' },
          { contactPhone: 'asc' },
          { updatedAt: 'desc' },
        ],
        take: fetchLimit,
      }),
      prisma.store.count({ where: WHERE }),
    ]);

    const mappedLeads = leads.map(s => {
      const temContatoNomeado = hasValue(s.contactName);
      const temEmailDireto = hasValue(s.contactEmail);
      const temTelefoneDireto = hasValue(s.contactPhone);
      const temCargo = hasValue(s.contactRole);
      const temEmailEmpresa = hasValue(s.emailReceita) || hasValue(s.email);
      const temTelefoneEmpresa = hasValue(s.telefoneReceita) || hasValue(s.phone);
      const temWhatsapp = hasValue(s.whatsapp);
      const temSite = hasValue(s.website?.url);
      const temProvedor = hasValue(s.website?.provider?.name);
      const temPagespeed = s.website?.avgPerformanceScore != null;
      const temSeo = s.website?.seoScore != null;
      const temTempoResposta = s.website?.avgResponseTime != null;
      const temSocio = (s.partners?.length ?? 0) > 0;
      const temCnpj = hasValue(s.cnpj);
      const temRating = s.rating != null;
      const ratingBom = (s.rating ?? 0) >= 4.2;
      const reviewsRelevantes = (s.reviews ?? 0) >= 30;
      const temCapital = s.capitalSocial != null && s.capitalSocial > 0;
      const leadNovo = s.dataAbertura ? new Date(s.dataAbertura).getFullYear() >= 2020 : false;
      const origemQuente = ['google_places', 'brand_site'].includes(String(s.discoverySource || ''));

      let score = 0;
      if (temContatoNomeado) score += 18;
      if (temEmailDireto) score += 16;
      if (temTelefoneDireto) score += 12;
      if (temCargo) score += 6;
      if (temEmailEmpresa) score += 8;
      if (temTelefoneEmpresa) score += 6;
      if (temWhatsapp) score += 6;
      if (temSite) score += 8;
      if (temProvedor) score += 5;
      if (temPagespeed) score += 4;
      if (temSeo) score += 4;
      if (temTempoResposta) score += 3;
      if (temSocio) score += 5;
      if (temCnpj) score += 4;
      if (temCapital) score += 2;
      if (origemQuente) score += 3;
      if (leadNovo) score += 2;
      if (temRating) score += 3;
      if (ratingBom) score += 2;
      if (reviewsRelevantes) score += 3;
      score = Math.min(score, 100);

      const tier = getLeadTier(score);
      const prioridade = getLeadPriority(score);
      const sinais: string[] = [];
      if (temContatoNomeado) sinais.push('Contato nomeado');
      if (temEmailDireto) sinais.push('Email direto');
      if (temTelefoneDireto) sinais.push('Telefone direto');
      if (temCargo) sinais.push('Cargo mapeado');
      if (temEmailEmpresa) sinais.push('Email empresa');
      if (temTelefoneEmpresa) sinais.push('Telefone empresa');
      if (temWhatsapp) sinais.push('WhatsApp');
      if (temSite) sinais.push('Site');
      if (temProvedor) sinais.push('Provedor');
      if (temPagespeed) sinais.push('PageSpeed');
      if (temSeo) sinais.push('SEO');
      if (temSocio) sinais.push('Socio');
      if (temRating && ratingBom) sinais.push('Rating forte');
      if (reviewsRelevantes) sinais.push('Reviews relevantes');
      if (origemQuente) sinais.push('Origem quente');

      return {
        tier,
        score,
        prioridade,
        sinais,
        fonte: s.discoverySource || '',
        nomeContato: toTitleCase(s.contactName || ''),
        emailContato: s.contactEmail || '',
        telefoneContato: formatPhone(s.contactPhone || ''),
        cargo: s.contactRole || '',
        empresa: toTitleCase(s.nomeFantasia || s.name),
        razaoSocial: s.razaoSocial || '',
        cnpj: s.cnpj || '',
        situacao: s.situacaoCadastral || '',
        tipo: s.tipo || '',
        porte: s.porte || '',
        capitalSocial: s.capitalSocial != null ? s.capitalSocial.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '',
        anoAbertura: s.dataAbertura ? new Date(s.dataAbertura).getFullYear() : '',
        cnae: s.cnaeDescricao || '',
        endereco: [s.enderecoLogradouro, s.enderecoNumero].filter(Boolean).join(', '),
        bairro: s.enderecoBairro || '',
        cep: s.enderecoCep || '',
        cidade: s.city?.name ? toTitleCase(s.city.name) : '',
        uf: s.state?.code || '',
        emailEmpresa: s.emailReceita || s.email || '',
        telefoneEmpresa: formatPhone(s.telefoneReceita || s.phone || ''),
        whatsapp: formatPhone(s.whatsapp || ''),
        instagram: s.instagram || '',
        facebook: s.facebook || '',
        linkedin: s.linkedin || '',
        site: s.website?.url || '',
        provedor: s.website?.provider?.name || '',
        pagespeed: s.website?.avgPerformanceScore != null ? Math.round(s.website.avgPerformanceScore) : '',
        seo: s.website?.seoScore != null ? Math.round(s.website.seoScore) : '',
        tempoResposta: s.website?.avgResponseTime != null ? `${s.website.avgResponseTime}ms` : '',
        rating: s.rating ?? '',
        avaliacoes: s.reviews ?? '',
        socio1: toTitleCase(s.partners?.[0]?.nome || ''),
        cargoSocio1: s.partners?.[0]?.qualificacao || '',
        socio2: toTitleCase(s.partners?.[1]?.nome || ''),
        cargoSocio2: s.partners?.[1]?.qualificacao || '',
      };
    });

    const filteredLeads = mappedLeads.filter(lead => {
      const site = String(lead.site || '').toLowerCase();
      const provedor = String(lead.provedor || '').toLowerCase();
      return provedor !== 'autoforce' && !site.includes('autoforce.com');
    });

    const mergedByCompany = new Map<string, typeof filteredLeads[number]>();
    for (const lead of filteredLeads) {
      const key = hasValue(lead.cnpj)
        ? `cnpj:${String(lead.cnpj).replace(/\D/g, '')}`
        : `empresa:${normalizeCompanyKey(lead.empresa || lead.razaoSocial)}`;

      const existing = mergedByCompany.get(key);
      if (!existing) {
        mergedByCompany.set(key, { ...lead });
        continue;
      }

      const merged = { ...existing };
      const fieldPairs: Array<keyof typeof merged> = [
        'nomeContato', 'emailContato', 'telefoneContato', 'cargo',
        'empresa', 'razaoSocial', 'cnpj', 'situacao', 'tipo', 'porte',
        'capitalSocial', 'anoAbertura', 'cnae', 'endereco', 'bairro', 'cep',
        'cidade', 'uf', 'emailEmpresa', 'telefoneEmpresa', 'whatsapp',
        'instagram', 'facebook', 'linkedin', 'site', 'provedor',
        'pagespeed', 'seo', 'tempoResposta', 'rating', 'avaliacoes',
        'socio1', 'cargoSocio1', 'socio2', 'cargoSocio2', 'fonte',
      ];

      for (const field of fieldPairs) {
        const currentValue = merged[field];
        const candidateValue = lead[field];
        const currentFilled = field === 'pagespeed' || field === 'seo' || field === 'rating' || field === 'avaliacoes'
          ? currentValue !== ''
          : hasValue(currentValue);
        const candidateFilled = field === 'pagespeed' || field === 'seo' || field === 'rating' || field === 'avaliacoes'
          ? candidateValue !== ''
          : hasValue(candidateValue);

        if (!currentFilled && candidateFilled) {
          (merged as any)[field] = candidateValue;
        }
      }

      merged.sinais = Array.from(new Set([...(existing.sinais || []), ...(lead.sinais || [])]));
      merged.score = scoreMergedLead(merged);
      merged.tier = getLeadTier(merged.score);
      merged.prioridade = getLeadPriority(merged.score);

      mergedByCompany.set(key, merged);
    }

    const dedupedLeads = Array.from(mergedByCompany.values());

    dedupedLeads.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return String(a.empresa).localeCompare(String(b.empresa), 'pt-BR');
    });

    const limitedLeads = dedupedLeads.slice(0, limit);

    const summary = {
      total: limitedLeads.length,
      tierA: limitedLeads.filter(l => l.tier === 'A').length,
      tierB: limitedLeads.filter(l => l.tier === 'B').length,
      tierC: limitedLeads.filter(l => l.tier === 'C').length,
      tierD: limitedLeads.filter(l => l.tier === 'D').length,
      comContatoNomeado: limitedLeads.filter(l => hasValue(l.nomeContato)).length,
      comEmailDireto: limitedLeads.filter(l => hasValue(l.emailContato)).length,
      comTelefoneDireto: limitedLeads.filter(l => hasValue(l.telefoneContato)).length,
      comWhatsapp: limitedLeads.filter(l => hasValue(l.whatsapp)).length,
      comSite: limitedLeads.filter(l => hasValue(l.site)).length,
      comProvedor: limitedLeads.filter(l => hasValue(l.provedor)).length,
      comPagespeed: limitedLeads.filter(l => l.pagespeed !== '').length,
      comSocio: limitedLeads.filter(l => hasValue(l.socio1)).length,
      comSiteContatoNomeado: limitedLeads.filter(l => hasValue(l.site) && (hasValue(l.nomeContato) || hasValue(l.emailContato) || hasValue(l.telefoneContato))).length,
      comSiteCanalEmpresa: limitedLeads.filter(l => hasValue(l.site) && (hasValue(l.emailEmpresa) || hasValue(l.telefoneEmpresa) || hasValue(l.whatsapp))).length,
      comSiteSemContatoNomeado: limitedLeads.filter(l => hasValue(l.site) && !hasValue(l.nomeContato) && !hasValue(l.emailContato) && !hasValue(l.telefoneContato)).length,
      precisaEnriquecerContato: limitedLeads.filter(l => hasValue(l.site) && !hasValue(l.nomeContato) && !hasValue(l.emailContato) && !hasValue(l.telefoneContato) && !hasValue(l.whatsapp)).length,
    };

    return {
      total: limitedLeads.length,
      summary,
      leads: limitedLeads,
    };
  }

  async enqueueBulkPagespeed(cnaeCode?: string) {
    const websites = await prisma.website.findMany({
      where: {
        avgPerformanceScore: null,
        stores: { some: { situacaoCadastral: 'ATIVA', tipo: 'Matriz', ...(cnaeCode && { cnaeCode }) } },
      },
      select: { id: true, url: true, brandId: true },
      take: 5000,
    });
    for (const w of websites) {
      await performanceCollectorQueue.add('collectPerformance', { websiteId: w.id, url: w.url });
    }
    return { queued: websites.length };
  }

  async enqueueBulkProviderDetection(cnaeCode?: string) {
    const websites = await prisma.website.findMany({
      where: {
        providerId: null,
        stores: { some: { situacaoCadastral: 'ATIVA', tipo: 'Matriz', ...(cnaeCode && { cnaeCode }) } },
      },
      select: { id: true, url: true, brandId: true },
      take: 5000,
    });
    for (const w of websites) {
      await websiteProviderQueue.add('detectProvider', { websiteId: w.id, url: w.url, brandId: w.brandId });
    }
    return { queued: websites.length };
  }

  async createFromContacts(contacts: { email?: string; nome?: string; empresa?: string; telefone?: string; celular?: string; site?: string; cargo?: string; plataformaDoSite?: string }[], marcarComoCliente = false) {
    // Busca ou cria grupo default e brand multimarca
    let group = await prisma.group.findFirst({ where: { slug: 'default' } });
    if (!group) group = await prisma.group.create({ data: { name: 'Default Group', slug: 'default', description: 'Auto-created', isActive: true } });

    let brand = await prisma.brand.findFirst({ where: { slug: 'multimarca' } });
    if (!brand) brand = await prisma.brand.findFirst();
    if (!brand) throw new Error('Nenhuma marca encontrada no banco');

    // Usa o primeiro estado como fallback (SP)
    let state = await prisma.state.findFirst({ where: { code: 'SP' } });
    if (!state) state = await prisma.state.findFirst();
    if (!state) throw new Error('Nenhum estado encontrado no banco');

    let created = 0;
    let skipped = 0;
    const enrichQueue: string[] = [];

    for (const c of contacts) {
      if (!c.empresa?.trim()) { skipped++; continue; }

      // Verifica se já existe pelo email
      if (c.email) {
        const exists = await prisma.store.findFirst({ where: { OR: [{ emailReceita: c.email }, { email: c.email }, { contactEmail: c.email }] }, select: { id: true } });
        if (exists) { skipped++; continue; }
      }

      const store = await prisma.store.create({
        data: {
          name: c.empresa.trim(),
          brandId: brand!.id,
          groupId: group!.id,
          stateId: state!.id,
          email: c.email || null,
          phone: c.telefone || null,
          contactName: c.nome || null,
          contactPhone: c.celular || c.telefone || null,
          contactEmail: c.email || null,
          contactRole: c.cargo || null,
          discoverySource: 'sheets',
          isActive: true,
          clienteAutoforce: marcarComoCliente,
        },
      });
      created++;

      // Se tem site, cria website, linka provedor e enfileira enriquecimento
      if (c.site?.trim()) {
        let url = c.site.trim();
        if (!url.startsWith('http')) url = `https://${url}`;
        try {
          let website = await prisma.website.findFirst({ where: { url }, select: { id: true } });
          if (!website) {
            let providerId: string | null = null;
            if (c.plataformaDoSite?.trim()) {
              const providerName = c.plataformaDoSite.trim();
              const slug = providerName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
              let provider = await prisma.websiteProvider.findFirst({ where: { OR: [{ name: providerName }, { slug }] } });
              if (!provider) {
                provider = await prisma.websiteProvider.create({ data: { name: providerName, slug } });
              }
              providerId = provider.id;
            }
            website = await prisma.website.create({ data: { url, brandId: brand!.id, ...(providerId && { providerId }) } });
          }
          await prisma.store.update({ where: { id: store.id }, data: { websiteId: website.id } });
          await cnpjEnrichmentQueue.add('enrichCnpj', { storeId: store.id, storeName: store.name, websiteUrl: url });
          enrichQueue.push(store.id);
        } catch {}
      }
    }

    return { created, skipped, enrichQueued: enrichQueue.length };
  }

  async enqueueBulkWebsiteEnrichment(cnaeCode?: string) {
    const stores = await prisma.store.findMany({
      where: {
        websiteId: null,
        situacaoCadastral: 'ATIVA',
        tipo: 'Matriz',
        ...(cnaeCode && { cnaeCode }),
      },
      select: {
        id: true,
        name: true,
        nomeFantasia: true,
        brandId: true,
        city: { select: { name: true } },
      },
    });

    let queued = 0;
    for (const store of stores) {
      await websiteEnrichmentQueue.add('findWebsite', {
        storeId: store.id,
        storeName: store.nomeFantasia || store.name,
        brandId: store.brandId,
        cityName: store.city?.name ?? null,
      });
      queued++;
    }

    return { queued, total: stores.length };
  }
}

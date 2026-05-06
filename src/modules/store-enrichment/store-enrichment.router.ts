import { Router, Request, Response } from 'express';
import { storeEnrichmentService } from '../../services/enrichment/store-enrichment.service';
import { storeEnrichmentQueue } from '../../config/queue';
import prismaClient from '../../utils/prisma';

// Cast para any até prisma generate rodar com backend parado
const prisma = prismaClient as any;

const router = Router();

/**
 * GET /store-enrichment/best-leads?limit=150
 * Analisa e ranqueia as melhores stores por qualidade real de dados Apollo.
 */
router.get('/best-leads', async (req: Request, res: Response) => {
  try {
    const limit = Number(req.query.limit ?? 150);

    const stores = await prisma.store.findMany({
      where: { enrichmentStatus: 'done' },
      select: {
        id: true, name: true,
        contactName: true, contactLastName: true, contactRole: true,
        contactEmail: true, contactPhone: true,
        apolloEnrichedAt: true, apolloOrgId: true,
        website: { select: { url: true, provider: { select: { name: true } } } },
        state: { select: { code: true, region: true } },
        brand: { select: { name: true } },
        partners: {
          select: {
            id: true, nome: true, qualificacao: true,
            email: true, phone: true, linkedinUrl: true,
            source: true, apolloHasPhone: true, apolloPersonId: true,
          },
        },
      },
      take: 500,
    });

    const CARGOS_DECISORES = ['proprietar', 'socio', 'diretor', 'gerente', 'presidente', 'ceo', 'owner', 'founder', 'gm ', 'general manager', 'coordenador', 'supervisor', 'chefe', 'head', 'vp ', 'vice'];

    function isDecisionMaker(cargo: string | null): boolean {
      if (!cargo) return false;
      const lower = cargo.toLowerCase();
      return CARGOS_DECISORES.some(c => lower.includes(c));
    }

    function extractDomain(url: string | null): string | null {
      if (!url) return null;
      try {
        const u = url.startsWith('http') ? url : `https://${url}`;
        return new URL(u).hostname.replace(/^www\./, '').toLowerCase();
      } catch { return null; }
    }

    // Agrupa stores pelo domínio do site
    const groups = new Map<string, any>();

    for (const store of stores) {
      const domain = extractDomain(store.website?.url) ?? `sem-site-${store.id}`;

      if (!groups.has(domain)) {
        groups.set(domain, {
          domain,
          marcas: new Set<string>(),
          estados: new Set<string>(),
          regioes: new Set<string>(),
          site: store.website?.url ?? '',
          provedor: store.website?.provider?.name ?? '',
          lojas: [],
          contatosMap: new Map<string, any>(), // chave: email ou linkedinUrl
        });
      }

      const group = groups.get(domain);
      if (store.brand?.name) group.marcas.add(store.brand.name);
      if (store.state?.code) group.estados.add(store.state.code);
      if (store.state?.region) group.regioes.add(store.state.region);
      group.lojas.push(store.name);

      // Adiciona contatos únicos pelo email ou linkedin
      for (const p of (store.partners ?? [])) {
        const key = p.email?.toLowerCase() ?? p.linkedinUrl?.toLowerCase() ?? null;
        if (!key) continue;

        if (!group.contatosMap.has(key)) {
          group.contatosMap.set(key, {
            nome: p.nome,
            cargo: p.qualificacao,
            email: p.email,
            phone: p.phone,
            linkedin: p.linkedinUrl,
            hasPhone: p.apolloHasPhone,
            decisor: isDecisionMaker(p.qualificacao),
          });
        } else {
          // Atualiza com dados mais completos se já existe
          const existing = group.contatosMap.get(key);
          if (!existing.phone && p.phone) existing.phone = p.phone;
          if (!existing.email && p.email) existing.email = p.email;
          if (!existing.linkedin && p.linkedinUrl) existing.linkedin = p.linkedinUrl;
          if (p.apolloHasPhone) existing.hasPhone = true;
        }
      }
    }

    // Monta resultado final
    const result = Array.from(groups.values())
      .map((g: any) => {
        const contatos = Array.from(g.contatosMap.values());
        const decisores = contatos.filter((c: any) => c.decisor).length;
        const comLinkedin = contatos.filter((c: any) => c.linkedin).length;
        const comEmail = contatos.filter((c: any) => c.email).length;
        const comPhone = contatos.filter((c: any) => c.phone).length;
        const comHasPhone = contatos.filter((c: any) => c.hasPhone).length;

        let score = 0;
        score += contatos.length * 3;
        score += decisores * 4;
        score += comEmail * 4;
        score += comLinkedin * 3;
        score += comPhone * 10;
        score += comHasPhone * 5;

        // Nome do grupo = nome da primeira loja sem número/sufixo de unidade
        const nomeGrupo = g.lojas[0]
          ?.replace(/:\s*concession[aá]ria.*$/i, '')
          ?.replace(/\s*[-–]\s*(unidade|loja|filial).*$/i, '')
          ?.trim() ?? g.domain;

        return {
          grupo: nomeGrupo,
          domain: g.domain,
          marcas: Array.from(g.marcas).join(', '),
          estados: Array.from(g.estados).join(', '),
          regioes: Array.from(g.regioes),
          site: g.site,
          provedor: g.provedor,
          lojas: g.lojas.length,
          totalContatos: contatos.length,
          decisores,
          comLinkedin,
          comEmail,
          comPhone,
          comHasPhone,
          score,
          contatos: contatos.sort((a: any, b: any) => (b.decisor ? 1 : 0) - (a.decisor ? 1 : 0)),
        };
      })
      .filter((g: any) => g.totalContatos > 0)
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, limit);

    res.json({
      success: true,
      data: result,
      count: result.length,
      resumo: {
        totalGrupos: result.length,
        totalContatos: result.reduce((acc: number, g: any) => acc + g.totalContatos, 0),
        totalLojas: result.reduce((acc: number, g: any) => acc + g.lojas, 0),
        comPhone: result.reduce((acc: number, g: any) => acc + g.comPhone, 0),
        comHasPhone: result.reduce((acc: number, g: any) => acc + g.comHasPhone, 0),
        comLinkedin: result.reduce((acc: number, g: any) => acc + g.comLinkedin, 0),
        comEmail: result.reduce((acc: number, g: any) => acc + g.comEmail, 0),
        decisores: result.reduce((acc: number, g: any) => acc + g.decisores, 0),
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /store-enrichment/linkedin-stats
 * Quantos parceiros têm LinkedIn, email, telefone — para planejar enriquecimento.
 */
router.get('/linkedin-stats', async (_req: Request, res: Response) => {
  try {
    const [total, comLinkedin, comEmail, comPhone, semNada, storesComPartners] = await Promise.all([
      prisma.storePartner.count({ where: { store: { enrichmentStatus: 'done' } } }),
      prisma.storePartner.count({ where: { store: { enrichmentStatus: 'done' }, linkedinUrl: { not: null } } }),
      prisma.storePartner.count({ where: { store: { enrichmentStatus: 'done' }, email: { not: null } } }),
      prisma.storePartner.count({ where: { store: { enrichmentStatus: 'done' }, phone: { not: null } } }),
      prisma.storePartner.count({ where: { store: { enrichmentStatus: 'done' }, linkedinUrl: null, email: null, phone: null } }),
      prisma.store.count({ where: { enrichmentStatus: 'done', partners: { some: {} } } }),
    ]);
    res.json({ success: true, data: { total, comLinkedin, comEmail, comPhone, semNada, storesComPartners } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /store-enrichment/stats
 * Mostra quantas stores estão em cada status de enriquecimento.
 */
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const [stats, queueStats, phoneReveal] = await Promise.all([
      storeEnrichmentService.getStats(),
      storeEnrichmentService.getApolloPhoneRevealStats(),
      Promise.all([
        storeEnrichmentQueue.getWaitingCount(),
        storeEnrichmentQueue.getActiveCount(),
        storeEnrichmentQueue.getCompletedCount(),
        storeEnrichmentQueue.getFailedCount(),
      ]).then(([waiting, active, completed, failed]) => ({ waiting, active, completed, failed })),
    ]);

    res.json({ success: true, data: { stores: stats, queue: queueStats, phoneReveal } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/apollo-phone-reveal', async (req: Request, res: Response) => {
  try {
    const limit = Number(req.body.limit ?? 20);

    if (limit > 100) {
      return res.status(400).json({ success: false, error: 'Limite máximo por lote: 100 contatos' });
    }

    const result = await storeEnrichmentService.revealApolloPhones(limit);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /store-enrichment/eligible?limit=20&region=SUDESTE
 * Lista as próximas stores elegíveis (preview antes de enfileirar).
 */
router.get('/eligible', async (req: Request, res: Response) => {
  try {
    const limit = Number(req.query.limit ?? 20);
    const region = req.query.region as string | undefined;
    const stores = await storeEnrichmentService.getEligibleStores(limit, region);
    res.json({ success: true, data: stores, count: stores.length });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /store-enrichment/enqueue-batch
 * Body: { limit?: number, region?: string, delayBetweenMs?: number }
 * Enfileira um lote de stores para enriquecimento.
 * Padrão: 20 stores, 3s de delay entre cada uma.
 */
router.post('/enqueue-batch', async (req: Request, res: Response) => {
  try {
    const limit = Number(req.body.limit ?? 20);
    const region = req.body.region as string | undefined;
    const delayBetweenMs = Number(req.body.delayBetweenMs ?? 3000);

    if (limit > 100) {
      return res.status(400).json({ success: false, error: 'Limite máximo por lote: 100 stores' });
    }

    const stores = await storeEnrichmentService.getEligibleStores(limit, region);

    let enqueued = 0;
    for (const store of stores) {
      await storeEnrichmentQueue.add(
        'enrich',
        { storeId: store.id, storeName: store.name },
        {
          jobId: `store-enrich-${store.id}-${Date.now()}`,
          delay: enqueued * delayBetweenMs,
        }
      );
      enqueued++;
    }

    res.json({
      success: true,
      data: {
        enqueued,
        region: region ?? 'todas',
        estimatedTimeMin: Math.round((enqueued * delayBetweenMs) / 60000),
        stores: stores.map((s: any) => ({
          id: s.id,
          name: s.name,
          brand: s.brand.name,
          state: s.state.code,
          provider: s.website?.provider?.name ?? 'sem provedor',
          website: s.website?.url,
        })),
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /store-enrichment/enqueue/:id
 * Enfileira uma store específica para enriquecimento manual.
 */
router.post('/enqueue/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await storeEnrichmentQueue.add(
      'enrich',
      { storeId: id, storeName: 'manual' },
      { jobId: `store-enrich-${id}-${Date.now()}` }
    );
    res.json({ success: true, data: { queued: true, storeId: id } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /store-enrichment/running
 * Stores atualmente sendo enriquecidas (enrichmentStatus = 'running').
 */
router.get('/running', async (_req: Request, res: Response) => {
  try {
    const stores = await prisma.store.findMany({
      where: { enrichmentStatus: 'running' },
      select: {
        id: true, name: true, enrichmentStatus: true,
        website: { select: { url: true, provider: { select: { name: true } } } },
        state: { select: { code: true } },
        brand: { select: { name: true } },
      },
      take: 20,
    });
    res.json({ success: true, data: stores });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /store-enrichment/export-csv
 * Exporta CSV completo ordenado por riqueza de dados.
 */
router.get('/export-csv', async (_req: Request, res: Response) => {
  try {
    const stores = await prisma.store.findMany({
      where: { enrichmentStatus: 'done' },
      select: {
        id: true, name: true,
        contactName: true, contactLastName: true, contactRole: true,
        contactEmail: true, contactPhone: true,
        apolloEnrichedAt: true, hunterEnrichedAt: true,
        website: { select: { url: true, provider: { select: { name: true } } } },
        state: { select: { code: true, region: true } },
        brand: { select: { name: true } },
        partners: { select: { nome: true, qualificacao: true, email: true, phone: true, linkedinUrl: true, source: true, apolloHasPhone: true } },
      },
      orderBy: { apolloEnrichedAt: 'desc' },
      take: 300,
    });

    // Pontua cada store pela riqueza de dados
    function score(s: any): number {
      let pts = 0;
      const partners = s.partners ?? [];
      const temTelefone = s.contactPhone || partners.some((p: any) => p.phone);
      const temEmail = s.contactEmail || partners.some((p: any) => p.email);
      const temLinkedin = partners.some((p: any) => p.linkedinUrl);
      if (temTelefone) pts += 10;
      if (temEmail) pts += 5;
      if (temLinkedin) pts += 2;
      pts += Math.min(partners.length, 5);
      return pts;
    }

    stores.sort((a: any, b: any) => score(b) - score(a));

    const rows: string[][] = [];
    const header = [
      'Empresa', 'Marca', 'Estado', 'Região', 'Site', 'Provedor',
      'Contato', 'Cargo', 'Email', 'Telefone', 'LinkedIn', 'Fonte',
      'Outros contatos', 'Score',
    ];

    for (const s of stores) {
      const partners: any[] = s.partners ?? [];
      const mainPartner = partners.find((p: any) => p.email === s.contactEmail) ?? partners[0] ?? null;
      const outrosContatos = partners
        .filter((p: any) => p !== mainPartner)
        .map((p: any) => [p.nome, p.qualificacao, p.email, p.phone].filter(Boolean).join(' | '))
        .join(' || ');

      const nomeContato = mainPartner?.nome
        ?? [s.contactName, s.contactLastName].filter(Boolean).join(' ')
        ?? '';
      const cargo = mainPartner?.qualificacao ?? s.contactRole ?? '';
      const email = mainPartner?.email ?? s.contactEmail ?? '';
      const telefone = mainPartner?.phone ?? s.contactPhone ?? '';
      const linkedin = mainPartner?.linkedinUrl ?? '';
      const fonte = mainPartner?.source ?? (s.hunterEnrichedAt && !s.apolloEnrichedAt ? 'Hunter' : 'Apollo');

      rows.push([
        s.name,
        s.brand?.name ?? '',
        s.state?.code ?? '',
        s.state?.region ?? '',
        s.website?.url ?? '',
        s.website?.provider?.name ?? '',
        nomeContato,
        cargo,
        email,
        telefone,
        linkedin,
        fonte,
        outrosContatos,
        String(score(s)),
      ]);
    }

    const escape = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [header, ...rows].map(r => r.map(escape).join(',')).join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="leads-enriquecidos-${new Date().toISOString().slice(0,10)}.csv"`);
    res.send('\uFEFF' + csv); // BOM para abrir certo no Excel
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /store-enrichment/enriched?limit=50
 * Stores já enriquecidas com dados de contato.
 */
router.get('/enriched', async (req: Request, res: Response) => {
  try {
    const limit = Number(req.query.limit ?? 50);
    const stores = await prisma.store.findMany({
      where: { enrichmentStatus: 'done' },
      select: {
        id: true, name: true,
        contactName: true, contactLastName: true, contactRole: true,
        contactEmail: true, contactPhone: true,
        apolloEnrichedAt: true, hunterEnrichedAt: true,
        website: { select: { url: true, provider: { select: { name: true } } } },
        state: { select: { code: true } },
        brand: { select: { name: true } },
        partners: { select: { nome: true, qualificacao: true, email: true, phone: true, linkedinUrl: true, source: true, apolloHasPhone: true } },
      },
      orderBy: { apolloEnrichedAt: 'desc' },
      take: limit,
    });
    res.json({ success: true, data: stores, count: stores.length });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /store-enrichment/no-coverage?limit=200
 * Stores que passaram pelo enriquecimento mas Apollo/Hunter não tinham dados.
 * Útil para trabalhar depois com abordagem alternativa (LinkedIn, scraping, etc).
 */
router.get('/no-coverage', async (req: Request, res: Response) => {
  try {
    const limit = Number(req.query.limit ?? 200);
    const stores = await prisma.store.findMany({
      where: { enrichmentStatus: 'done', enrichmentError: 'sem_cobertura' },
      select: {
        id: true, name: true,
        partners: { select: { nome: true, qualificacao: true, email: true, linkedinUrl: true, source: true } },
        website: { select: { url: true, provider: { select: { name: true } } } },
        state: { select: { code: true, region: true } },
        brand: { select: { name: true } },
        apolloOrgId: true,
        apolloEnrichedAt: true,
        hunterEnrichedAt: true,
      },
      orderBy: { state: { region: 'asc' } },
      take: limit,
    });
    res.json({ success: true, data: stores, count: stores.length });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /store-enrichment/pause
 * Pausa a fila (para de processar novos jobs).
 */
router.post('/pause', async (_req: Request, res: Response) => {
  try {
    await storeEnrichmentQueue.pause();
    res.json({ success: true, data: { paused: true } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /store-enrichment/resume
 * Retoma a fila.
 */
router.post('/resume', async (_req: Request, res: Response) => {
  try {
    await storeEnrichmentQueue.resume();
    res.json({ success: true, data: { resumed: true } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PATCH /store-enrichment/partners/:storeId/:nome/phone
 * Salva manualmente o telefone de um parceiro (ex: copiado do Apollo).
 */
router.patch('/partners/:storeId/:nome/phone', async (req: Request, res: Response) => {
  try {
    const { storeId, nome } = req.params;
    const { phone } = req.body;

    if (!phone || typeof phone !== 'string') {
      return res.status(400).json({ success: false, error: 'Campo phone obrigatório' });
    }

    const partner = await prisma.storePartner.findFirst({ where: { storeId, nome } });
    if (!partner) {
      return res.status(404).json({ success: false, error: 'Parceiro não encontrado' });
    }

    await prisma.storePartner.update({
      where: { id: partner.id },
      data: { phone, apolloPhoneRevealedAt: new Date() },
    });

    // Se for o contato principal da store, atualiza Store.contactPhone também
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { contactEmail: true, contactPhone: true },
    });
    if (store && (!store.contactPhone || store.contactEmail === partner.email)) {
      await prisma.store.update({ where: { id: storeId }, data: { contactPhone: phone } });
    }

    res.json({ success: true, data: { storeId, nome, phone } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /store-enrichment/sync-apollo-phones
 * Busca no Apollo os telefones já revelados para parceiros que ainda não têm phone no banco.
 * Não gasta crédito — só lê o que já foi revelado.
 */
router.post('/sync-apollo-phones', async (req: Request, res: Response) => {
  try {
    const limit = Number(req.body.limit ?? 50);
    const APOLLO_API_KEY = process.env.APOLLO_API_KEY!;
    const APOLLO_BASE = 'https://api.apollo.io/api/v1';

    // Parceiros com algum identificador Apollo mas sem telefone ainda
    const partners = await prisma.storePartner.findMany({
      where: {
        phone: null,
        OR: [
          { apolloPersonId: { not: null } },
          { email: { not: null } },
          { linkedinUrl: { not: null } },
        ],
      },
      select: { id: true, nome: true, apolloPersonId: true, email: true, linkedinUrl: true, storeId: true },
      take: limit,
    });

    let synced = 0;
    let noPhone = 0;
    let errors = 0;
    const firstError: string[] = [];

    for (const partner of partners) {
      try {
        const payload: Record<string, any> = {};
        if (partner.apolloPersonId) payload.id = partner.apolloPersonId;
        else if (partner.email) payload.email = partner.email;
        else if (partner.linkedinUrl) payload.linkedin_url = partner.linkedinUrl;
        else continue;

        const axios = require('axios');
        const res2 = await axios.post(
          `${APOLLO_BASE}/people/match`,
          payload,
          { headers: { 'X-Api-Key': APOLLO_API_KEY, 'Content-Type': 'application/json' }, timeout: 15000 }
        );

        const person = res2.data?.person;
        if (!person) { noPhone++; continue; }

        const phoneNumbers: any[] = person.phone_numbers ?? [];
        if (phoneNumbers.length === 0) { noPhone++; continue; }

        const mobile = phoneNumbers.find((p: any) => p.type === 'mobile') ?? phoneNumbers[0];
        const phone: string | null = mobile?.sanitized_number ?? mobile?.number ?? null;
        if (!phone) { noPhone++; continue; }

        await prisma.storePartner.update({
          where: { id: partner.id },
          data: { phone, apolloPhoneRevealedAt: new Date() },
        });

        const store = await prisma.store.findUnique({
          where: { id: partner.storeId },
          select: { contactPhone: true, contactEmail: true },
        });
        if (store && (!store.contactPhone || store.contactEmail === partner.email)) {
          await prisma.store.update({ where: { id: partner.storeId }, data: { contactPhone: phone } });
        }

        console.log(`[sync-apollo-phones] ${partner.nome}: ${phone}`);
        synced++;
      } catch (e: any) {
        if (firstError.length < 3) firstError.push(`${partner.nome}: ${e.response?.status} ${e.response?.data?.error ?? e.message}`);
        errors++;
      }
    }

    res.json({
      success: true,
      data: { total: partners.length, synced, noPhone, errors, firstError },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;

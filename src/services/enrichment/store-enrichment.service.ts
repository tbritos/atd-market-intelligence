/**
 * store-enrichment.service.ts
 *
 * Enriquece stores com site usando Apollo + Hunter.
 * REGRAS:
 *  - Nunca enriquece stores cujo provedor é Autoforce (já são clientes)
 *  - Nunca enriquece clienteAutoforce = true
 *  - Apollo: org por domínio → people por orgId → economiza créditos
 *  - Hunter: só roda se Apollo não encontrou email (fallback)
 */

import axios from 'axios';
import prismaClient from '../../utils/prisma';

// Cast para any até prisma generate rodar com backend parado
const prisma = prismaClient as any;

const APOLLO_API_KEY = process.env.APOLLO_API_KEY ?? null;
const APOLLO_BASE = 'https://api.apollo.io/api/v1';
const APOLLO_PHONE_WEBHOOK_URL = process.env.APOLLO_WEBHOOK_URL
  ? `${process.env.APOLLO_WEBHOOK_URL}/webhooks/apollo-phone`
  : null;
const HUNTER_API_KEY = process.env.HUNTER_API_KEY ?? null;
const HUNTER_BASE = 'https://api.hunter.io/v2';

const AUTOFORCE_PROVIDER_SLUG = 'autoforce';

const DECISION_MAKER_TITLES = ['owner', 'founder', 'ceo', 'coo', 'diretor', 'director', 'gerente', 'manager', 'presidente', 'socio', 'partner', 'vp'];

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function cleanText(s: string | null | undefined): string | null {
  if (!s) return null;
  return s.replace(/^[^a-zA-ZÀ-ÿ]+/, '').trim() || null; // remove chars especiais do início
}

function cleanStoreName(name: string): string {
  return name
    .split(/[:|]/)[0]           // remove tudo após ":" ou "|"
    .split(' - ')[0]            // remove tudo após " - " (ex: "Pavepe Fiat - Pará de Minas")
    .split(',')[0]              // remove tudo após vírgula
    .replace(/\s+(LTDA|ME|EIRELI|S\.?A\.?|EPP|SS)\s*\.?$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function extractDomain(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = url.startsWith('http') ? url : `https://${url}`;
    return new URL(u).hostname.replace(/^www\./, '');
  } catch { return null; }
}

function pickBestApolloPhone(person: any): string | null {
  const phoneNumbers: any[] = person?.phone_numbers ?? [];
  const preferred =
    phoneNumbers.find((phone) => phone?.type === 'mobile') ??
    phoneNumbers.find((phone) => phone?.sanitized_number || phone?.number) ??
    null;

  return preferred?.sanitized_number ?? preferred?.number ?? null;
}

export interface StoreEnrichmentResult {
  storeId: string;
  domain: string | null;
  steps: {
    apollo_org: 'done' | 'skipped' | 'not_found' | 'error';
    apollo_people: 'done' | 'skipped' | 'not_found' | 'error';
    hunter: 'done' | 'skipped' | 'not_found' | 'error';
  };
  creditsUsed: number; // estimativa
}

export class StoreEnrichmentService {

  async enrichStore(storeId: string): Promise<StoreEnrichmentResult> {
    const store = await prisma.store.findUniqueOrThrow({
      where: { id: storeId },
      include: {
        website: { include: { provider: true } },
        partners: true,
        brand: { select: { name: true } },
      },
    });

    const result: StoreEnrichmentResult = {
      storeId,
      domain: extractDomain(store.website?.url ?? null),
      steps: { apollo_org: 'skipped', apollo_people: 'skipped', hunter: 'skipped' },
      creditsUsed: 0,
    };

    // ── Proteções ──────────────────────────────────────────────────────────────
    // Já foi processada — evita re-enriquecimento em caso de jobs duplicados na fila
    if (store.enrichmentStatus === 'done' || store.enrichmentStatus === 'skipped') {
      return result;
    }

    if (store.clienteAutoforce) {
      await prisma.store.update({
        where: { id: storeId },
        data: { enrichmentStatus: 'skipped', enrichmentError: 'Cliente Autoforce' },
      });
      return result;
    }

    if (store.website?.provider?.slug === AUTOFORCE_PROVIDER_SLUG) {
      await prisma.store.update({
        where: { id: storeId },
        data: { enrichmentStatus: 'skipped', enrichmentError: 'Provedor Autoforce' },
      });
      return result;
    }

    if (!result.domain) {
      await prisma.store.update({
        where: { id: storeId },
        data: { enrichmentStatus: 'skipped', enrichmentError: 'Sem domínio' },
      });
      return result;
    }

    await prisma.store.update({
      where: { id: storeId },
      data: { enrichmentStatus: 'running', enrichmentError: null },
    });

    try {
      // ── PASSO 1: Apollo Org ────────────────────────────────────────────────
      if (APOLLO_API_KEY && !store.apolloOrgId) {
        result.steps.apollo_org = await this.stepApolloOrg(storeId, result.domain, store.name, store.nomeFantasia ?? null);
        result.creditsUsed += 1;
        await sleep(600);
      }

      // ── PASSO 2: Apollo People ─────────────────────────────────────────────
      // Sempre busca — sócios da Receita não têm email/telefone
      if (APOLLO_API_KEY) {
        const updated = await prisma.store.findUniqueOrThrow({ where: { id: storeId } });
        result.steps.apollo_people = await this.stepApolloPeople(
          storeId, result.domain, updated.apolloOrgId ?? null, store.name
        );
        result.creditsUsed += 1;
        await sleep(600);
      }

      // ── PASSO 3: Hunter (fallback — só se Apollo não achou email de contato) ─
      if (HUNTER_API_KEY) {
        // Sócios da Receita têm email null — só Apollo/Hunter salvam com email
        const temEmailPartner = await prisma.storePartner.findFirst({
          where: { storeId, email: { not: null } },
        });
        const storeAtual = await prisma.store.findUniqueOrThrow({ where: { id: storeId } });
        const jaTemEmail = !!temEmailPartner || !!storeAtual.contactEmail;

        if (!jaTemEmail) {
          result.steps.hunter = await this.stepHunter(storeId, result.domain);
          result.creditsUsed += 1;
        } else {
          result.steps.hunter = 'skipped';
        }
      }

      // Verifica se conseguiu dados reais (Apollo/Hunter) — se não, marca sem_cobertura
      const storeCheck = await prisma.store.findUniqueOrThrow({
        where: { id: storeId },
        include: { partners: { select: { source: true, email: true } } },
      });
      const temDadosReais = storeCheck.contactEmail ||
        storeCheck.partners.some((p: any) => p.source === 'apollo' || p.source === 'hunter');

      await prisma.store.update({
        where: { id: storeId },
        data: {
          enrichmentStatus: 'done',
          enrichmentError: temDadosReais ? null : 'sem_cobertura',
        },
      });

    } catch (err: any) {
      const msg = err?.response?.data?.error ?? err?.message ?? 'Erro';
      await prisma.store.update({
        where: { id: storeId },
        data: { enrichmentStatus: 'error', enrichmentError: msg },
      });
      throw err;
    }

    return result;
  }

  // ── Apollo Org ─────────────────────────────────────────────────────────────
  private async stepApolloOrg(
    storeId: string, domain: string, storeName: string, nomeFantasia: string | null
  ): Promise<StoreEnrichmentResult['steps']['apollo_org']> {
    try {
      let org: any = null;

      // Tentativa 1: enrich por domínio (mais preciso)
      try {
        const { data } = await axios.get(`${APOLLO_BASE}/organizations/enrich`, {
          params: { domain },
          headers: { 'X-Api-Key': APOLLO_API_KEY },
          timeout: 15000,
        });
        org = data?.organization ?? null;
      } catch (err: any) {
        if (err?.response?.status !== 404) throw err;
      }

      // Tentativa 2: nomeFantasia (nome comercial real)
      if (!org && nomeFantasia) {
        try {
          const { data } = await axios.post(
            `${APOLLO_BASE}/mixed_companies/search`,
            { q_organization_name: cleanStoreName(nomeFantasia), per_page: 1, page: 1 },
            { headers: { 'X-Api-Key': APOLLO_API_KEY, 'Content-Type': 'application/json' }, timeout: 15000 }
          );
          org = data?.organizations?.[0] ?? null;
        } catch { /* continua */ }
      }

      // Tentativa 3: nome limpo da store
      if (!org) {
        try {
          const { data } = await axios.post(
            `${APOLLO_BASE}/mixed_companies/search`,
            { q_organization_name: cleanStoreName(storeName), per_page: 1, page: 1 },
            { headers: { 'X-Api-Key': APOLLO_API_KEY, 'Content-Type': 'application/json' }, timeout: 15000 }
          );
          org = data?.organizations?.[0] ?? null;
        } catch { /* sem resultado */ }
      }

      // Tentativa 4: primeiras 2 palavras — captura o grupo pai
      // Ex: "Carbel BYD Savassi" → busca "Carbel BYD" → encontra "Carbel Auto Group"
      if (!org) {
        const groupName = cleanStoreName(storeName).split(/\s+/).slice(0, 2).join(' ');
        if (groupName.length >= 5) {
          try {
            const { data } = await axios.post(
              `${APOLLO_BASE}/mixed_companies/search`,
              { q_organization_name: groupName, per_page: 1, page: 1 },
              { headers: { 'X-Api-Key': APOLLO_API_KEY, 'Content-Type': 'application/json' }, timeout: 15000 }
            );
            org = data?.organizations?.[0] ?? null;
          } catch { /* sem resultado */ }
        }
      }

      // Tentativa 5: só a primeira palavra (nome do grupo/família)
      // Ex: "Pavepe Fiat - Pará de Minas" → busca "Pavepe" → encontra "Pavepe"
      // Evita palavras genéricas de marca que retornariam resultados errados
      const BRAND_WORDS = new Set(['honda','toyota','fiat','ford','bmw','kia','vw','byd','jac','jeep','ram','chery','hyundai','yamaha','kawasaki','suzuki','ducati','triumph','harley','renault','peugeot','citroen','volvo','scania','mercedes','iveco','mitsubishi','nissan','volkswagen']);
      if (!org) {
        const firstWord = cleanStoreName(storeName).split(/\s+/)[0].toLowerCase();
        if (firstWord.length >= 4 && !BRAND_WORDS.has(firstWord)) {
          try {
            const { data } = await axios.post(
              `${APOLLO_BASE}/mixed_companies/search`,
              { q_organization_name: firstWord, per_page: 1, page: 1 },
              { headers: { 'X-Api-Key': APOLLO_API_KEY, 'Content-Type': 'application/json' }, timeout: 15000 }
            );
            org = data?.organizations?.[0] ?? null;
          } catch { /* sem resultado */ }
        }
      }

      if (!org) {
        await prisma.store.update({
          where: { id: storeId },
          data: { apolloEnrichedAt: new Date() },
        });
        return 'not_found';
      }

      await prisma.store.update({
        where: { id: storeId },
        data: {
          apolloOrgId: org.id ?? null,
          linkedin: org.linkedin_url ?? undefined,
          phone: (org.phone ?? org.primary_phone?.number) ? (org.phone ?? org.primary_phone?.number) : undefined,
          apolloEnrichedAt: new Date(),
        },
      });

      return 'done';
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? err?.message;
      await prisma.store.update({
        where: { id: storeId },
        data: { enrichmentError: `Apollo org: ${msg}`, apolloEnrichedAt: new Date() },
      });
      return 'error';
    }
  }

  // ── Apollo People ──────────────────────────────────────────────────────────
  private async stepApolloPeople(
    storeId: string, domain: string, orgId: string | null, storeName: string
  ): Promise<StoreEnrichmentResult['steps']['apollo_people']> {
    try {
      let people: any[] = [];

      // Tentativa 1a: people search pelo organization_id filtrado por BR
      if (orgId) {
        try {
          const { data } = await axios.post(
            `${APOLLO_BASE}/mixed_people/api_search`,
            {
              organization_ids: [orgId],
              person_locations_country_codes: ['BR'],
              per_page: 10, page: 1,
            },
            { headers: { 'X-Api-Key': APOLLO_API_KEY, 'Content-Type': 'application/json' }, timeout: 15000 }
          );
          people = data?.people ?? [];
        } catch { /* tenta próximo */ }
        await sleep(400);
      }

      // Tentativa 1b: top people pelo orgId (fallback)
      if (people.length === 0 && orgId) {
        try {
          const { data } = await axios.get(`${APOLLO_BASE}/mixed_people/organization_top_people`, {
            params: { organization_id: orgId, page: 1, per_page: 10 },
            headers: { 'X-Api-Key': APOLLO_API_KEY },
            timeout: 15000,
          });
          people = data?.people ?? [];
        } catch { /* tenta próximo */ }
        await sleep(400);
      }

      // Tentativa 2: busca por domínio — filtrado por BR para evitar funcionários internacionais
      if (people.length === 0 && domain) {
        try {
          const { data } = await axios.post(
            `${APOLLO_BASE}/mixed_people/api_search`,
            {
              q_organization_domains: [domain],
              person_locations_country_codes: ['BR'],
              person_seniorities: ['owner', 'founder', 'c_suite', 'partner', 'vp', 'director', 'manager'],
              per_page: 10, page: 1,
            },
            { headers: { 'X-Api-Key': APOLLO_API_KEY, 'Content-Type': 'application/json' }, timeout: 15000 }
          );
          people = data?.people ?? [];
        } catch { /* tenta próximo */ }
        await sleep(400);
      }

      // Tentativa 3: search por nome limpo — filtrado por BR
      if (people.length === 0) {
        try {
          const { data } = await axios.post(
            `${APOLLO_BASE}/mixed_people/api_search`,
            {
              q_organization_name: cleanStoreName(storeName),
              person_locations_country_codes: ['BR'],
              person_seniorities: ['owner', 'founder', 'c_suite', 'partner', 'vp', 'director', 'manager'],
              per_page: 5, page: 1,
            },
            { headers: { 'X-Api-Key': APOLLO_API_KEY, 'Content-Type': 'application/json' }, timeout: 15000 }
          );
          people = data?.people ?? [];
        } catch { /* sem resultado */ }
        await sleep(400);
      }

      // Tentativa 4: busca por TÍTULO DO CARGO com primeiras 2 palavras — sem filtro seniority
      // Captura: "Carbel Auto Group" → pessoa com cargo "Coordenadora de Vendas Carbel BYD"
      if (people.length === 0) {
        const titleWords = cleanStoreName(storeName).split(/\s+/).filter(w => w.length >= 3);
        const titleQuery = titleWords.slice(0, 2).join(' ');
        if (titleQuery.length >= 5) {
          try {
            const { data } = await axios.post(
              `${APOLLO_BASE}/mixed_people/api_search`,
              {
                q_person_title: titleQuery,
                person_locations_country_codes: ['BR'],
                per_page: 10, page: 1,
              },
              { headers: { 'X-Api-Key': APOLLO_API_KEY, 'Content-Type': 'application/json' }, timeout: 15000 }
            );
            people = data?.people ?? [];
          } catch { /* sem resultado */ }
          await sleep(400);
        }
      }

      // Tentativa 5: busca por TÍTULO com só a primeira palavra (nome do grupo/família)
      // Ex: "Pavepe Fiat" → título "Pavepe" | "Banzai Honda" → título "Banzai"
      if (people.length === 0) {
        const BRAND_WORDS = new Set(['honda','toyota','fiat','ford','bmw','kia','vw','byd','jac','jeep','ram','chery','hyundai','yamaha','kawasaki','suzuki','ducati','triumph','harley','renault','peugeot','citroen','volvo','scania','mercedes','iveco','mitsubishi','nissan','volkswagen']);
        const firstWord = cleanStoreName(storeName).split(/\s+/)[0];
        if (firstWord.length >= 4 && !BRAND_WORDS.has(firstWord.toLowerCase())) {
          try {
            const { data } = await axios.post(
              `${APOLLO_BASE}/mixed_people/api_search`,
              {
                q_person_title: firstWord,
                person_locations_country_codes: ['BR'],
                per_page: 10, page: 1,
              },
              { headers: { 'X-Api-Key': APOLLO_API_KEY, 'Content-Type': 'application/json' }, timeout: 15000 }
            );
            people = data?.people ?? [];
          } catch { /* sem resultado */ }
        }
      }

      if (people.length === 0) return 'not_found';

      // Ordena: decisores primeiro, depois por seniority
      const sorted = [...people].sort((a, b) => {
        const aD = DECISION_MAKER_TITLES.some(t => (a.title ?? a.seniority ?? '').toLowerCase().includes(t)) ? 1 : 0;
        const bD = DECISION_MAKER_TITLES.some(t => (b.title ?? b.seniority ?? '').toLowerCase().includes(t)) ? 1 : 0;
        return bD - aD;
      });

      for (const p of sorted) {
        // api_search retorna dados limitados — revela email e LinkedIn via people/match
        let revealed: any = p;
        if (p.id && APOLLO_API_KEY) {
          try {
            const { data: revData } = await axios.post(
              `${APOLLO_BASE}/people/match`,
              { id: p.id, reveal_personal_emails: true },
              { headers: { 'X-Api-Key': APOLLO_API_KEY, 'Content-Type': 'application/json' }, timeout: 10000 }
            );
            if (revData?.person) revealed = revData.person;
          } catch { /* usa dados básicos */ }
          await sleep(300);
        }

        const nome = [revealed.first_name, revealed.last_name].filter(Boolean).join(' ') || revealed.name || p.first_name || 'Desconhecido';
        if (nome === 'Desconhecido' || nome.trim() === '') continue;

        // Email: ignora placeholder "email_not_unlocked@..."
        const email = (revealed.email && !revealed.email.includes('email_not_unlocked')) ? revealed.email : null;

        // Pula contatos claramente internacionais (país definido e não é Brasil)
        const personCountry = (revealed.country ?? '').toLowerCase();
        if (personCountry && personCountry !== 'brazil' && personCountry !== 'brasil' && personCountry !== 'br') continue;
        const phone = pickBestApolloPhone(revealed);
        const apolloHasPhone =
          Boolean(phone) ||
          revealed.has_direct_phone === 'Yes' ||
          p.has_direct_phone === 'Yes' ||
          Boolean(revealed.phone_numbers?.length) ||
          Boolean(p.phone_numbers?.length);

        const jaExiste = await prisma.storePartner.findFirst({ where: { storeId, nome } });
        if (jaExiste) {
          await prisma.storePartner.update({
            where: { id: jaExiste.id },
            data: {
              qualificacao: cleanText(revealed.title ?? p.title) ?? jaExiste.qualificacao,
              email: email ?? jaExiste.email,
              emailStatus: revealed.email_status ?? jaExiste.emailStatus,
              phone: phone ?? jaExiste.phone,
              linkedinUrl: revealed.linkedin_url ?? jaExiste.linkedinUrl,
              apolloPersonId: p.id ?? jaExiste.apolloPersonId,
              apolloHasPhone,
              apolloPhoneRevealedAt: phone ? new Date() : jaExiste.apolloPhoneRevealedAt,
              apolloPhoneRevealError: phone ? null : jaExiste.apolloPhoneRevealError,
            },
          });
        } else {
          await prisma.storePartner.create({
            data: {
              storeId,
              nome,
              qualificacao: cleanText(revealed.title ?? p.title),
              email,
              emailStatus: revealed.email_status ?? null,
              phone,
              linkedinUrl: revealed.linkedin_url ?? null,
              apolloPersonId: p.id ?? null,
              apolloHasPhone,
              apolloPhoneRevealedAt: phone ? new Date() : null,
              source: 'apollo',
            },
          });
        }

        // Salva como contato principal se não tiver email ainda, ou se este é verificado e o atual não
        const storeAtual = await prisma.store.findUniqueOrThrow({ where: { id: storeId } });
        const isVerified = revealed.email_status === 'verified';
        if (email && (!storeAtual.contactEmail || isVerified)) {
          await prisma.store.update({
            where: { id: storeId },
            data: {
              contactName: revealed.first_name ?? null,
              contactLastName: revealed.last_name ?? null,
              contactRole: cleanText(revealed.title ?? p.title),
              contactEmail: email,
              contactPhone: phone ?? storeAtual.contactPhone,
            },
          });
        } else if (!storeAtual.contactPhone && phone) {
          await prisma.store.update({
            where: { id: storeId },
            data: { contactPhone: phone },
          });
        }
      }

      return 'done';
    } catch (err: any) {
      return 'error';
    }
  }

  // ── Hunter domain-search ───────────────────────────────────────────────────
  private async stepHunter(storeId: string, domain: string): Promise<StoreEnrichmentResult['steps']['hunter']> {
    try {
      const { data } = await axios.get(`${HUNTER_BASE}/domain-search`, {
        params: { domain, api_key: HUNTER_API_KEY, limit: 10 },
        timeout: 10000,
      });

      const emails: any[] = data?.data?.emails ?? [];
      if (emails.length === 0) {
        await prisma.store.update({ where: { id: storeId }, data: { hunterEnrichedAt: new Date() } });
        return 'not_found';
      }

      // Ordena por cargo de decisor + confiança
      const sorted = [...emails].sort((a, b) => {
        const aD = DECISION_MAKER_TITLES.some(t => (a.position ?? '').toLowerCase().includes(t)) ? 1 : 0;
        const bD = DECISION_MAKER_TITLES.some(t => (b.position ?? '').toLowerCase().includes(t)) ? 1 : 0;
        return bD !== aD ? bD - aD : (b.confidence ?? 0) - (a.confidence ?? 0);
      });

      // Salva contato principal (melhor decisor)
      const best = sorted[0];
      await prisma.store.update({
        where: { id: storeId },
        data: {
          contactEmail: best.value ?? null,
          contactName: best.first_name ?? null,
          contactLastName: best.last_name ?? null,
          contactRole: best.position ?? null,
          hunterEnrichedAt: new Date(),
        },
      });

      // Salva TODOS os emails como StorePartner
      for (const e of sorted) {
        if (!e.value) continue;
        const nome = [e.first_name, e.last_name].filter(Boolean).join(' ') || e.value;
        const jaExiste = await prisma.storePartner.findFirst({ where: { storeId, nome } });
        if (jaExiste) continue;
        await prisma.storePartner.create({
          data: {
            storeId,
            nome,
            qualificacao: e.position ?? null,
            email: e.value,
            emailStatus: e.verification?.status ?? null,
            emailConfidence: e.confidence ?? null,
            source: 'hunter',
          },
        });
      }

      return 'done';
    } catch (err: any) {
      await prisma.store.update({
        where: { id: storeId },
        data: { hunterEnrichedAt: new Date() },
      });
      return err?.response?.status === 404 ? 'not_found' : 'error';
    }
  }

  // ── Busca stores elegíveis para enriquecimento ─────────────────────────────
  async getApolloPhoneRevealStats() {
    const [pending, withPhoneFlag, revealed, requested] = await Promise.all([
      prisma.storePartner.count({
        where: {
          source: 'apollo',
          phone: null,
          OR: [
            { apolloPersonId: { not: null } },
            { email: { not: null } },
            { linkedinUrl: { not: null } },
          ],
        },
      }),
      prisma.storePartner.count({
        where: {
          source: 'apollo',
          apolloHasPhone: true,
        },
      }),
      prisma.storePartner.count({
        where: {
          source: 'apollo',
          phone: { not: null },
          apolloPhoneRevealedAt: { not: null },
        },
      }),
      prisma.storePartner.count({
        where: {
          source: 'apollo',
          apolloPhoneRevealRequestedAt: { not: null },
          phone: null,
        },
      }),
    ]);

    return { pending, withPhoneFlag, revealed, requested };
  }

  async revealApolloPhones(limit = 20) {
    if (!APOLLO_API_KEY) {
      throw new Error('APOLLO_API_KEY não configurada');
    }

    const candidates = await prisma.storePartner.findMany({
      where: {
        source: 'apollo',
        phone: null,
        OR: [
          { apolloPersonId: { not: null } },
          { email: { not: null } },
          { linkedinUrl: { not: null } },
        ],
      },
      select: {
        id: true,
        storeId: true,
        nome: true,
        email: true,
        linkedinUrl: true,
        apolloPersonId: true,
      },
      orderBy: [
        { apolloHasPhone: 'desc' },
        { createdAt: 'asc' },
      ],
      take: limit,
    });

    let revealed = 0;
    let noPhone = 0;
    let errors = 0;
    const results: any[] = [];

    for (const partner of candidates) {
      try {
        const payload: Record<string, any> = {
          reveal_phone_number: true,
          webhook_url: APOLLO_PHONE_WEBHOOK_URL,
        };

        if (partner.apolloPersonId) payload.id = partner.apolloPersonId;
        else if (partner.email) payload.email = partner.email;
        else if (partner.linkedinUrl) payload.linkedin_url = partner.linkedinUrl;
        else {
          results.push({ partnerId: partner.id, nome: partner.nome, status: 'skipped', reason: 'missing_identifier' });
          continue;
        }

        const res = await axios.post(
          `${APOLLO_BASE}/people/match`,
          {
            ...payload,
            reveal_personal_emails: true,
          },
          { headers: { 'X-Api-Key': APOLLO_API_KEY, 'Content-Type': 'application/json' }, timeout: 15000 },
        );

        const person = res.data?.person;
        const phone = pickBestApolloPhone(person);

        if (!person || !phone) {
          await prisma.storePartner.update({
            where: { id: partner.id },
            data: {
              apolloPersonId: person?.id ?? partner.apolloPersonId,
              linkedinUrl: person?.linkedin_url ?? partner.linkedinUrl,
              apolloHasPhone: person?.has_direct_phone === 'Yes' || person?.phone_numbers?.length > 0 || false,
              apolloPhoneRevealRequestedAt: new Date(),
              apolloPhoneRevealError: person ? 'Apollo não retornou telefone' : 'Apollo não retornou pessoa',
            },
          });
          noPhone++;
          results.push({ partnerId: partner.id, nome: partner.nome, status: 'no_phone' });
          await sleep(600);
          continue;
        }

        await prisma.storePartner.update({
          where: { id: partner.id },
          data: {
            apolloPersonId: person?.id ?? partner.apolloPersonId,
            linkedinUrl: person?.linkedin_url ?? partner.linkedinUrl,
            apolloHasPhone: person?.has_direct_phone === 'Yes' || person?.phone_numbers?.length > 0 || undefined,
            apolloPhoneRevealRequestedAt: new Date(),
            apolloPhoneRevealedAt: new Date(),
            phone,
            apolloPhoneRevealError: null,
          },
        });

        const store = await prisma.store.findUnique({
          where: { id: partner.storeId },
          select: { contactPhone: true, contactEmail: true },
        });

        if (store && (!store.contactPhone || (partner.email && store.contactEmail === partner.email))) {
          await prisma.store.update({
            where: { id: partner.storeId },
            data: { contactPhone: phone },
          });
        }

        revealed++;
        results.push({
          partnerId: partner.id,
          nome: partner.nome,
          status: 'revealed',
          phone,
          identifier: payload.id ? 'apollo_id' : payload.email ? 'email' : 'linkedin',
        });
        await sleep(600);
      } catch (err: any) {
        errors++;
        const msg = err?.response?.data?.error ?? err?.message ?? 'Erro no reveal Apollo';
        await prisma.storePartner.update({
          where: { id: partner.id },
          data: {
            apolloPhoneRevealedAt: new Date(),
            apolloPhoneRevealError: msg,
          },
        });
        results.push({ partnerId: partner.id, nome: partner.nome, status: 'error', error: msg });
      }
    }

    return {
      total: candidates.length,
      revealed,
      noPhone,
      errors,
      results,
    };
  }

  async getEligibleStores(limit = 20, region?: string) {
    const baseWhere = {
      websiteId: { not: null },
      clienteAutoforce: false,
      OR: [{ enrichmentStatus: 'pending' }, { enrichmentStatus: null }],
      ...(region ? { state: { region } } : {}),
    };

    const select = {
      id: true, name: true,
      website: { select: { url: true, provider: { select: { name: true } } } },
      state: { select: { code: true, region: true } },
      brand: { select: { name: true } },
    };

    const orderBy = [
      { state: { region: 'asc' } },
      { createdAt: 'asc' },
    ];

    // 1º: provedores conhecidos (não autoforce e não desconhecido)
    const conhecidos = await prisma.store.findMany({
      where: {
        ...baseWhere,
        website: {
          provider: {
            slug: { notIn: [AUTOFORCE_PROVIDER_SLUG, 'desconhecido'] },
          },
        },
      },
      select,
      orderBy,
      take: limit,
    });

    if (conhecidos.length >= limit) return conhecidos;

    // 2º: desconhecido (preenche o restante do lote)
    const restante = limit - conhecidos.length;
    const desconhecidos = await prisma.store.findMany({
      where: {
        ...baseWhere,
        website: {
          provider: {
            slug: 'desconhecido',
          },
        },
      },
      select,
      orderBy,
      take: restante,
    });

    // 3º: sem provedor algum (último)
    const semProvedor = conhecidos.length + desconhecidos.length < limit
      ? await prisma.store.findMany({
          where: {
            ...baseWhere,
            website: { providerId: null },
          },
          select,
          orderBy,
          take: limit - conhecidos.length - desconhecidos.length,
        })
      : [];

    return [...conhecidos, ...desconhecidos, ...semProvedor];
  }

  // ── Stats do enriquecimento ────────────────────────────────────────────────
  async getStats() {
    const [total, pending, done, skipped, error, running, semCobertura, comDados] = await Promise.all([
      prisma.store.count({ where: { websiteId: { not: null }, clienteAutoforce: false } }),
      prisma.store.count({ where: { OR: [{ enrichmentStatus: 'pending' }, { enrichmentStatus: null }], websiteId: { not: null }, clienteAutoforce: false } }),
      prisma.store.count({ where: { enrichmentStatus: 'done' } }),
      prisma.store.count({ where: { enrichmentStatus: 'skipped' } }),
      prisma.store.count({ where: { enrichmentStatus: 'error' } }),
      prisma.store.count({ where: { enrichmentStatus: 'running' } }),
      // Passou pelo enriquecimento mas Apollo/Hunter não tinham dados
      prisma.store.count({ where: { enrichmentStatus: 'done', enrichmentError: 'sem_cobertura' } }),
      // Passou e conseguiu dados reais
      prisma.store.count({ where: { enrichmentStatus: 'done', OR: [{ enrichmentError: null }, { enrichmentError: { not: 'sem_cobertura' } }] } }),
    ]);

    // Conta as que são Autoforce (provedor) — não devem ser enriquecidas
    const autoforce = await prisma.store.count({
      where: {
        websiteId: { not: null },
        website: { provider: { slug: AUTOFORCE_PROVIDER_SLUG } },
      },
    });

    return { total, pending, done, skipped, error, running, autoforce, semCobertura, comDados };
  }
}

export const storeEnrichmentService = new StoreEnrichmentService();

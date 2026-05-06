import axios from 'axios';
import prisma from '../../utils/prisma';
import { pipedriveService } from './pipedrive.service';
import { websiteSearchService } from './website-search.service';
import { websiteContactScraperService } from './website-contact-scraper.service';
import { normalizeCompanyName } from '../../modules/amostra-leads/amostra-leads.service';

const APOLLO_API_KEY = process.env.APOLLO_API_KEY ?? null;
const APOLLO_BASE = 'https://api.apollo.io/api/v1';

const HUNTER_API_KEY = process.env.HUNTER_API_KEY ?? null;
const HUNTER_BASE = 'https://api.hunter.io/v2';

const DECISION_MAKER_SENIORITIES = ['owner', 'founder', 'c_suite', 'partner', 'vp', 'director', 'manager'];

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function extractDomain(url: string): string | null {
  try {
    const u = url.startsWith('http') ? url : `https://${url}`;
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export interface PipelineResult {
  leadId: string;
  empresa: string;
  steps: {
    pipedrive: 'done' | 'skipped' | 'error' | 'not_configured';
    serpapi: 'done' | 'skipped' | 'not_found' | 'error';
    scrape: 'done' | 'skipped' | 'not_found' | 'error';
    apollo_org: 'done' | 'skipped' | 'not_found' | 'error';
    apollo_people: 'done' | 'skipped' | 'not_found' | 'error';
    hunter: 'done' | 'skipped' | 'not_found' | 'error';
  };
  isCliente: boolean;
}

export class EnrichmentPipelineService {

  async enrichLead(leadId: string): Promise<PipelineResult> {
    const lead = await prisma.amostraLead.findUniqueOrThrow({
      where: { id: leadId },
      include: { pessoas: true },
    });

    const result: PipelineResult = {
      leadId,
      empresa: lead.empresa,
      steps: {
        pipedrive: 'skipped',
        serpapi: 'skipped',
        scrape: 'skipped',
        apollo_org: 'skipped',
        apollo_people: 'skipped',
        hunter: 'skipped',
      },
      isCliente: lead.isClienteAutoforce,
    };

    await prisma.amostraLead.update({
      where: { id: leadId },
      data: { statusPipeline: 'running' },
    });

    try {
      // ─── PASSO 0: Pipedrive ───────────────────────────────────────────────
      if (lead.statusPipedrive === 'pending') {
        result.steps.pipedrive = await this.stepPipedrive(leadId, lead.empresa);

        // Se for cliente ativo, não gasta cota enriquecendo
        const updated = await prisma.amostraLead.findUniqueOrThrow({ where: { id: leadId } });
        if (updated.isClienteAutoforce) {
          await prisma.amostraLead.update({
            where: { id: leadId },
            data: { statusPipeline: 'done' },
          });
          result.isCliente = true;
          return result;
        }
      }

      // ─── PASSO 1: Resolver domínio (SerpAPI → Apify) ─────────────────────
      const currentLead = await prisma.amostraLead.findUniqueOrThrow({ where: { id: leadId } });
      const jaTemSite = !!(currentLead.site || currentLead.siteEncontrado);

      if (!jaTemSite && currentLead.statusSerpapi === 'pending') {
        result.steps.serpapi = await this.stepFindSite(leadId, lead.empresa, currentLead.cidadeApollo ?? null);
      } else if (jaTemSite) {
        result.steps.serpapi = 'skipped';
      }

      // ─── PASSO 2: Scrape do site ──────────────────────────────────────────
      const leadAfterSite = await prisma.amostraLead.findUniqueOrThrow({ where: { id: leadId } });
      const siteParaScrape = leadAfterSite.siteEncontrado ?? leadAfterSite.site;

      if (siteParaScrape && leadAfterSite.statusScrape === 'pending') {
        result.steps.scrape = await this.stepScrape(leadId, siteParaScrape);
      }

      // ─── PASSO 3: Apollo Organização ──────────────────────────────────────
      if (APOLLO_API_KEY) {
        const leadBeforeApollo = await prisma.amostraLead.findUniqueOrThrow({ where: { id: leadId } });
        const domainParaApollo = extractDomain(leadBeforeApollo.siteEncontrado ?? leadBeforeApollo.site ?? '');

        if (!leadBeforeApollo.apolloOrgId && leadBeforeApollo.statusApollo === 'pending') {
          result.steps.apollo_org = await this.stepApolloOrg(leadId, lead.empresa, domainParaApollo);
        }

        // ─── PASSO 4: Apollo Pessoas ────────────────────────────────────────
        const leadBeforePeople = await prisma.amostraLead.findUniqueOrThrow({
          where: { id: leadId },
          include: { pessoas: true },
        });
        const jaTemPessoas = leadBeforePeople.pessoas.length > 0;

        if (!jaTemPessoas) {
          const domainParaPeople = extractDomain(leadBeforePeople.siteEncontrado ?? leadBeforePeople.site ?? '');
          result.steps.apollo_people = await this.stepApolloPeople(
            leadId,
            lead.empresa,
            leadBeforePeople.apolloOrgId ?? null,
            domainParaPeople,
          );
        }
      }

      // ─── PASSO 5: Hunter (preenche email se ainda não tem) ────────────────
      if (HUNTER_API_KEY) {
        const leadBeforeHunter = await prisma.amostraLead.findUniqueOrThrow({
          where: { id: leadId },
          include: { pessoas: true },
        });
        const jaTemEmail = leadBeforeHunter.pessoas.some(p => p.email) || !!leadBeforeHunter.emailDecisor;
        const domainParaHunter = extractDomain(
          leadBeforeHunter.siteEncontrado ?? leadBeforeHunter.site ?? leadBeforeHunter.email?.split('@')[1] ?? '',
        );

        if (!jaTemEmail && leadBeforeHunter.statusHunter === 'pending' && domainParaHunter) {
          const decisorNome = leadBeforeHunter.pessoas[0]?.nome ?? leadBeforeHunter.nome ?? null;
          result.steps.hunter = await this.stepHunter(leadId, domainParaHunter, decisorNome);
        }
      }

      await prisma.amostraLead.update({
        where: { id: leadId },
        data: { statusPipeline: 'done' },
      });
    } catch (err: any) {
      await prisma.amostraLead.update({
        where: { id: leadId },
        data: { statusPipeline: 'error' },
      });
      throw err;
    }

    return result;
  }

  // ─── STEP 0: Pipedrive ─────────────────────────────────────────────────────
  private async stepPipedrive(leadId: string, empresa: string): Promise<PipelineResult['steps']['pipedrive']> {
    if (!pipedriveService.isConfigured()) {
      await prisma.amostraLead.update({
        where: { id: leadId },
        data: { statusPipedrive: 'skipped' },
      });
      return 'not_configured';
    }

    await prisma.amostraLead.update({ where: { id: leadId }, data: { statusPipedrive: 'running' } });

    try {
      const orgResult = await pipedriveService.searchOrganization(empresa);
      const leadStatus = pipedriveService.determineLeadStatus(orgResult);

      await prisma.amostraLead.update({
        where: { id: leadId },
        data: {
          statusPipedrive: 'done',
          pipedriveOrgId: orgResult.orgId,
          pipedriveDealId: leadStatus.dealId,
          pipedriveDealStage: leadStatus.dealStage,
          pipedriveResponsavel: leadStatus.responsavel,
          isClienteAutoforce: leadStatus.isCliente,
          erroPipedrive: null,
        },
      });

      // Aproveita pessoas do Pipedrive se não tivermos nenhuma ainda
      if (orgResult.persons.length > 0) {
        const existingPessoas = await prisma.amostraLeadPessoa.count({ where: { leadId } });
        if (existingPessoas === 0) {
          for (const p of orgResult.persons.slice(0, 3)) {
            await prisma.amostraLeadPessoa.create({
              data: {
                leadId,
                nome: p.name,
                email: p.email,
                telefone: p.phone,
                cargo: p.jobTitle,
                isPrincipal: false,
              },
            });
          }
        }
      }

      return 'done';
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? err?.message ?? 'Erro desconhecido';
      await prisma.amostraLead.update({
        where: { id: leadId },
        data: { statusPipedrive: 'error', erroPipedrive: msg },
      });
      return 'error';
    }
  }

  // ─── STEP 1: Encontrar site ────────────────────────────────────────────────
  private async stepFindSite(leadId: string, empresa: string, cidade: string | null): Promise<PipelineResult['steps']['serpapi']> {
    await prisma.amostraLead.update({ where: { id: leadId }, data: { statusSerpapi: 'running' } });

    try {
      const url = await websiteSearchService.search(empresa, cidade);

      if (!url) {
        await prisma.amostraLead.update({
          where: { id: leadId },
          data: { statusSerpapi: 'not_found', erroSerpapi: 'Nenhum site encontrado' },
        });
        return 'not_found';
      }

      const normalizedUrl = url.startsWith('http') ? url : `https://${url}`;
      await prisma.amostraLead.update({
        where: { id: leadId },
        data: { statusSerpapi: 'done', siteEncontrado: normalizedUrl, erroSerpapi: null },
      });
      return 'done';
    } catch (err: any) {
      const msg = err?.message ?? 'Erro desconhecido';
      await prisma.amostraLead.update({
        where: { id: leadId },
        data: { statusSerpapi: 'error', erroSerpapi: msg },
      });
      return 'error';
    }
  }

  // ─── STEP 2: Scrape do site ────────────────────────────────────────────────
  private async stepScrape(leadId: string, siteUrl: string): Promise<PipelineResult['steps']['scrape']> {
    await prisma.amostraLead.update({ where: { id: leadId }, data: { statusScrape: 'running' } });

    try {
      const contacts = await websiteContactScraperService.scrape(siteUrl);

      await prisma.amostraLead.update({
        where: { id: leadId },
        data: {
          statusScrape: 'done',
          erroScrape: null,
          cnpjSite: contacts.cnpj,
          emailSite: contacts.email,
          whatsappSite: contacts.whatsapp,
          instagramSite: contacts.instagram,
          facebookSite: contacts.facebook,
          linkedinSite: contacts.linkedin,
          // espelha nos campos legados para compatibilidade com código existente
          whatsappApify: contacts.whatsapp,
          instagramApify: contacts.instagram,
          facebookApify: contacts.facebook,
          emailEmpresaApify: contacts.email,
        },
      });
      return 'done';
    } catch (err: any) {
      const msg = err?.message ?? 'Erro desconhecido';
      await prisma.amostraLead.update({
        where: { id: leadId },
        data: { statusScrape: 'error', erroScrape: msg },
      });
      return 'error';
    }
  }

  // ─── STEP 3: Apollo — Organização ─────────────────────────────────────────
  private async stepApolloOrg(leadId: string, empresa: string, domain: string | null): Promise<PipelineResult['steps']['apollo_org']> {
    await prisma.amostraLead.update({ where: { id: leadId }, data: { statusApollo: 'running' } });

    try {
      let org: any = null;

      // Tentativa 1: enrich por domínio
      if (domain) {
        try {
          const resp = await axios.get(`${APOLLO_BASE}/organizations/enrich`, {
            params: { domain },
            headers: { 'X-Api-Key': APOLLO_API_KEY },
            timeout: 15000,
          });
          org = resp.data?.organization ?? null;
        } catch (err: any) {
          if (err?.response?.status !== 404) throw err;
        }
        await sleep(500);
      }

      // Tentativa 2 (fallback): search por nome normalizado
      if (!org) {
        const normalizedName = normalizeCompanyName(empresa);
        try {
          const resp = await axios.post(
            `${APOLLO_BASE}/mixed_companies/search`,
            { q_organization_name: normalizedName, per_page: 1, page: 1 },
            { headers: { 'X-Api-Key': APOLLO_API_KEY, 'Content-Type': 'application/json' }, timeout: 15000 },
          );
          org = resp.data?.organizations?.[0] ?? null;
        } catch { /* segue sem org */ }
        await sleep(500);
      }

      if (!org) {
        await prisma.amostraLead.update({
          where: { id: leadId },
          data: { statusApollo: 'not_found', erroApollo: 'Empresa não encontrada no Apollo' },
        });
        return 'not_found';
      }

      const techs: string[] = (org.technology_names ?? []).slice(0, 20);

      await prisma.amostraLead.update({
        where: { id: leadId },
        data: {
          statusApollo: 'done',
          erroApollo: null,
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
          departamentosApollo: org.departmental_head_count ? JSON.stringify(org.departmental_head_count) : null,
        },
      });
      return 'done';
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? err?.message ?? 'Erro desconhecido';
      await prisma.amostraLead.update({
        where: { id: leadId },
        data: { statusApollo: 'error', erroApollo: msg },
      });
      return 'error';
    }
  }

  // ─── STEP 4: Apollo — Pessoas ──────────────────────────────────────────────
  private async stepApolloPeople(
    leadId: string,
    empresa: string,
    orgId: string | null,
    domain: string | null,
  ): Promise<PipelineResult['steps']['apollo_people']> {
    let people: any[] = [];

    // Tentativa 1: organization_top_people pelo orgId
    if (orgId) {
      try {
        const resp = await axios.get(`${APOLLO_BASE}/mixed_people/organization_top_people`, {
          params: { organization_id: orgId, page: 1, per_page: 10 },
          headers: { 'X-Api-Key': APOLLO_API_KEY },
          timeout: 15000,
        });
        people = resp.data?.people ?? [];
      } catch { /* tenta próximo */ }
      await sleep(500);
    }

    // Tentativa 2: mixed_people/search por nome normalizado
    if (people.length === 0) {
      try {
        const normalizedName = normalizeCompanyName(empresa);
        const resp = await axios.post(
          `${APOLLO_BASE}/mixed_people/search`,
          {
            q_organization_name: normalizedName,
            person_seniorities: DECISION_MAKER_SENIORITIES,
            per_page: 10,
            page: 1,
          },
          { headers: { 'X-Api-Key': APOLLO_API_KEY, 'Content-Type': 'application/json' }, timeout: 15000 },
        );
        people = resp.data?.people ?? [];
      } catch { /* tenta próximo */ }
      await sleep(500);
    }

    // Tentativa 3: people/match por domínio
    if (people.length === 0 && domain) {
      try {
        const resp = await axios.post(
          `${APOLLO_BASE}/people/match`,
          { domain, organization_name: empresa },
          { headers: { 'X-Api-Key': APOLLO_API_KEY, 'Content-Type': 'application/json' }, timeout: 15000 },
        );
        const p = resp.data?.person;
        if (p) people = [p];
      } catch { /* sem resultado */ }
    }

    if (people.length === 0) return 'not_found';

    // Filtra por seniority se possível
    const decisores = people.filter(p =>
      DECISION_MAKER_SENIORITIES.includes((p.seniority ?? '').toLowerCase()),
    );
    const finalPeople = decisores.length > 0 ? decisores : people;

    for (const p of finalPeople.slice(0, 5)) {
      const jaExiste = await prisma.amostraLeadPessoa.findFirst({
        where: { leadId, apolloPessoaId: p.id },
      });
      if (jaExiste) continue;

      await prisma.amostraLeadPessoa.create({
        data: {
          leadId,
          nome: p.name ?? p.first_name ?? 'Desconhecido',
          cargo: p.title ?? null,
          linkedin: p.linkedin_url ?? null,
          email: p.email && p.email_status === 'verified' ? p.email : null,
          telefone: p.phone_numbers?.[0]?.sanitized_number ?? null,
          isPrincipal: false,
          apolloPessoaId: p.id ?? null,
          apolloHasEmail: !!(p.email),
          apolloHasPhone: !!(p.phone_numbers?.length),
        },
      });
    }

    return 'done';
  }

  // ─── STEP 5: Hunter ────────────────────────────────────────────────────────
  private async stepHunter(leadId: string, domain: string, nomePessoa: string | null): Promise<PipelineResult['steps']['hunter']> {
    await prisma.amostraLead.update({ where: { id: leadId }, data: { statusHunter: 'running' } });

    try {
      let emailHunter: string | null = null;
      let emailHunterScore: number | null = null;
      let cargoHunter: string | null = null;
      let nomeHunter: string | null = null;

      // Tentativa 1: email-finder por nome (se tiver nome)
      if (nomePessoa) {
        const parts = nomePessoa.trim().split(/\s+/);
        try {
          const resp = await axios.get(`${HUNTER_BASE}/email-finder`, {
            params: {
              domain,
              first_name: parts[0],
              last_name: parts.slice(1).join(' ') || undefined,
              api_key: HUNTER_API_KEY,
            },
            timeout: 10000,
          });
          const finder = resp.data?.data;
          if (finder?.email && (finder.score ?? 0) >= 50) {
            emailHunter = finder.email;
            emailHunterScore = finder.score;
          }
        } catch { /* tenta domain-search */ }
        await sleep(500);
      }

      // Tentativa 2: domain-search (pega melhor email pelo cargo)
      if (!emailHunter) {
        const resp = await axios.get(`${HUNTER_BASE}/domain-search`, {
          params: { domain, api_key: HUNTER_API_KEY, limit: 10 },
          timeout: 10000,
        });
        const emails: any[] = resp.data?.data?.emails ?? [];

        if (emails.length > 0) {
          const decisionKeywords = ['diretor', 'director', 'ceo', 'coo', 'cto', 'gerente', 'manager', 'presidente', 'owner', 'founder', 'socio'];
          const sorted = [...emails].sort((a, b) => {
            const aIsDecision = decisionKeywords.some(k => (a.position ?? '').toLowerCase().includes(k)) ? 1 : 0;
            const bIsDecision = decisionKeywords.some(k => (b.position ?? '').toLowerCase().includes(k)) ? 1 : 0;
            return bIsDecision !== aIsDecision ? bIsDecision - aIsDecision : (b.confidence ?? 0) - (a.confidence ?? 0);
          });
          const best = sorted[0];
          emailHunter = best.value ?? null;
          emailHunterScore = best.confidence ?? null;
          cargoHunter = best.position ?? null;
          nomeHunter = [best.first_name, best.last_name].filter(Boolean).join(' ') || null;
        }
      }

      if (!emailHunter) {
        await prisma.amostraLead.update({
          where: { id: leadId },
          data: { statusHunter: 'not_found', erroHunter: `Nenhum email encontrado (${domain})` },
        });
        return 'not_found';
      }

      const current = await prisma.amostraLead.findUniqueOrThrow({ where: { id: leadId } });
      await prisma.amostraLead.update({
        where: { id: leadId },
        data: {
          statusHunter: 'done',
          erroHunter: null,
          emailHunter,
          emailHunterScore,
          emailDecisor: current.emailDecisor ?? emailHunter,
          cargoDecisor: current.cargoDecisor ?? cargoHunter,
          nome: current.nome ?? nomeHunter,
        },
      });

      // Cria pessoa se ainda não existe nenhuma com email
      const pessoasComEmail = await prisma.amostraLeadPessoa.count({ where: { leadId, email: { not: null } } });
      if (pessoasComEmail === 0 && nomeHunter) {
        await prisma.amostraLeadPessoa.create({
          data: {
            leadId,
            nome: nomeHunter,
            email: emailHunter,
            cargo: cargoHunter,
            isPrincipal: true,
          },
        });
      }

      return 'done';
    } catch (err: any) {
      const msg = err?.response?.data?.errors?.[0]?.details ?? err?.message ?? 'Erro desconhecido';
      await prisma.amostraLead.update({
        where: { id: leadId },
        data: { statusHunter: 'error', erroHunter: msg },
      });
      return 'error';
    }
  }

  // ─── Resetar pipeline de um lead para rodar novamente ─────────────────────
  async resetLeadPipeline(leadId: string) {
    await prisma.amostraLead.update({
      where: { id: leadId },
      data: {
        statusPipeline: 'pending',
        statusPipedrive: 'pending',
        statusSerpapi: 'pending',
        statusScrape: 'pending',
        statusApollo: 'pending',
        statusHunter: 'pending',
      },
    });
  }
}

export const enrichmentPipelineService = new EnrichmentPipelineService();

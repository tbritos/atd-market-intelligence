import axios from 'axios';
import prisma from '../../utils/prisma';

const APOLLO_API_KEY = process.env.APOLLO_API_KEY ?? null;
const APOLLO_BASE = 'https://api.apollo.io/api/v1';
const HUNTER_API_KEY = process.env.HUNTER_API_KEY ?? null;
const HUNTER_BASE = 'https://api.hunter.io/v2';

const DECISION_MAKER_SENIORITIES = ['owner', 'founder', 'c_suite', 'partner', 'vp', 'director', 'manager'];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeCompanyName(name: string): string {
  const BRAND_SUFFIXES = [
    'toyota', 'ford', 'volkswagen', 'vw', 'honda', 'chevrolet', 'gm', 'hyundai',
    'fiat', 'renault', 'peugeot', 'citroen', 'mitsubishi', 'nissan', 'kia',
    'jeep', 'dodge', 'ram', 'chrysler', 'bmw', 'mercedes', 'mercedes-benz',
    'audi', 'volvo', 'land rover', 'jaguar', 'porsche', 'subaru', 'suzuki',
  ];

  const GENERIC_WORDS = [
    'concessionaria', 'concessionária', 'automoveis', 'automóveis', 'veiculos',
    'veículos', 'motors', 'motor', 'auto', 'autos', 'cars', 'car',
  ];

  let result = name.trim();

  for (const brand of BRAND_SUFFIXES) {
    const re = new RegExp(`\\b${brand.replace('-', '\\-')}\\b`, 'gi');
    result = result.replace(re, ' ').trim();
  }

  result = result.replace(/\s{2,}/g, ' ').replace(/^[-/\s]+|[-/\s]+$/g, '').trim();

  const words = result.split(/\s+/);
  if (words.length > 1) {
    const filtered = words.filter((word) => !GENERIC_WORDS.includes(word.toLowerCase()));
    if (filtered.length > 0) result = filtered.join(' ');
  }

  return result || name.trim();
}

type JsonList = string[] | null;

function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  }
  return [];
}

function extractPhone(org: any): string | null {
  return org?.phone ?? org?.primary_phone?.number ?? null;
}

function extractEmployeeCount(org: any): number | null {
  const value = org?.estimated_num_employees;
  if (typeof value === 'number') return value;
  return null;
}

function hasUsefulPersonData(person: any) {
  return Boolean(
    person?.name ||
    person?.first_name ||
    person?.last_name ||
    person?.title ||
    person?.email ||
    person?.linkedin_url ||
    person?.phone_numbers?.length,
  );
}

export class DealerGroupEnrichmentService {
  isApolloConfigured() {
    return Boolean(APOLLO_API_KEY);
  }

  isHunterConfigured() {
    return Boolean(HUNTER_API_KEY);
  }

  async enrichApolloBatch(params: { brandSlug: string; limit?: number }) {
    if (!this.isApolloConfigured()) {
      throw new Error('APOLLO_API_KEY not configured');
    }

    const { brandSlug, limit = 5 } = params;

    const groups = await prisma.dealerGroup.findMany({
      where: {
        brand: { slug: brandSlug },
        queue: 'APOLLO_READY',
        apolloStatus: { in: ['PENDING', 'FAILED'] },
      },
      orderBy: [
        { priorityScore: 'desc' },
        { storeCount: 'desc' },
        { updatedAt: 'asc' },
      ],
      take: limit,
    });

    const results = [];
    for (const group of groups) {
      results.push(await this.enrichApolloGroup(group.id));
      await sleep(700);
    }

    return results;
  }

  async enrichApolloGroup(dealerGroupId: string) {
    const group = await prisma.dealerGroup.findUniqueOrThrow({
      where: { id: dealerGroupId },
      include: {
        brand: { select: { id: true, name: true, slug: true } },
        stores: {
          select: {
            id: true,
            name: true,
            city: { select: { name: true } },
            state: { select: { code: true } },
          },
        },
      },
    });

    const run = await prisma.dealerGroupRun.create({
      data: {
        dealerGroupId,
        source: 'APOLLO',
        status: 'RUNNING',
        requestPayload: {
          domain: group.apolloDomain ?? group.domain,
          orgQueryTerms: group.apolloOrgQueryTerms,
          peopleQueryTerms: group.apolloPeopleQueryTerms,
        },
      },
    });

    await prisma.dealerGroup.update({
      where: { id: dealerGroupId },
      data: {
        apolloStatus: 'RUNNING',
        lastApolloCheckAt: new Date(),
        lastErrorSource: null,
        lastErrorMessage: null,
      },
    });

    try {
      const orgResult = await this.findOrganization(group);
      const people = await this.findPeople(group, orgResult?.id ?? null, orgResult?.name ?? null);

      await prisma.dealerGroup.update({
        where: { id: dealerGroupId },
        data: {
          apolloStatus: orgResult || people.length > 0 ? 'COMPLETED' : 'SKIPPED',
          apolloOrgId: orgResult?.id ?? null,
          apolloOrgName: orgResult?.name ?? null,
          apolloDomain: group.apolloDomain ?? group.domain,
          apolloPhone: orgResult ? extractPhone(orgResult) : null,
          apolloLinkedinUrl: orgResult?.linkedin_url ?? null,
          apolloCity: orgResult?.city ?? null,
          apolloState: orgResult?.state ?? null,
          apolloEmployeeCount: orgResult ? extractEmployeeCount(orgResult) : null,
          apolloKeywords: orgResult?.keywords?.length ? orgResult.keywords.slice(0, 30) : null,
          apolloTechnologies: orgResult?.technology_names?.length ? orgResult.technology_names.slice(0, 20) : null,
          readyForSdr: people.some((person) => Boolean(person.email || person.phone_numbers?.length)),
          lastApolloCheckAt: new Date(),
        },
      });

      await prisma.dealerGroupContact.deleteMany({
        where: {
          dealerGroupId,
          source: 'APOLLO',
        },
      });

      if (people.length > 0) {
        await prisma.dealerGroupContact.createMany({
          data: people.slice(0, 10).map((person: any, index: number) => ({
            dealerGroupId,
            source: 'APOLLO',
            externalId: person.id ?? `${group.domain}-${index}`,
            fullName: person.name ?? [person.first_name, person.last_name].filter(Boolean).join(' ') || null,
            firstName: person.first_name ?? null,
            lastName: person.last_name ?? null,
            title: person.title ?? null,
            seniority: person.seniority ?? null,
            department: person.departments?.[0] ?? null,
            email: person.email ?? null,
            emailStatus: person.email_status ?? null,
            phone: person.phone_numbers?.[0]?.sanitized_number ?? null,
            linkedinUrl: person.linkedin_url ?? null,
            city: person.city ?? null,
            state: person.state ?? null,
            isDecisionMaker: DECISION_MAKER_SENIORITIES.includes((person.seniority ?? '').toLowerCase()),
            isPrimary: index === 0,
            rawPayload: person,
          })),
          skipDuplicates: true,
        });
      }

      await prisma.dealerGroupRun.update({
        where: { id: run.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          responsePayload: {
            organization: orgResult,
            peopleCount: people.length,
            people: people.slice(0, 10),
          },
        },
      });

      return {
        dealerGroupId,
        domain: group.domain,
        orgName: orgResult?.name ?? null,
        peopleCount: people.length,
        readyForSdr: people.some((person) => Boolean(person.email || person.phone_numbers?.length)),
      };
    } catch (error: any) {
      const message = error?.response?.data?.error ?? error?.message ?? 'Apollo enrichment failed';

      await prisma.dealerGroup.update({
        where: { id: dealerGroupId },
        data: {
          apolloStatus: 'FAILED',
          lastApolloCheckAt: new Date(),
          lastErrorSource: 'APOLLO',
          lastErrorMessage: message,
        },
      });

      await prisma.dealerGroupRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          errorMessage: message,
        },
      });

      return {
        dealerGroupId,
        domain: group.domain,
        error: message,
      };
    }
  }

  async enrichHunterGroup(dealerGroupId: string) {
    if (!this.isHunterConfigured()) {
      throw new Error('HUNTER_API_KEY not configured');
    }

    const group = await prisma.dealerGroup.findUniqueOrThrow({
      where: { id: dealerGroupId },
    });

    const domain = group.hunterDomain ?? group.apolloDomain ?? group.domain;

    const run = await prisma.dealerGroupRun.create({
      data: {
        dealerGroupId,
        source: 'HUNTER',
        status: 'RUNNING',
        requestPayload: {
          domain,
          candidates: group.hunterFinderCandidates,
        },
      },
    });

    await prisma.dealerGroup.update({
      where: { id: dealerGroupId },
      data: {
        hunterStatus: 'RUNNING',
        lastHunterCheckAt: new Date(),
        lastErrorSource: null,
        lastErrorMessage: null,
      },
    });

    try {
      const response = await axios.get(`${HUNTER_BASE}/domain-search`, {
        params: { domain, api_key: HUNTER_API_KEY, limit: 10 },
        timeout: 20000,
      });

      const data = response.data?.data;
      const emails = (data?.emails ?? []).filter((item: any) =>
        Boolean(item.value || item.first_name || item.last_name || item.position),
      );

      await prisma.dealerGroupContact.deleteMany({
        where: {
          dealerGroupId,
          source: 'HUNTER',
        },
      });

      if (emails.length > 0) {
        await prisma.dealerGroupContact.createMany({
          data: emails.slice(0, 10).map((item: any, index: number) => ({
            dealerGroupId,
            source: 'HUNTER',
            externalId: item.value ?? `${domain}-${index}`,
            fullName: [item.first_name, item.last_name].filter(Boolean).join(' ') || null,
            firstName: item.first_name ?? null,
            lastName: item.last_name ?? null,
            title: item.position ?? null,
            email: item.value ?? null,
            emailStatus: item.verification?.status ?? null,
            emailConfidence: item.confidence ?? null,
            phone: null,
            linkedinUrl: item.linkedin ?? null,
            isDecisionMaker: Boolean(item.position),
            isPrimary: index === 0,
            rawPayload: item,
          })),
          skipDuplicates: true,
        });
      }

      await prisma.dealerGroup.update({
        where: { id: dealerGroupId },
        data: {
          hunterStatus: emails.length > 0 ? 'COMPLETED' : 'SKIPPED',
          hunterDomain: domain,
          hunterEmailPattern: data?.pattern ?? null,
          lastHunterCheckAt: new Date(),
          readyForSdr: emails.length > 0 || group.readyForSdr,
        },
      });

      await prisma.dealerGroupRun.update({
        where: { id: run.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          responsePayload: {
            pattern: data?.pattern ?? null,
            emails,
          },
        },
      });

      return {
        dealerGroupId,
        domain,
        emails: emails.length,
        pattern: data?.pattern ?? null,
      };
    } catch (error: any) {
      const message = error?.response?.data?.errors?.[0]?.details ?? error?.message ?? 'Hunter enrichment failed';

      await prisma.dealerGroup.update({
        where: { id: dealerGroupId },
        data: {
          hunterStatus: 'FAILED',
          lastHunterCheckAt: new Date(),
          lastErrorSource: 'HUNTER',
          lastErrorMessage: message,
        },
      });

      await prisma.dealerGroupRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          errorMessage: message,
        },
      });

      return {
        dealerGroupId,
        domain,
        error: message,
      };
    }
  }

  private async findOrganization(group: {
    domain: string;
    apolloDomain: string | null;
    apolloOrgQueryTerms: JsonList;
    stores: { name: string }[];
  }) {
    const domain = group.apolloDomain ?? group.domain;

    if (domain) {
      try {
        const response = await axios.get(`${APOLLO_BASE}/organizations/enrich`, {
          params: { domain },
          headers: { 'X-Api-Key': APOLLO_API_KEY },
          timeout: 20000,
        });
        const organization = response.data?.organization ?? null;
        if (organization) return organization;
      } catch (error: any) {
        if (error?.response?.status !== 404) throw error;
      }
      await sleep(500);
    }

    const queryTerms = [
      ...asStringList(group.apolloOrgQueryTerms),
      ...group.stores.map((store) => normalizeCompanyName(store.name)),
    ].filter(Boolean);

    for (const term of queryTerms.slice(0, 5)) {
      try {
        const response = await axios.post(
          `${APOLLO_BASE}/mixed_companies/search`,
          {
            q_organization_name: term,
            per_page: 3,
            page: 1,
          },
          {
            headers: { 'X-Api-Key': APOLLO_API_KEY, 'Content-Type': 'application/json' },
            timeout: 20000,
          },
        );

        const organizations = response.data?.organizations ?? [];
        const exactDomain = organizations.find((org: any) => org.primary_domain === domain);
        if (exactDomain) return exactDomain;
        if (organizations[0]) return organizations[0];
      } catch {
        // Try next term
      }
      await sleep(500);
    }

    return null;
  }

  private async findPeople(
    group: {
      apolloDomain: string | null;
      domain: string;
      apolloPeopleQueryTerms: JsonList;
      stores: { name: string; city: { name: string } | null; state: { code: string } | null }[];
    },
    orgId: string | null,
    orgName: string | null,
  ) {
    const people: any[] = [];

    if (orgId) {
      try {
        const response = await axios.get(`${APOLLO_BASE}/mixed_people/organization_top_people`, {
          params: { organization_id: orgId, page: 1, per_page: 10 },
          headers: { 'X-Api-Key': APOLLO_API_KEY },
          timeout: 20000,
        });

        const items = this.prioritizePeople(response.data?.people ?? []);
        if (items.length > 0) return items;
      } catch {
        // fallback below
      }
      await sleep(500);
    }

    const queryTerms = [
      ...asStringList(group.apolloPeopleQueryTerms),
      ...(orgName ? [orgName] : []),
      ...group.stores.map((store) => normalizeCompanyName(store.name)),
    ].filter(Boolean);

    for (const term of queryTerms.slice(0, 5)) {
      try {
        const response = await axios.post(
          `${APOLLO_BASE}/mixed_people/search`,
          {
            q_organization_name: term,
            person_seniorities: DECISION_MAKER_SENIORITIES,
            per_page: 10,
            page: 1,
          },
          {
            headers: { 'X-Api-Key': APOLLO_API_KEY, 'Content-Type': 'application/json' },
            timeout: 20000,
          },
        );

        const items = response.data?.people ?? [];
        if (items.length > 0) {
          people.push(...items);
          break;
        }
      } catch {
        // try next
      }
      await sleep(500);
    }

    if (people.length === 0 && (group.apolloDomain ?? group.domain)) {
      try {
        const response = await axios.post(
          `${APOLLO_BASE}/people/match`,
          {
            domain: group.apolloDomain ?? group.domain,
            organization_name: orgName ?? normalizeCompanyName(group.stores[0]?.name ?? group.domain),
          },
          {
            headers: { 'X-Api-Key': APOLLO_API_KEY, 'Content-Type': 'application/json' },
            timeout: 20000,
          },
        );
        const person = response.data?.person;
        if (person) people.push(person);
      } catch {
        // no fallback
      }
    }

    return this.prioritizePeople(people);
  }

  private prioritizePeople(people: any[]) {
    const unique = new Map<string, any>();
    for (const person of people) {
      if (!hasUsefulPersonData(person)) continue;
      const key = person.id ?? `${person.name}-${person.email ?? ''}`;
      if (!unique.has(key)) unique.set(key, person);
    }

    const items = [...unique.values()];
    const prioritized = items.filter((person) =>
      DECISION_MAKER_SENIORITIES.includes((person.seniority ?? '').toLowerCase()),
    );

    return (prioritized.length > 0 ? prioritized : items).sort((a, b) => {
      const aScore = (a.email ? 10 : 0) + (a.phone_numbers?.length ? 5 : 0);
      const bScore = (b.email ? 10 : 0) + (b.phone_numbers?.length ? 5 : 0);
      return bScore - aScore;
    });
  }
}

export const dealerGroupEnrichmentService = new DealerGroupEnrichmentService();

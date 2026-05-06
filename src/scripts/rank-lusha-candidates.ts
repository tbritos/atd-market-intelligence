import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type Candidate = {
  domain: string;
  groupName: string;
  storeName: string;
  brand: string;
  state: string;
  region: string;
  storesInGroup: number;
  nome: string;
  cargo: string;
  email: string | null;
  linkedin: string | null;
  source: string | null;
  apolloHasPhone: boolean;
  seniorityScore: number;
  dataScore: number;
  groupScore: number;
  totalScore: number;
  reasons: string[];
};

type GroupContext = {
  domain: string;
  site: string;
  stores: Set<string>;
  brands: Set<string>;
  states: Set<string>;
  regions: Set<string>;
  contacts: Candidate[];
};

const PRIMARY_TARGET = 30;
const BACKUP_TARGET = 8;
const MAX_PER_GROUP = 2;

const TITLE_RULES: Array<{ score: number; patterns: RegExp[]; label: string }> = [
  {
    score: 28,
    label: 'cargo C-level/fundador',
    patterns: [
      /\bceo\b/i,
      /\bcfo\b/i,
      /\bcoo\b/i,
      /\bcto\b/i,
      /\bcmo\b/i,
      /\bfounder\b/i,
      /co-?founder/i,
      /\bpresident/i,
      /\bvice president/i,
      /\bvp\b/i,
      /\bowner\b/i,
    ],
  },
  {
    score: 24,
    label: 'cargo de direção',
    patterns: [
      /\bdirector\b/i,
      /\bdiret(or|ora)\b/i,
      /\bhead\b/i,
      /\bgeneral manager\b/i,
      /\bmanaging director\b/i,
    ],
  },
  {
    score: 20,
    label: 'cargo executivo/comercial forte',
    patterns: [
      /\bcommercial manager\b/i,
      /\bbusiness manager\b/i,
      /\bsales manager\b/i,
      /\bmanager\b/i,
      /\bgerente\b/i,
      /\bcoordenador\b/i,
      /\bcoordinator\b/i,
      /\bsupervisor\b/i,
      /\bsuperintendente\b/i,
    ],
  },
  {
    score: 17,
    label: 'sócio/administrador',
    patterns: [
      /s[óo]cio/i,
      /administrator/i,
      /administrador/i,
      /propriet[aá]rio/i,
      /partner/i,
    ],
  },
  {
    score: 11,
    label: 'cargo comercial',
    patterns: [
      /\bsales executive\b/i,
      /\bexecutive\b/i,
      /\bconsult(or|ant)\b/i,
      /\bvendedor/i,
      /\bneg[oó]cios\b/i,
      /\bmarketing\b/i,
    ],
  },
];

function extractDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const normalized = url.startsWith('http') ? url : `https://${url}`;
    return new URL(normalized).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

function normalizeGroupName(storeName: string | undefined, fallback: string): string {
  if (!storeName) return fallback;
  return storeName
    .replace(/:\s*concession[aá]ria.*$/i, '')
    .replace(/\s*[-–]\s*(unidade|loja|filial).*$/i, '')
    .trim() || fallback;
}

function scoreTitle(title: string | null | undefined): { score: number; label: string } {
  const cargo = title?.trim() ?? '';
  if (!cargo) return { score: 0, label: 'sem cargo claro' };
  for (const rule of TITLE_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(cargo))) {
      return { score: rule.score, label: rule.label };
    }
  }
  return { score: 5, label: 'cargo operacional' };
}

function scoreDataQuality(input: {
  email: string | null;
  linkedin: string | null;
  source: string | null;
  apolloHasPhone: boolean;
}): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  if (input.linkedin) {
    score += 12;
    reasons.push('LinkedIn presente');
  }

  if (input.email) {
    score += 10;
    reasons.push('email presente');
  }

  if (input.source?.toLowerCase() === 'apollo') {
    score += 4;
    reasons.push('perfil veio do Apollo');
  }

  if (input.apolloHasPhone) {
    score += 14;
    reasons.push('Apollo sinaliza telefone');
  }

  return { score, reasons };
}

function scoreGroupPotential(group: GroupContext): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const stores = group.stores.size;

  if (stores >= 5) {
    score += 14;
    reasons.push(`grupo com ${stores} lojas`);
  } else if (stores >= 3) {
    score += 10;
    reasons.push(`grupo com ${stores} lojas`);
  } else if (stores >= 2) {
    score += 6;
    reasons.push(`grupo com ${stores} lojas`);
  }

  const seniorContacts = group.contacts.filter((contact) => contact.seniorityScore >= 20).length;
  if (seniorContacts >= 4) {
    score += 8;
    reasons.push('grupo com boa densidade de cargos fortes');
  } else if (seniorContacts >= 2) {
    score += 4;
    reasons.push('grupo com alguns cargos fortes');
  }

  return { score, reasons };
}

function dedupeKey(candidate: {
  email: string | null;
  linkedin: string | null;
  nome: string;
  cargo: string;
}): string {
  return (
    candidate.email?.toLowerCase() ||
    candidate.linkedin?.toLowerCase() ||
    `${candidate.nome.toLowerCase()}|${candidate.cargo.toLowerCase()}`
  );
}

async function main() {
  const stores = await prisma.store.findMany({
    where: { enrichmentStatus: 'done' },
    select: {
      id: true,
      name: true,
      brand: { select: { name: true } },
      state: { select: { code: true, region: true } },
      website: { select: { url: true } },
      partners: {
        select: {
          nome: true,
          qualificacao: true,
          email: true,
          phone: true,
          linkedinUrl: true,
          source: true,
          apolloHasPhone: true,
        },
      },
    },
    take: 500,
  });

  const groups = new Map<string, GroupContext>();

  for (const store of stores) {
    const domain = extractDomain(store.website?.url) ?? `sem-site-${store.id}`;
    if (!groups.has(domain)) {
      groups.set(domain, {
        domain,
        site: store.website?.url ?? '',
        stores: new Set<string>(),
        brands: new Set<string>(),
        states: new Set<string>(),
        regions: new Set<string>(),
        contacts: [],
      });
    }

    const group = groups.get(domain)!;
    group.stores.add(store.name);
    if (store.brand?.name) group.brands.add(store.brand.name);
    if (store.state?.code) group.states.add(store.state.code);
    if (store.state?.region) group.regions.add(store.state.region);

    for (const partner of store.partners ?? []) {
      if (partner.phone) continue;

      const nome = partner.nome?.trim();
      if (!nome) continue;

      const email = partner.email?.trim() || null;
      const linkedin = partner.linkedinUrl?.trim() || null;
      const cargo = partner.qualificacao?.trim() || '';

      if (!email && !linkedin) continue;

      const seniority = scoreTitle(cargo);
      const dataQuality = scoreDataQuality({
        email,
        linkedin,
        source: partner.source,
        apolloHasPhone: !!partner.apolloHasPhone,
      });

      group.contacts.push({
        domain,
        groupName: normalizeGroupName(Array.from(group.stores)[0], domain),
        storeName: store.name,
        brand: store.brand?.name ?? '',
        state: store.state?.code ?? '',
        region: store.state?.region ?? '',
        storesInGroup: 0,
        nome,
        cargo,
        email,
        linkedin,
        source: partner.source,
        apolloHasPhone: !!partner.apolloHasPhone,
        seniorityScore: seniority.score,
        dataScore: dataQuality.score,
        groupScore: 0,
        totalScore: 0,
        reasons: [seniority.label, ...dataQuality.reasons],
      });
    }
  }

  const finalizedCandidates: Candidate[] = [];

  for (const [, group] of groups) {
    const deduped = new Map<string, Candidate>();
    for (const candidate of group.contacts) {
      const key = dedupeKey(candidate);
      const existing = deduped.get(key);
      if (!existing) {
        deduped.set(key, candidate);
        continue;
      }
      const existingRaw = existing.seniorityScore + existing.dataScore;
      const candidateRaw = candidate.seniorityScore + candidate.dataScore;
      if (candidateRaw > existingRaw) deduped.set(key, candidate);
    }

    group.contacts = Array.from(deduped.values());
    const groupPotential = scoreGroupPotential(group);

    for (const candidate of group.contacts) {
      candidate.storesInGroup = group.stores.size;
      candidate.groupScore = groupPotential.score;
      candidate.totalScore = candidate.seniorityScore + candidate.dataScore + candidate.groupScore;
      candidate.reasons = [...candidate.reasons, ...groupPotential.reasons];
      finalizedCandidates.push(candidate);
    }
  }

  const sorted = finalizedCandidates
    .sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      if (b.seniorityScore !== a.seniorityScore) return b.seniorityScore - a.seniorityScore;
      if (b.dataScore !== a.dataScore) return b.dataScore - a.dataScore;
      return a.groupName.localeCompare(b.groupName);
    });

  const selected: Candidate[] = [];
  const backups: Candidate[] = [];
  const perGroup = new Map<string, number>();
  const totalTarget = PRIMARY_TARGET + BACKUP_TARGET;

  for (const candidate of sorted) {
    const used = perGroup.get(candidate.domain) ?? 0;
    if (used >= MAX_PER_GROUP) continue;

    if (selected.length < PRIMARY_TARGET) {
      selected.push(candidate);
      perGroup.set(candidate.domain, used + 1);
      continue;
    }

    if (backups.length < BACKUP_TARGET) {
      backups.push(candidate);
      perGroup.set(candidate.domain, used + 1);
    }

    if (selected.length + backups.length >= totalTarget) break;
  }

  const groupDistribution = Array.from(
    [...selected, ...backups].reduce<Map<string, { groupName: string; count: number }>>((map, item) => {
      const current = map.get(item.domain) ?? { groupName: item.groupName, count: 0 };
      current.count += 1;
      map.set(item.domain, current);
      return map;
    }, new Map()).values(),
  ).sort((a, b) => b.count - a.count || a.groupName.localeCompare(b.groupName));

  console.log(
    JSON.stringify(
      {
        strategy: {
          primaryTarget: PRIMARY_TARGET,
          backupTarget: BACKUP_TARGET,
          maxPerGroup: MAX_PER_GROUP,
        },
        pool: {
          totalCandidatesWithoutPhone: sorted.length,
          uniqueGroupsWithCandidates: new Set(sorted.map((item) => item.domain)).size,
        },
        primary: selected,
        backups,
        groupDistribution,
        lushaColumns: {
          required: ['linkedin', 'first_name', 'last_name', 'full_name', 'company_name', 'email', 'company_domain'],
          recommendedMapping: {
            linkedin: 'LinkedIn profile URL',
            full_name: 'Full name',
            email: 'Email',
            company_name: 'Company name',
            company_domain: 'Company domain',
          },
        },
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});

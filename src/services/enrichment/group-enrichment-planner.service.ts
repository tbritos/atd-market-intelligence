const BRAND_TOKENS = [
  'fiat',
  'jeep',
  'toyota',
  'volkswagen',
  'vw',
  'ford',
  'gm',
  'chevrolet',
  'byd',
  'bmw',
  'honda',
  'hyundai',
  'gwm',
  'daf',
  'ducati',
];

const GENERIC_NAME_TOKENS = [
  'concessionaria',
  'concessionária',
  'automoveis',
  'automóveis',
  'veiculos',
  'veículos',
  'seminovos',
  'consorcio',
  'consórcio',
  'grupo',
  'auto',
  'motors',
  'motores',
  'dealer',
  'oficial',
  'matriz',
  'filial',
];

function unique<T>(items: T[]) {
  return [...new Set(items)];
}

function normalizeToken(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function cleanCompanyName(name: string) {
  let result = ` ${name} `;
  for (const token of [...BRAND_TOKENS, ...GENERIC_NAME_TOKENS]) {
    const pattern = new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    result = result.replace(pattern, ' ');
  }

  return result
    .replace(/[|/\\()-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractMeaningfulDomainTerms(domain: string) {
  const tokens = domain
    .split('.')
    .slice(0, -1)
    .flatMap((piece) => piece.split(/[-_]/g))
    .map(normalizeToken)
    .filter(Boolean)
    .filter((token) => token.length >= 3)
    .filter((token) => !BRAND_TOKENS.includes(token))
    .filter((token) => !['www', 'com', 'net', 'org', 'blog', 'site'].includes(token));

  return unique(tokens);
}

function titleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ');
}

export type GroupEnrichmentPlan = {
  queue: 'blocked_crm' | 'apollo_ready' | 'hunter_fallback' | 'review';
  priorityScore: number;
  confidence: 'high' | 'medium' | 'low';
  reasons: string[];
  apollo: {
    shouldEnrich: boolean;
    mode: 'domain_enrich' | 'org_search' | 'mixed' | 'skip';
    domain: string | null;
    orgQueryTerms: string[];
    peopleQueryTerms: string[];
    titleHints: string[];
  };
  hunter: {
    shouldEnrich: boolean;
    mode: 'domain_search' | 'email_finder' | 'skip';
    domain: string | null;
    emailFinderCandidates: string[];
  };
};

type PlannerInput = {
  domain: string;
  bucket: 'priority' | 'review' | 'single' | 'generic';
  provider: string | null;
  states: string[];
  stores: { name: string; city: { name: string } | null; phone: string | null }[];
  pipedrive: {
    status: 'not_found' | 'lead' | 'deal_ativo' | 'cliente';
    orgName: string | null;
    persons: { name: string; email: string | null; phone: string | null; jobTitle: string | null }[];
  };
};

class GroupEnrichmentPlannerService {
  build(input: PlannerInput): GroupEnrichmentPlan {
    const domainTerms = extractMeaningfulDomainTerms(input.domain);
    const cleanedStoreNames = unique(
      input.stores
        .map((store) => cleanCompanyName(store.name))
        .filter((name) => name.length >= 3),
    );
    const cityTerms = unique(
      input.stores
        .map((store) => store.city?.name?.trim())
        .filter((value): value is string => Boolean(value && value.length >= 3)),
    );
    const peopleNames = unique(
      input.pipedrive.persons
        .map((person) => person.name?.trim())
        .filter((value): value is string => Boolean(value && value.length >= 3)),
    );

    const orgQueryTerms = unique([
      input.pipedrive.orgName ?? '',
      ...domainTerms.map(titleCase),
      ...cleanedStoreNames.slice(0, 5),
    ]).filter(Boolean);

    const peopleQueryTerms = unique([
      ...(input.pipedrive.orgName ? [input.pipedrive.orgName] : []),
      ...cleanedStoreNames.slice(0, 5),
      ...cityTerms.slice(0, 3).map((city) => `${orgQueryTerms[0] ?? cleanedStoreNames[0] ?? titleCase(domainTerms[0] ?? input.domain)} ${city}`),
    ]).filter(Boolean);

    const titleHints = unique(
      input.stores
        .flatMap((store) => [store.name, cleanCompanyName(store.name)])
        .filter((value) => value.length >= 3)
        .slice(0, 8),
    );

    const reasons: string[] = [];
    let priorityScore = 50;
    let queue: GroupEnrichmentPlan['queue'] = 'apollo_ready';
    let confidence: GroupEnrichmentPlan['confidence'] = 'high';

    if (input.pipedrive.status === 'cliente' || input.pipedrive.status === 'deal_ativo') {
      queue = 'blocked_crm';
      confidence = 'high';
      reasons.push('Grupo já está no CRM com cliente ou deal ativo');
      priorityScore -= 80;
    }

    if (input.bucket === 'generic') {
      queue = 'review';
      confidence = 'low';
      reasons.push('Domínio genérico ou agregador, ruim para enriquecimento automático');
      priorityScore -= 30;
    }

    if (input.bucket === 'review') {
      queue = queue === 'blocked_crm' ? queue : 'review';
      confidence = queue === 'blocked_crm' ? 'high' : 'medium';
      reasons.push('Grupo multiestado pede revisão antes de gastar crédito');
      priorityScore -= 15;
    }

    if (input.bucket === 'single' && queue === 'apollo_ready') {
      priorityScore -= 10;
      reasons.push('Grupo de uma loja só, menor ganho por crédito');
    }

    if (input.stores.length >= 3) {
      priorityScore += 20;
      reasons.push('Grupo com múltiplas lojas, bom multiplicador de enriquecimento');
    } else if (input.stores.length === 2) {
      priorityScore += 10;
    }

    const storesWithPhone = input.stores.filter((store) => !!store.phone).length;
    if (storesWithPhone === input.stores.length && input.stores.length > 0) {
      priorityScore += 10;
      reasons.push('Todas as lojas do grupo já têm telefone');
    }

    if (input.provider && input.provider !== 'Sem provedor') {
      priorityScore += 8;
      reasons.push(`Provedor identificado: ${input.provider}`);
    }

    if (domainTerms.length === 0 && !input.pipedrive.orgName) {
      queue = queue === 'blocked_crm' ? queue : 'hunter_fallback';
      confidence = 'low';
      reasons.push('Domínio pouco informativo; Apollo por nome tende a piorar');
      priorityScore -= 12;
    }

    if (orgQueryTerms.length <= 1 && queue === 'apollo_ready') {
      queue = 'hunter_fallback';
      confidence = 'medium';
      reasons.push('Poucos termos confiáveis para organização no Apollo');
    }

    if (input.pipedrive.status === 'lead' && queue !== 'blocked_crm') {
      priorityScore += 12;
      reasons.push('Organização já existe no CRM e pode ser complementada');
    }

    if (input.pipedrive.status === 'not_found' && queue !== 'blocked_crm') {
      priorityScore += 6;
      reasons.push('Grupo livre no CRM');
    }

    const apolloMode: GroupEnrichmentPlan['apollo']['mode'] =
      queue === 'blocked_crm' || queue === 'review'
        ? 'skip'
        : input.pipedrive.orgName && input.domain
          ? 'mixed'
          : input.domain
            ? 'domain_enrich'
            : 'org_search';

    const hunterMode: GroupEnrichmentPlan['hunter']['mode'] =
      queue === 'blocked_crm' || queue === 'review'
        ? 'skip'
        : peopleNames.length > 0
          ? 'email_finder'
          : 'domain_search';

    const emailFinderCandidates = unique(peopleNames).slice(0, 5);

    return {
      queue,
      priorityScore: Math.max(0, Math.min(100, priorityScore)),
      confidence,
      reasons: unique(reasons),
      apollo: {
        shouldEnrich: queue === 'apollo_ready',
        mode: apolloMode,
        domain: input.domain || null,
        orgQueryTerms: orgQueryTerms.slice(0, 6),
        peopleQueryTerms: peopleQueryTerms.slice(0, 6),
        titleHints,
      },
      hunter: {
        shouldEnrich: queue === 'hunter_fallback' || queue === 'apollo_ready',
        mode: hunterMode,
        domain: input.domain || null,
        emailFinderCandidates,
      },
    };
  }
}

export const groupEnrichmentPlannerService = new GroupEnrichmentPlannerService();

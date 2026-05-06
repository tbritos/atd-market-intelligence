import ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type Classification = 'relevante' | 'cinza' | 'irrelevante';

const CARGOS_DECISORES = [
  'proprietar',
  'socio',
  'diretor',
  'gerente',
  'presidente',
  'ceo',
  'owner',
  'founder',
  'gm ',
  'general manager',
  'coordenador',
  'supervisor',
  'chefe',
  'head',
  'vp ',
  'vice',
];

const NON_AUTOMOTIVE_PATTERNS = [
  /\bstone\b|franquia stone/i,
  /\baneel\b|energia|transi[cç][aã]o energ[eé]tica|assuntos regulat[oó]rios/i,
  /laborat[oó]rio|hospital|sa[uú]de|farm[aá]cia|a[cç]ougueiro/i,
  /financial services|commodities|banco|bank|fintech/i,
  /\bjbs\b|a[cç]ougue|alimentos/i,
  /uniplan|sest senat|professor|universidade|faculdade/i,
  /technology recruitment|recruitment|help-desk|suporte nti/i,
  /nova era contabilidade|shopping buriti|transportes nova era|mr ve[ií]culos|chem-e-car|cipa nr5/i,
  /advertising service|copywriter|editor|content intern/i,
  /\bloreal\.com\b|auto-moto\.in|marlinselection\.com|omh\.uy|meau\.com|mtee\.eu|almod\.com|tsurumi\.eu/i,
];

const EXCLUDED_GROUP_PATTERNS = [
  /\bfiori\b/i,
  /\bparvi\b/i,
  /\bpavi\b/i,
];

const STRICT_BAD_TITLE_PATTERNS = [
  /\bsales consultant\b/i,
  /\btechnical consultant\b/i,
  /\bsales executive\b/i,
  /\bsalesperson\b/i,
  /\bsales assistant\b/i,
  /\bsaleswoman\b/i,
  /\bbusiness consultant\b/i,
  /\bcommercial consultant\b/i,
  /\bcustomer service\b/i,
  /\breceptionist\b/i,
  /\byoung apprentice\b/i,
  /\baccountant\b/i,
  /\baccounting\b/i,
  /\bbilling assistant\b/i,
  /\bpersonnel assistant\b/i,
  /\bparts seller\b/i,
  /\bparts consultant\b/i,
  /\bservice consultant\b/i,
  /\bmechanical technician\b/i,
  /\bentregador t[ée]cnico\b/i,
  /\bauxilar de limpeza\b/i,
  /\bauxiliar de limpeza\b/i,
  /\barchivist\b/i,
  /\badvertising\b/i,
  /\bagendadora\b|\bagendamento\b/i,
  /\bcar salesman\b/i,
  /\bsales representative\b/i,
  /\bsales promoter\b/i,
  /\bvendedor(a)?\b/i,
  /\bconsultor(a)?\b/i,
  /\bassistent(e)?\b/i,
  /\bauxiliar\b/i,
  /\bintern\b|\bestagi/i,
  /\bcashier\b|\bcaixa\b/i,
  /\bmechanic\b|\bmec[aâ]nico\b/i,
  /\bdriver\b|\bmotorista\b/i,
  /\bwatchman\b|\bwasher\b/i,
  /\bfunileiro\b/i,
  /\bgarantista\b/i,
  /\banalyst\b|\banalista\b/i,
  /\bsecret[aá]ria\b|\bsecretaria\b/i,
  /\bpre-sales\b|\bsdr\b/i,
  /\bservice technician\b|\bt[eé]cnico de servi/i,
  /\bstockist\b/i,
  /\bmaterial tracker\b/i,
];

const SAFE_PUBLIC_OR_PERSONAL_EMAIL_DOMAINS = [
  'gmail.com',
  'hotmail.com',
  'outlook.com',
  'icloud.com',
  'yahoo.com',
  'live.com',
];

function isDecisionMaker(cargo: string | null): boolean {
  if (!cargo) return false;
  const lower = cargo.toLowerCase();
  return CARGOS_DECISORES.some((keyword) => lower.includes(keyword));
}

function extractDomain(url: string | null): string | null {
  if (!url) return null;
  try {
    const normalized = url.startsWith('http') ? url : `https://${url}`;
    return new URL(normalized).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

function emailDomain(email: string | null | undefined): string {
  const match = (email || '').toLowerCase().match(/@([^\s>]+)$/);
  return match?.[1]?.replace(/[;,]+$/, '') ?? '';
}

function rootDomain(domain: string): string {
  const parts = domain.toLowerCase().split('.').filter(Boolean);
  if (parts.length <= 2) return parts.join('.');
  return parts.slice(-2).join('.');
}

function normalizeGroupName(storeName: string | undefined, fallback: string): string {
  if (!storeName) return fallback;
  return (
    storeName
      .replace(/:\s*concession[aá]ria.*$/i, '')
      .replace(/\s*[-–]\s*(unidade|loja|filial).*$/i, '')
      .trim() || fallback
  );
}

function classifyTitle(titleRaw: string | null | undefined): Classification {
  const title = (titleRaw || '').trim();
  const lower = title.toLowerCase();

  if (!title) return 'irrelevante';

  if (STRICT_BAD_TITLE_PATTERNS.some((pattern) => pattern.test(lower))) return 'irrelevante';

  if (
    /owner|founder|co-founder|coo|ceo|president|managing partner|business owner|director|diretor|head|managing director|general manager|gerente geral|superintendent|superintendente|commercial manager|commercial director|commercial sales manager|commercial supervisor|sales manager|senior sales manager|general sales manager|regional sales director|retail sales manager|manager of sales|gerente comercial|gerente de vendas|gerente de negócios|gerente de lead|gerente de loja|store manager|business manager|subsidiary manager|sales supervisor|coordenadora de vendas|executivo de vendas direta|after-sales manager|after sales manager|gerente de p[oó]s[- ]?venda|gerente de pos venda|service manager|service supervisor|parts and service|parts manager|workshop manager|gerente de assist[eê]ncia|gerente de opera[cç][oõ]es de servi[cç]o|supervisor de assist[eê]ncia|supervisor de servi[cç]os|coordenadora de pe[cç]as|gerente de pe[cç]as|marketing manager|marketing supervisor|manager of marketing|marketing & communications director|coordenadora de relacionamento e marketing|coordenadora de e-commerce|crm|brand|administrative director|administrative manager|administrative supervisor|administrative and financial manager|office manager|financial administrative supervisor|finance supervisor|financial manager|gerente administrativo|gerente geral administrativo|quality coordinator|warehouse manager|operations director/.test(
      lower,
    )
  ) {
    return 'relevante';
  }

  return 'irrelevante';
}

function isClearlyNonAutomotive(input: {
  nome: string | null;
  cargo: string | null;
  email: string | null;
  linkedin: string | null;
  groupName: string;
  domain: string;
  site: string;
}): boolean {
  const haystack = [
    input.nome,
    input.cargo,
    input.email,
    input.linkedin,
    input.groupName,
    input.domain,
    input.site,
  ]
    .filter(Boolean)
    .join(' | ');

  return NON_AUTOMOTIVE_PATTERNS.some((pattern) => pattern.test(haystack));
}

function isExcludedGroup(input: { groupName: string; domain: string; site: string; marcas: string; lojas: string }): boolean {
  const haystack = [input.groupName, input.domain, input.site, input.marcas, input.lojas].join(' | ');
  return EXCLUDED_GROUP_PATTERNS.some((pattern) => pattern.test(haystack));
}

function isCoreIcpTitle(titleRaw: string | null | undefined): boolean {
  const title = (titleRaw || '').trim().toLowerCase();
  if (!title) return false;

  if (
    /owner|founder|co-founder|coo|ceo|president|managing partner|business owner|director|diretor|managing director|general manager|gerente geral|commercial manager|commercial director|commercial sales manager|commercial supervisor|sales manager|senior sales manager|general sales manager|regional sales director|retail sales manager|manager of sales|gerente comercial|gerente de vendas|gerente de negócios|gerente de lead|gerente de loja|store manager|business manager|subsidiary manager|sales supervisor|coordenadora de vendas|executivo de vendas direta|after-sales manager|after sales manager|gerente de p[oó]s[- ]?venda|gerente de pos venda|service manager|service supervisor|parts and service|parts manager|workshop manager|gerente de assist[eê]ncia|gerente de opera[cç][oõ]es de servi[cç]o|supervisor de assist[eê]ncia|supervisor de servi[cç]os|coordenadora de pe[cç]as|gerente de pe[cç]as|marketing manager|marketing supervisor|manager of marketing|marketing & communications director|coordenadora de relacionamento e marketing|coordenadora de e-commerce|crm|brand|administrative director/.test(
      title,
    )
  ) {
    return true;
  }

  return false;
}

function hasBadDomainMismatch(input: {
  email: string;
  siteDomain: string;
  cargo: string;
  telefone: string;
  linkedin: string;
}): boolean {
  const mailDomain = emailDomain(input.email);
  if (!mailDomain || !input.siteDomain) return false;
  if (SAFE_PUBLIC_OR_PERSONAL_EMAIL_DOMAINS.includes(mailDomain)) return false;

  const siteRoot = rootDomain(input.siteDomain);
  const emailRoot = rootDomain(mailDomain);
  if (siteRoot === emailRoot) return false;
  if (mailDomain.includes(input.siteDomain) || input.siteDomain.includes(mailDomain)) return false;

  // If a contact has a phone and a strong role, keep it unless the domain is explicitly blocked above.
  const strong = classifyTitle(input.cargo) === 'relevante';
  if (input.telefone && strong && input.linkedin) return false;

  return true;
}

function scoreRow(input: {
  cargo: string;
  telefone: string;
  email: string;
  linkedin: string;
  decisor: boolean;
  classificacao: Classification;
}): number {
  let score = 0;
  if (input.classificacao === 'relevante') score += 35;
  if (input.classificacao === 'cinza') score += 12;
  if (input.decisor) score += 15;
  if (input.telefone) score += 40;
  if (input.email) score += 20;
  if (input.linkedin) score += 20;
  return score;
}

function prioridade(score: number): string {
  if (score >= 110) return 'A';
  if (score >= 75) return 'B';
  return 'C';
}

async function main() {
  const stores = await prisma.store.findMany({
    where: { enrichmentStatus: 'done' },
    select: {
      id: true,
      name: true,
      website: { select: { url: true, provider: { select: { name: true } } } },
      state: { select: { code: true, region: true } },
      brand: { select: { name: true } },
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

  const groups = new Map<
    string,
    {
      grupo: string;
      domain: string;
      site: string;
      provedor: string;
      marcas: Set<string>;
      estados: Set<string>;
      regioes: Set<string>;
      lojas: Set<string>;
      contacts: Map<
        string,
        {
          nome: string;
          cargo: string;
          email: string;
          telefone: string;
          linkedin: string;
          origem: string;
          decisor: boolean;
          classificacao: Classification;
          lojas: Set<string>;
          score: number;
        }
      >;
    }
  >();

  for (const store of stores) {
    const domain = extractDomain(store.website?.url ?? null) ?? `sem-site-${store.id}`;

    if (!groups.has(domain)) {
      groups.set(domain, {
        grupo: normalizeGroupName(store.name, domain),
        domain,
        site: store.website?.url ?? '',
        provedor: store.website?.provider?.name ?? '',
        marcas: new Set<string>(),
        estados: new Set<string>(),
        regioes: new Set<string>(),
        lojas: new Set<string>(),
        contacts: new Map(),
      });
    }

    const group = groups.get(domain)!;
    if (store.brand?.name) group.marcas.add(store.brand.name);
    if (store.state?.code) group.estados.add(store.state.code);
    if (store.state?.region) group.regioes.add(store.state.region);
    group.lojas.add(store.name);

    for (const partner of store.partners ?? []) {
      const key = partner.email?.toLowerCase() ?? partner.linkedinUrl?.toLowerCase() ?? null;
      if (!key) continue;

      const classificacao = classifyTitle(partner.qualificacao);
      if (classificacao === 'irrelevante') continue;
      if (!isCoreIcpTitle(partner.qualificacao)) continue;

      if (
        isClearlyNonAutomotive({
          nome: partner.nome,
          cargo: partner.qualificacao,
          email: partner.email,
          linkedin: partner.linkedinUrl,
          groupName: group.grupo,
          domain: group.domain,
          site: group.site,
        })
      ) {
        continue;
      }

      if (
        hasBadDomainMismatch({
          email: partner.email ?? '',
          siteDomain: group.domain,
          cargo: partner.qualificacao ?? '',
          telefone: partner.phone ?? '',
          linkedin: partner.linkedinUrl ?? '',
        })
      ) {
        continue;
      }

      const decisor = isDecisionMaker(partner.qualificacao);
      const contact = {
        nome: partner.nome ?? '',
        cargo: partner.qualificacao ?? '',
        email: partner.email ?? '',
        telefone: partner.phone ?? '',
        linkedin: partner.linkedinUrl ?? '',
        origem: partner.source ?? '',
        decisor,
        classificacao,
        lojas: new Set<string>([store.name]),
        score: 0,
      };
      contact.score = scoreRow(contact);

      const existing = group.contacts.get(key);
      if (!existing || contact.score > existing.score) {
        if (existing) {
          for (const loja of existing.lojas) contact.lojas.add(loja);
        }
        group.contacts.set(key, contact);
      } else {
        existing.lojas.add(store.name);
      }
    }
  }

  const rows = Array.from(groups.values())
    .filter((group) =>
      !isExcludedGroup({
        groupName: group.grupo,
        domain: group.domain,
        site: group.site,
        marcas: Array.from(group.marcas).join(', '),
        lojas: Array.from(group.lojas).join(' | '),
      }),
    )
    .flatMap((group) => {
      const contacts = Array.from(group.contacts.values());
      const groupPhones = contacts.filter((contact) => contact.telefone).length;
      const groupComplete = contacts.filter((contact) => contact.telefone && contact.email && contact.linkedin).length;

      return contacts.map((contact) => ({
        Prioridade: prioridade(contact.score),
        Score: contact.score,
        Grupo: group.grupo,
        Dominio: group.domain,
        Site: group.site,
        Provedor: group.provedor,
        Marcas: Array.from(group.marcas).sort().join(', '),
        Estados: Array.from(group.estados).sort().join(', '),
        Regioes: Array.from(group.regioes).sort().join(', '),
        'Qtd Lojas Grupo': group.lojas.size,
        'Qtd Contatos Grupo': contacts.length,
        'Qtd Telefones Grupo': groupPhones,
        'Qtd Completos Grupo': groupComplete,
        'Lojas Grupo': Array.from(group.lojas).sort().join(' | '),
        Nome: contact.nome,
        Cargo: contact.cargo,
        Email: contact.email,
        Telefone: contact.telefone,
        LinkedIn: contact.linkedin,
        Origem: contact.origem,
        'Decisor?': contact.decisor ? 'sim' : 'nao',
        Classificacao: contact.classificacao,
        'Lojas do Contato': Array.from(contact.lojas).sort().join(' | '),
      }));
    })
    .sort((a, b) => {
      if (a.Prioridade !== b.Prioridade) return String(a.Prioridade).localeCompare(String(b.Prioridade));
      if (Number(b.Score) !== Number(a.Score)) return Number(b.Score) - Number(a.Score);
      const groupCompare = String(a.Grupo).localeCompare(String(b.Grupo));
      if (groupCompare !== 0) return groupCompare;
      return String(a.Nome).localeCompare(String(b.Nome));
    });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Codex';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Lista Final SDR', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet.columns = [
    { header: 'Prioridade', key: 'Prioridade', width: 12 },
    { header: 'Score', key: 'Score', width: 10 },
    { header: 'Grupo', key: 'Grupo', width: 34 },
    { header: 'Dominio', key: 'Dominio', width: 28 },
    { header: 'Site', key: 'Site', width: 34 },
    { header: 'Provedor', key: 'Provedor', width: 20 },
    { header: 'Marcas', key: 'Marcas', width: 18 },
    { header: 'Estados', key: 'Estados', width: 14 },
    { header: 'Regioes', key: 'Regioes', width: 16 },
    { header: 'Qtd Lojas Grupo', key: 'Qtd Lojas Grupo', width: 16 },
    { header: 'Qtd Contatos Grupo', key: 'Qtd Contatos Grupo', width: 18 },
    { header: 'Qtd Telefones Grupo', key: 'Qtd Telefones Grupo', width: 19 },
    { header: 'Qtd Completos Grupo', key: 'Qtd Completos Grupo', width: 19 },
    { header: 'Lojas Grupo', key: 'Lojas Grupo', width: 42 },
    { header: 'Nome', key: 'Nome', width: 28 },
    { header: 'Cargo', key: 'Cargo', width: 30 },
    { header: 'Email', key: 'Email', width: 30 },
    { header: 'Telefone', key: 'Telefone', width: 24 },
    { header: 'LinkedIn', key: 'LinkedIn', width: 40 },
    { header: 'Origem', key: 'Origem', width: 12 },
    { header: 'Decisor?', key: 'Decisor?', width: 10 },
    { header: 'Classificacao', key: 'Classificacao', width: 14 },
    { header: 'Lojas do Contato', key: 'Lojas do Contato', width: 42 },
  ];

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
  header.alignment = { vertical: 'middle', horizontal: 'center' };

  for (const row of rows) {
    const added = sheet.addRow(row);
    added.hidden = false;
    added.outlineLevel = 0;
  }

  sheet.spliceColumns(1, 2);
  sheet.autoFilter = 'A1:U1';

  for (let index = 2; index <= sheet.rowCount; index++) {
    const row = sheet.getRow(index);
    row.eachCell((cell) => {
      cell.alignment = { vertical: 'top', wrapText: true };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFD9E2F3' } } };
    });
  }

  const outputPath = 'base-leads-sdr-final-envio.xlsx';
  await workbook.xlsx.writeFile(outputPath);

  console.log(
    JSON.stringify(
      {
        outputPath,
        totalContacts: rows.length,
        totalGroups: new Set(rows.map((row) => row.Dominio)).size,
        withPhone: rows.filter((row) => row.Telefone).length,
        complete: rows.filter((row) => row.Telefone && row.Email && row.LinkedIn).length,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

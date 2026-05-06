import ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type Classification = 'relevante' | 'cinza' | 'irrelevante';

type Contact = {
  nome: string;
  cargo: string;
  email: string;
  telefone: string;
  linkedin: string;
  origem: string;
  decisor: boolean;
  apolloHasPhone: boolean;
  classificacao: Classification;
  lojas: Set<string>;
  score: number;
};

const MAX_CONTACTS_PER_GROUP = 5;

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
];

function isDecisionMaker(cargo: string | null): boolean {
  if (!cargo) return false;
  const lower = cargo.toLowerCase();
  return CARGOS_DECISORES.some((keyword) => lower.includes(keyword));
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

function extractDomain(url: string | null): string | null {
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

  if (
    /director|diretor|head|managing director|commercial manager|sales manager|marketing manager|after-sales manager|after sales manager|gerente|coordinator|coordenador|supervisor|operations director|business manager|commercial director|subsidiary manager|superintendent|office manager|administrative director|administrative manager|administrative and financial manager|quality coordinator|warehouse manager/.test(
      lower,
    )
  ) {
    return 'relevante';
  }

  if (
    /sales consultant|sales executive|salesperson|saleswoman|sales assistant|technical consultant|consultant|service consultant|customer service|receptionist|young apprentice|analyst|assistant|help-desk|billing|mechanical technician|entregador t[ée]cnico|agendamento|agendadora|crm|copywriter|designer|design|social media|financeiro|accounting|accountant|hr analyst|human resources analyst|financial analyst|financial assistant|personnel assistant|recruitment|talentos|auditoria|controladoria|f&i|warranty|parts seller|parts consultant|consultora de servi|consultor automotivo|consultor de p[oó]s|auxilar de limpeza|limpeza|açougueiro|archivist/.test(
      lower,
    )
  ) {
    return 'irrelevante';
  }

  return 'cinza';
}

function scoreContact(input: {
  cargo: string;
  email: string;
  telefone: string;
  linkedin: string;
  decisor: boolean;
  apolloHasPhone: boolean;
  classificacao: Classification;
}): number {
  let score = 0;

  if (input.classificacao === 'relevante') score += 35;
  if (input.classificacao === 'cinza') score += 15;
  if (input.decisor) score += 15;
  if (input.telefone) score += 40;
  if (input.email) score += 20;
  if (input.linkedin) score += 20;
  if (input.apolloHasPhone) score += 8;

  const lower = input.cargo.toLowerCase();
  if (/director|diretor|head|managing director|commercial director|operations director/.test(lower)) score += 12;
  if (/commercial|sales|vendas|p[oó]s-venda|after-sales|after sales|marketing|brand|crm|operations/.test(lower)) score += 10;

  return score;
}

function qualityLabel(score: number): string {
  if (score >= 230) return 'A+';
  if (score >= 170) return 'A';
  if (score >= 120) return 'B';
  return 'C';
}

function selectContactsForSdr(contacts: Contact[]): Contact[] {
  const selected = new Map<string, Contact>();
  const keyFor = (contact: Contact) =>
    contact.linkedin.toLowerCase() || contact.email.toLowerCase() || contact.nome.toLowerCase();

  for (const contact of contacts.slice(0, MAX_CONTACTS_PER_GROUP)) {
    selected.set(keyFor(contact), contact);
  }

  for (const contact of contacts) {
    const hasPhone = !!contact.telefone;
    const isComplete = !!contact.telefone && !!contact.email && !!contact.linkedin;
    if (hasPhone || isComplete) {
      selected.set(keyFor(contact), contact);
    }
  }

  return Array.from(selected.values()).sort((a, b) => b.score - a.score);
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
      contacts: Map<string, Contact>;
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
        contacts: new Map<string, Contact>(),
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

      const classificacao = classifyTitle(partner.qualificacao);
      if (classificacao === 'irrelevante') continue;

      const decisor = isDecisionMaker(partner.qualificacao);
      const contact: Contact = {
        nome: partner.nome ?? '',
        cargo: partner.qualificacao ?? '',
        email: partner.email ?? '',
        telefone: partner.phone ?? '',
        linkedin: partner.linkedinUrl ?? '',
        origem: partner.source ?? '',
        decisor,
        apolloHasPhone: !!partner.apolloHasPhone,
        classificacao,
        lojas: new Set<string>([store.name]),
        score: 0,
      };
      contact.score = scoreContact(contact);

      if (!group.contacts.has(key)) {
        group.contacts.set(key, contact);
        continue;
      }

      const existing = group.contacts.get(key)!;
      if (!existing.telefone && contact.telefone) existing.telefone = contact.telefone;
      if (!existing.email && contact.email) existing.email = contact.email;
      if (!existing.linkedin && contact.linkedin) existing.linkedin = contact.linkedin;
      if (!existing.origem && contact.origem) existing.origem = contact.origem;
      if (contact.apolloHasPhone) existing.apolloHasPhone = true;
      if (contact.decisor) existing.decisor = true;
      if (contact.classificacao === 'relevante') existing.classificacao = 'relevante';
      existing.lojas.add(store.name);
      existing.score = scoreContact(existing);
    }
  }

  const enrichedGroups = Array.from(groups.values())
    .map((group) => {
      const allContacts = Array.from(group.contacts.values()).sort((a, b) => b.score - a.score);
      const selectedContacts = selectContactsForSdr(allContacts);
      const totalPhones = allContacts.filter((contact) => contact.telefone).length;
      const totalComplete = allContacts.filter((contact) => contact.telefone && contact.email && contact.linkedin).length;
      const groupScore =
        selectedContacts.reduce((sum, contact) => sum + contact.score, 0) +
        Math.min(group.lojas.size, 8) * 4 +
        totalComplete * 20 +
        totalPhones * 12;

      const row: Record<string, string | number> = {
        Prioridade: qualityLabel(groupScore),
        Score: groupScore,
        Grupo: group.grupo,
        Dominio: group.domain,
        Site: group.site,
        Provedor: group.provedor,
        Marcas: Array.from(group.marcas).sort().join(', '),
        Estados: Array.from(group.estados).sort().join(', '),
        Regioes: Array.from(group.regioes).sort().join(', '),
        'Qtd Lojas': group.lojas.size,
        'Qtd Contatos Bons': allContacts.length,
        'Qtd Com Telefone': totalPhones,
        'Qtd Com Dados Completos': totalComplete,
        'Lojas do Grupo': Array.from(group.lojas).sort().join(' | '),
        Observacao:
          totalComplete > 0
            ? 'Tem contato completo com telefone, email e LinkedIn'
            : totalPhones > 0
              ? 'Tem telefone, mas nem todos os dados completos'
              : 'Sem telefone nos contatos selecionados',
      };

      selectedContacts.forEach((contact, index) => {
        const position = index + 1;
        row[`Contato ${position}`] = contact.nome;
        row[`Cargo ${position}`] = contact.cargo;
        row[`Telefone ${position}`] = contact.telefone;
        row[`Email ${position}`] = contact.email;
        row[`LinkedIn ${position}`] = contact.linkedin;
        row[`Decisor ${position}`] = contact.decisor ? 'sim' : 'nao';
        row[`Classificacao ${position}`] = contact.classificacao;
      });

      return { row, selectedContacts };
    })
    .filter((item) => Number(item.row['Qtd Contatos Bons']) > 0)
    .sort((a, b) => Number(b.row.Score) - Number(a.row.Score));

  const rows = enrichedGroups.map((item) => item.row);
  const maxContactsInAnyGroup = Math.max(
    MAX_CONTACTS_PER_GROUP,
    ...enrichedGroups.map((item) => item.selectedContacts.length),
  );

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Codex';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Grupos SDR', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  const baseColumns = [
    'Prioridade',
    'Score',
    'Grupo',
    'Dominio',
    'Site',
    'Provedor',
    'Marcas',
    'Estados',
    'Regioes',
    'Qtd Lojas',
    'Qtd Contatos Bons',
    'Qtd Com Telefone',
    'Qtd Com Dados Completos',
    'Lojas do Grupo',
    'Observacao',
  ];

  const contactColumns = Array.from({ length: maxContactsInAnyGroup }).flatMap((_, index) => {
    const position = index + 1;
    return [
      `Contato ${position}`,
      `Cargo ${position}`,
      `Telefone ${position}`,
      `Email ${position}`,
      `LinkedIn ${position}`,
      `Decisor ${position}`,
      `Classificacao ${position}`,
    ];
  });

  sheet.columns = [...baseColumns, ...contactColumns].map((header) => ({
    header,
    key: header,
    width:
      header.includes('LinkedIn') || header === 'Site' || header === 'Lojas do Grupo'
        ? 38
        : header.includes('Cargo') || header.includes('Contato') || header === 'Grupo'
          ? 28
          : header.includes('Email')
            ? 30
            : header === 'Observacao'
              ? 34
              : 16,
  }));

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1F4E78' },
  };
  header.alignment = { vertical: 'middle', horizontal: 'center' };

  for (const row of rows) {
    const added = sheet.addRow(row);
    added.hidden = false;
    added.outlineLevel = 0;
  }

  sheet.autoFilter = `A1:${sheet.getColumn(sheet.columnCount).letter}1`;

  for (let index = 2; index <= sheet.rowCount; index++) {
    const row = sheet.getRow(index);
    row.eachCell((cell) => {
      cell.alignment = { vertical: 'top', wrapText: true };
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FFD9E2F3' } },
      };
    });

    const priority = row.getCell(1).value;
    if (priority === 'A+' || priority === 'A') {
      row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } };
    } else if (priority === 'B') {
      row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEB9C' } };
    } else {
      row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4CCCC' } };
    }
  }

  const outputPath = 'base-leads-sdr-grupo-por-linha.xlsx';
  await workbook.xlsx.writeFile(outputPath);

  console.log(
    JSON.stringify(
      {
        outputPath,
        totalGroups: rows.length,
        groupsWithPhone: rows.filter((row) => Number(row['Qtd Com Telefone']) > 0).length,
        groupsWithCompleteContact: rows.filter((row) => Number(row['Qtd Com Dados Completos']) > 0).length,
        maxContactsInAnyGroup,
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

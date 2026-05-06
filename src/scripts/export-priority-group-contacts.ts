import ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type ContactRow = {
  nome: string;
  cargo: string;
  email: string;
  telefone: string;
  linkedin: string;
  source: string;
  apolloHasPhone: string;
  storeName: string;
};

type GroupRow = {
  groupName: string;
  site: string;
  provider: string;
  brands: string[];
  stores: string[];
  contacts: ContactRow[];
};

const PRIORITY_DOMAINS = [
  'ostengroup.com.br',
  'ramosten.com.br',
  'jeeposten.com.br',
  'bmwosten.com.br',
  'bmwmotorradosten.com.br',
  'triumphosten.com.br',
  'bydosten.com.br',
  'sulparamassey.com.br',
  'redwheelharley-davidson.com.br',
];

const PRIORITY_NAME_PATTERNS = ['OSTEN', 'SULPARA', 'Red Wheel'];

function normalizeText(value: string | null | undefined): string {
  return value?.trim() || '';
}

function inferGroupKey(site: string, storeName: string): string {
  return site || storeName;
}

function dedupeContactKey(contact: ContactRow): string {
  return (
    contact.linkedin.toLowerCase() ||
    contact.email.toLowerCase() ||
    `${contact.nome.toLowerCase()}|${contact.cargo.toLowerCase()}`
  );
}

function isPriorityStore(input: { name: string; site: string }): boolean {
  const lowerName = input.name.toLowerCase();
  const lowerSite = input.site.toLowerCase();

  return (
    PRIORITY_DOMAINS.some((domain) => lowerSite.includes(domain)) ||
    PRIORITY_NAME_PATTERNS.some((pattern) => lowerName.includes(pattern.toLowerCase()))
  );
}

async function main() {
  const stores = await prisma.store.findMany({
    where: {
      OR: [
        {
          website: {
            url: {
              in: PRIORITY_DOMAINS.map((domain) => `https://${domain}/`),
            },
          },
        },
        ...PRIORITY_NAME_PATTERNS.map((pattern) => ({
          name: { contains: pattern, mode: 'insensitive' as const },
        })),
        ...PRIORITY_DOMAINS.map((domain) => ({
          website: {
            url: { contains: domain, mode: 'insensitive' as const },
          },
        })),
      ],
    },
    select: {
      name: true,
      brand: { select: { name: true } },
      website: {
        select: {
          url: true,
          provider: { select: { name: true } },
        },
      },
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
    orderBy: [{ name: 'asc' }],
  });

  const groups = new Map<string, GroupRow>();

  for (const store of stores) {
    const site = normalizeText(store.website?.url);
    if (!isPriorityStore({ name: store.name, site })) continue;

    const key = inferGroupKey(site, store.name);
    const existing = groups.get(key) || {
      groupName: store.name,
      site: site || '-',
      provider: normalizeText(store.website?.provider?.name) || '-',
      brands: [],
      stores: [],
      contacts: [],
    };

    if (store.brand?.name && !existing.brands.includes(store.brand.name)) {
      existing.brands.push(store.brand.name);
    }
    if (!existing.stores.includes(store.name)) {
      existing.stores.push(store.name);
    }

    for (const partner of store.partners) {
      existing.contacts.push({
        nome: normalizeText(partner.nome),
        cargo: normalizeText(partner.qualificacao) || '-',
        email: normalizeText(partner.email) || '-',
        telefone: normalizeText(partner.phone) || '-',
        linkedin: normalizeText(partner.linkedinUrl) || '-',
        source: normalizeText(partner.source) || '-',
        apolloHasPhone:
          partner.apolloHasPhone === null || partner.apolloHasPhone === undefined
            ? '-'
            : partner.apolloHasPhone
              ? 'sim'
              : 'nao',
        storeName: store.name,
      });
    }

    groups.set(key, existing);
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Codex';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Grupos Prioritarios', {
    properties: { outlineLevelRow: 1 },
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet.columns = [
    { header: 'Grupo', key: 'grupo', width: 34 },
    { header: 'Site', key: 'site', width: 34 },
    { header: 'Provedor', key: 'provedor', width: 20 },
    { header: 'Marcas', key: 'marcas', width: 18 },
    { header: 'Lojas', key: 'lojas', width: 10 },
    { header: 'Contatos', key: 'contatos', width: 10 },
    { header: 'Com Telefone', key: 'comTelefone', width: 14 },
    { header: 'Nome', key: 'nome', width: 28 },
    { header: 'Cargo', key: 'cargo', width: 28 },
    { header: 'Email', key: 'email', width: 30 },
    { header: 'Telefone', key: 'telefone', width: 24 },
    { header: 'LinkedIn', key: 'linkedin', width: 40 },
    { header: 'Origem', key: 'origem', width: 12 },
    { header: 'Apollo Has Phone', key: 'apolloHasPhone', width: 16 },
    { header: 'Store', key: 'store', width: 32 },
  ];

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1F4E78' },
  };
  header.alignment = { vertical: 'middle', horizontal: 'center' };

  const orderedGroups = [...groups.values()]
    .map((group) => {
      const deduped = new Map<string, ContactRow>();

      for (const contact of group.contacts) {
        const key = dedupeContactKey(contact);
        const previous = deduped.get(key);
        if (!previous) {
          deduped.set(key, contact);
          continue;
        }

        const previousHasPhone = previous.telefone !== '-';
        const currentHasPhone = contact.telefone !== '-';
        if (!previousHasPhone && currentHasPhone) {
          deduped.set(key, contact);
        }
      }

      return {
        ...group,
        brands: group.brands.sort(),
        stores: group.stores.sort(),
        contacts: [...deduped.values()].sort((a, b) => {
          if (a.telefone === b.telefone) return a.nome.localeCompare(b.nome);
          return a.telefone === '-' ? 1 : -1;
        }),
      };
    })
    .sort((a, b) => a.groupName.localeCompare(b.groupName));

  for (const group of orderedGroups) {
    const contactsWithPhone = group.contacts.filter((contact) => contact.telefone !== '-').length;

    const groupRow = sheet.addRow({
      grupo: group.groupName,
      site: group.site,
      provedor: group.provider,
      marcas: group.brands.join(', ') || '-',
      lojas: group.stores.length,
      contatos: group.contacts.length,
      comTelefone: contactsWithPhone,
    });

    groupRow.font = { bold: true };
    groupRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFEAF2F8' },
    };
    groupRow.alignment = { vertical: 'middle' };

    for (const contact of group.contacts) {
      const contactRow = sheet.addRow({
        nome: contact.nome,
        cargo: contact.cargo,
        email: contact.email,
        telefone: contact.telefone,
        linkedin: contact.linkedin,
        origem: contact.source,
        apolloHasPhone: contact.apolloHasPhone,
        store: contact.storeName,
      });

      contactRow.outlineLevel = 1;
      contactRow.hidden = true;
    }
  }

  sheet.autoFilter = 'A1:O1';

  for (let index = 2; index <= sheet.rowCount; index++) {
    const row = sheet.getRow(index);
    row.eachCell((cell) => {
      cell.alignment = { vertical: 'top', wrapText: true };
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FFD9E2F3' } },
      };
    });
  }

  const outputPath = 'grupos-prioritarios-contatos.xlsx';
  await workbook.xlsx.writeFile(outputPath);

  console.log(
    JSON.stringify(
      {
        outputPath,
        totalGroups: orderedGroups.length,
        totalContacts: orderedGroups.reduce((sum, group) => sum + group.contacts.length, 0),
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

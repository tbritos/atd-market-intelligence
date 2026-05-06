import ExcelJS from 'exceljs';
import { PrismaClient, Region } from '@prisma/client';

const prisma = new PrismaClient();

type Classification = 'relevante' | 'cinza' | 'irrelevante';

type ExportContact = {
  nome: string;
  cargo: string;
  email: string;
  telefone: string;
  linkedin: string;
  source: string;
  apolloHasPhone: string;
  decisor: string;
  lojas: string[];
  classificacao: Classification;
};

type ExportGroup = {
  grupo: string;
  domain: string;
  marcas: string[];
  estados: string[];
  regioes: Region[];
  site: string;
  provedor: string;
  lojas: string[];
  contatos: ExportContact[];
  totalContatos: number;
  decisores: number;
  comLinkedin: number;
  comEmail: number;
  comPhone: number;
  comHasPhone: number;
  score: number;
};

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

async function buildGroups(allowed: Set<Classification>): Promise<ExportGroup[]> {
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
      domain: string;
      marcas: Set<string>;
      estados: Set<string>;
      regioes: Set<Region>;
      site: string;
      provedor: string;
      lojas: Set<string>;
      contatosMap: Map<
        string,
        {
          nome: string;
          cargo: string;
          email: string;
          telefone: string;
          linkedin: string;
          source: string;
          apolloHasPhone: boolean;
          decisor: boolean;
          classificacao: Classification;
          lojas: Set<string>;
        }
      >;
    }
  >();

  for (const store of stores) {
    const domain = extractDomain(store.website?.url ?? null) ?? `sem-site-${store.id}`;

    if (!groups.has(domain)) {
      groups.set(domain, {
        domain,
        marcas: new Set<string>(),
        estados: new Set<string>(),
        regioes: new Set<Region>(),
        site: store.website?.url ?? '',
        provedor: store.website?.provider?.name ?? '',
        lojas: new Set<string>(),
        contatosMap: new Map(),
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
      if (!allowed.has(classificacao)) continue;

      if (!group.contatosMap.has(key)) {
        group.contatosMap.set(key, {
          nome: partner.nome ?? '',
          cargo: partner.qualificacao ?? '',
          email: partner.email ?? '',
          telefone: partner.phone ?? '',
          linkedin: partner.linkedinUrl ?? '',
          source: partner.source ?? '',
          apolloHasPhone: !!partner.apolloHasPhone,
          decisor: isDecisionMaker(partner.qualificacao),
          classificacao,
          lojas: new Set<string>([store.name]),
        });
        continue;
      }

      const existing = group.contatosMap.get(key)!;
      if (!existing.telefone && partner.phone) existing.telefone = partner.phone;
      if (!existing.email && partner.email) existing.email = partner.email;
      if (!existing.linkedin && partner.linkedinUrl) existing.linkedin = partner.linkedinUrl;
      if (!existing.source && partner.source) existing.source = partner.source;
      if (partner.apolloHasPhone) existing.apolloHasPhone = true;
      if (isDecisionMaker(partner.qualificacao)) existing.decisor = true;
      existing.lojas.add(store.name);
    }
  }

  return Array.from(groups.values())
    .map((group) => {
      const contatos: ExportContact[] = Array.from(group.contatosMap.values())
        .map((contact) => ({
          nome: contact.nome || '-',
          cargo: contact.cargo || '-',
          email: contact.email || '-',
          telefone: contact.telefone || '-',
          linkedin: contact.linkedin || '-',
          source: contact.source || '-',
          apolloHasPhone: contact.apolloHasPhone ? 'sim' : 'nao',
          decisor: contact.decisor ? 'sim' : 'nao',
          classificacao: contact.classificacao,
          lojas: Array.from(contact.lojas).sort(),
        }))
        .sort((a, b) => {
          if (a.decisor !== b.decisor) return a.decisor === 'sim' ? -1 : 1;
          if (a.classificacao !== b.classificacao) return a.classificacao.localeCompare(b.classificacao);
          if (a.telefone !== b.telefone) return a.telefone === '-' ? 1 : -1;
          return a.nome.localeCompare(b.nome);
        });

      const decisores = contatos.filter((contact) => contact.decisor === 'sim').length;
      const comLinkedin = contatos.filter((contact) => contact.linkedin !== '-').length;
      const comEmail = contatos.filter((contact) => contact.email !== '-').length;
      const comPhone = contatos.filter((contact) => contact.telefone !== '-').length;
      const comHasPhone = contatos.filter((contact) => contact.apolloHasPhone === 'sim').length;

      let score = 0;
      score += contatos.length * 3;
      score += decisores * 4;
      score += comEmail * 4;
      score += comLinkedin * 3;
      score += comPhone * 10;
      score += comHasPhone * 5;

      return {
        grupo: normalizeGroupName(Array.from(group.lojas)[0], group.domain),
        domain: group.domain,
        marcas: Array.from(group.marcas).sort(),
        estados: Array.from(group.estados).sort(),
        regioes: Array.from(group.regioes).sort(),
        site: group.site || '-',
        provedor: group.provedor || '-',
        lojas: Array.from(group.lojas).sort(),
        contatos,
        totalContatos: contatos.length,
        decisores,
        comLinkedin,
        comEmail,
        comPhone,
        comHasPhone,
        score,
      };
    })
    .filter((group) => group.totalContatos > 0)
    .sort((a, b) => b.score - a.score);
}

async function writeWorkbook(outputPath: string, title: string, groups: ExportGroup[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Codex';
  workbook.created = new Date();

  const resumoSheet = workbook.addWorksheet('Resumo');
  resumoSheet.columns = [
    { header: 'Metrica', key: 'metrica', width: 28 },
    { header: 'Valor', key: 'valor', width: 18 },
  ];
  resumoSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  resumoSheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1F4E78' },
  };

  const resumoRows = [
    ['Arquivo', title],
    ['Total de grupos', groups.length],
    ['Total de contatos', groups.reduce((sum, group) => sum + group.totalContatos, 0)],
    ['Total de lojas', groups.reduce((sum, group) => sum + group.lojas.length, 0)],
    ['Contatos com telefone', groups.reduce((sum, group) => sum + group.comPhone, 0)],
    ['Contatos com email', groups.reduce((sum, group) => sum + group.comEmail, 0)],
    ['Contatos com LinkedIn', groups.reduce((sum, group) => sum + group.comLinkedin, 0)],
    ['Contatos decisores', groups.reduce((sum, group) => sum + group.decisores, 0)],
  ];
  for (const [metrica, valor] of resumoRows) {
    resumoSheet.addRow({ metrica, valor });
  }

  const sheet = workbook.addWorksheet('Base Leads SDR', {
    properties: { outlineLevelRow: 1 },
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet.columns = [
    { header: 'Grupo', key: 'grupo', width: 34 },
    { header: 'Dominio', key: 'domain', width: 28 },
    { header: 'Site', key: 'site', width: 34 },
    { header: 'Provedor', key: 'provedor', width: 20 },
    { header: 'Marcas', key: 'marcas', width: 18 },
    { header: 'Estados', key: 'estados', width: 14 },
    { header: 'Regioes', key: 'regioes', width: 16 },
    { header: 'Lojas', key: 'lojas', width: 10 },
    { header: 'Contatos', key: 'contatos', width: 10 },
    { header: 'Decisores', key: 'decisores', width: 10 },
    { header: 'Com Email', key: 'comEmail', width: 11 },
    { header: 'Com LinkedIn', key: 'comLinkedin', width: 13 },
    { header: 'Com Telefone', key: 'comPhone', width: 13 },
    { header: 'Apollo Has Phone', key: 'comHasPhone', width: 16 },
    { header: 'Score', key: 'score', width: 10 },
    { header: 'Nome', key: 'nome', width: 28 },
    { header: 'Cargo', key: 'cargo', width: 28 },
    { header: 'Email', key: 'email', width: 30 },
    { header: 'Telefone', key: 'telefone', width: 24 },
    { header: 'LinkedIn', key: 'linkedin', width: 40 },
    { header: 'Origem', key: 'origem', width: 12 },
    { header: 'Decisor?', key: 'decisor', width: 10 },
    { header: 'Apollo?', key: 'apolloHasPhoneContato', width: 10 },
    { header: 'Classificacao', key: 'classificacao', width: 14 },
    { header: 'Lojas do Contato', key: 'lojasContato', width: 42 },
  ];

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1F4E78' },
  };
  header.alignment = { vertical: 'middle', horizontal: 'center' };

  for (const group of groups) {
    const groupRow = sheet.addRow({
      grupo: group.grupo,
      domain: group.domain,
      site: group.site,
      provedor: group.provedor,
      marcas: group.marcas.join(', ') || '-',
      estados: group.estados.join(', ') || '-',
      regioes: group.regioes.join(', ') || '-',
      lojas: group.lojas.length,
      contatos: group.totalContatos,
      decisores: group.decisores,
      comEmail: group.comEmail,
      comLinkedin: group.comLinkedin,
      comPhone: group.comPhone,
      comHasPhone: group.comHasPhone,
      score: group.score,
    });

    groupRow.font = { bold: true };
    groupRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFEAF2F8' },
    };

    for (const contact of group.contatos) {
      const contactRow = sheet.addRow({
        nome: contact.nome,
        cargo: contact.cargo,
        email: contact.email,
        telefone: contact.telefone,
        linkedin: contact.linkedin,
        origem: contact.source,
        decisor: contact.decisor,
        apolloHasPhoneContato: contact.apolloHasPhone,
        classificacao: contact.classificacao,
        lojasContato: contact.lojas.join(' | '),
      });

      contactRow.outlineLevel = 1;
      contactRow.hidden = true;
    }
  }

  sheet.autoFilter = 'A1:Y1';

  for (let index = 2; index <= sheet.rowCount; index++) {
    const row = sheet.getRow(index);
    row.eachCell((cell) => {
      cell.alignment = { vertical: 'top', wrapText: true };
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FFD9E2F3' } },
      };
    });
  }

  await workbook.xlsx.writeFile(outputPath);
}

async function main() {
  const cleaned = await buildGroups(new Set<Classification>(['relevante', 'cinza']));
  const premium = await buildGroups(new Set<Classification>(['relevante']));

  await writeWorkbook('base-leads-sdr-limpa.xlsx', 'Sem cargos claramente ruins', cleaned);
  await writeWorkbook('base-leads-sdr-premium.xlsx', 'So cargos relevantes', premium);

  console.log(
    JSON.stringify(
      {
        cleaned: {
          outputPath: 'base-leads-sdr-limpa.xlsx',
          totalGroups: cleaned.length,
          totalContacts: cleaned.reduce((sum, group) => sum + group.totalContatos, 0),
        },
        premium: {
          outputPath: 'base-leads-sdr-premium.xlsx',
          totalGroups: premium.length,
          totalContacts: premium.reduce((sum, group) => sum + group.totalContatos, 0),
        },
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

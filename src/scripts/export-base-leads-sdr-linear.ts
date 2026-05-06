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
      marcas: Set<string>;
      estados: Set<string>;
      regioes: Set<string>;
      site: string;
      provedor: string;
      lojas: Set<string>;
      contatos: Map<
        string,
        {
          nome: string;
          cargo: string;
          email: string;
          telefone: string;
          linkedin: string;
          origem: string;
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
        grupo: normalizeGroupName(store.name, domain),
        domain,
        marcas: new Set<string>(),
        estados: new Set<string>(),
        regioes: new Set<string>(),
        site: store.website?.url ?? '',
        provedor: store.website?.provider?.name ?? '',
        lojas: new Set<string>(),
        contatos: new Map(),
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

      if (!group.contatos.has(key)) {
        group.contatos.set(key, {
          nome: partner.nome ?? '',
          cargo: partner.qualificacao ?? '',
          email: partner.email ?? '',
          telefone: partner.phone ?? '',
          linkedin: partner.linkedinUrl ?? '',
          origem: partner.source ?? '',
          apolloHasPhone: !!partner.apolloHasPhone,
          decisor: isDecisionMaker(partner.qualificacao),
          classificacao,
          lojas: new Set<string>([store.name]),
        });
        continue;
      }

      const existing = group.contatos.get(key)!;
      if (!existing.telefone && partner.phone) existing.telefone = partner.phone;
      if (!existing.email && partner.email) existing.email = partner.email;
      if (!existing.linkedin && partner.linkedinUrl) existing.linkedin = partner.linkedinUrl;
      if (!existing.origem && partner.source) existing.origem = partner.source;
      if (partner.apolloHasPhone) existing.apolloHasPhone = true;
      if (isDecisionMaker(partner.qualificacao)) existing.decisor = true;
      existing.lojas.add(store.name);
    }
  }

  const rows = Array.from(groups.values())
    .flatMap((group) => {
      const contatos = Array.from(group.contatos.values());
      const totalContatosGrupo = contatos.length;
      const contatosComTelefoneGrupo = contatos.filter((contact) => contact.telefone).length;

      return contatos.map((contact) => ({
        grupo: group.grupo,
        dominio: group.domain,
        site: group.site || '',
        provedor: group.provedor || '',
        marcas: Array.from(group.marcas).sort().join(', '),
        estados: Array.from(group.estados).sort().join(', '),
        regioes: Array.from(group.regioes).sort().join(', '),
        qtdLojasGrupo: group.lojas.size,
        lojasGrupo: Array.from(group.lojas).sort().join(' | '),
        qtdContatosGrupo: totalContatosGrupo,
        qtdTelefonesGrupo: contatosComTelefoneGrupo,
        nome: contact.nome || '',
        cargo: contact.cargo || '',
        email: contact.email || '',
        telefone: contact.telefone || '',
        linkedin: contact.linkedin || '',
        origem: contact.origem || '',
        decisor: contact.decisor ? 'sim' : 'nao',
        apolloHasPhone: contact.apolloHasPhone ? 'sim' : 'nao',
        classificacao: contact.classificacao,
        lojasContato: Array.from(contact.lojas).sort().join(' | '),
      }));
    })
    .sort((a, b) => {
      const groupCompare = a.grupo.localeCompare(b.grupo);
      if (groupCompare !== 0) return groupCompare;
      if (a.decisor !== b.decisor) return a.decisor === 'sim' ? -1 : 1;
      if (a.telefone !== b.telefone) return a.telefone ? -1 : 1;
      return a.nome.localeCompare(b.nome);
    });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Codex';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Lista Linear SDR', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet.columns = [
    { header: 'Grupo', key: 'grupo', width: 34 },
    { header: 'Dominio', key: 'dominio', width: 28 },
    { header: 'Site', key: 'site', width: 34 },
    { header: 'Provedor', key: 'provedor', width: 20 },
    { header: 'Marcas', key: 'marcas', width: 18 },
    { header: 'Estados', key: 'estados', width: 14 },
    { header: 'Regioes', key: 'regioes', width: 16 },
    { header: 'Qtd Lojas Grupo', key: 'qtdLojasGrupo', width: 16 },
    { header: 'Lojas Grupo', key: 'lojasGrupo', width: 45 },
    { header: 'Qtd Contatos Grupo', key: 'qtdContatosGrupo', width: 18 },
    { header: 'Qtd Telefones Grupo', key: 'qtdTelefonesGrupo', width: 19 },
    { header: 'Nome', key: 'nome', width: 28 },
    { header: 'Cargo', key: 'cargo', width: 28 },
    { header: 'Email', key: 'email', width: 30 },
    { header: 'Telefone', key: 'telefone', width: 24 },
    { header: 'LinkedIn', key: 'linkedin', width: 40 },
    { header: 'Origem', key: 'origem', width: 12 },
    { header: 'Decisor?', key: 'decisor', width: 10 },
    { header: 'Apollo?', key: 'apolloHasPhone', width: 10 },
    { header: 'Classificacao', key: 'classificacao', width: 14 },
    { header: 'Lojas do Contato', key: 'lojasContato', width: 45 },
  ];

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1F4E78' },
  };
  header.alignment = { vertical: 'middle', horizontal: 'center' };

  for (const row of rows) {
    sheet.addRow(row);
  }

  sheet.autoFilter = 'A1:U1';

  for (let index = 2; index <= sheet.rowCount; index++) {
    const row = sheet.getRow(index);
    row.hidden = false;
    row.outlineLevel = 0;
    row.eachCell((cell) => {
      cell.alignment = { vertical: 'top', wrapText: true };
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FFD9E2F3' } },
      };
    });
  }

  const outputPath = 'base-leads-sdr-lista-linear-limpa.xlsx';
  await workbook.xlsx.writeFile(outputPath);

  console.log(
    JSON.stringify(
      {
        outputPath,
        totalRows: rows.length,
        totalGroups: new Set(rows.map((row) => row.dominio)).size,
        withPhone: rows.filter((row) => row.telefone).length,
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

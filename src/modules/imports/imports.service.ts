import prisma from '../../utils/prisma';

// Campos do Store que podem ser importados via planilha
// Campos com special=true têm lógica própria de persistência (relações)
export const IMPORTABLE_FIELDS: Record<string, { label: string; type: 'string' | 'number' | 'date'; special?: boolean }> = {
  csResponsavel:     { label: 'CS Responsável',        type: 'string' },
  contactName:       { label: 'Nome do Contato',      type: 'string' },
  contactLastName:   { label: 'Sobrenome do Contato', type: 'string' },
  contactRole:       { label: 'Cargo',                type: 'string' },
  contactEmail:      { label: 'Email do Contato',     type: 'string' },
  contactPhone:      { label: 'Telefone do Contato',  type: 'string' },
  email:             { label: 'Email (empresa)',       type: 'string' },
  phone:             { label: 'Telefone (empresa)',    type: 'string' },
  whatsapp:          { label: 'WhatsApp',              type: 'string' },
  instagram:         { label: 'Instagram',             type: 'string' },
  facebook:          { label: 'Facebook',              type: 'string' },
  linkedin:          { label: 'LinkedIn',              type: 'string' },
  cnpj:              { label: 'CNPJ',                  type: 'string' },
  nomeFantasia:      { label: 'Nome Fantasia/Empresa', type: 'string' },
  websiteUrl:        { label: 'Site (URL)',             type: 'string', special: true },
  brandName:         { label: 'Marca',                 type: 'string', special: true },
};

export type MatchStrategy = 'email' | 'domain' | 'cnpj' | 'empresa';

export interface ImportColumn {
  csvColumn: string;       // nome da coluna no CSV
  storeField: string;      // campo no banco
}

export interface ImportRow {
  [key: string]: string;
}

export interface ImportPreviewResult {
  totalRows: number;
  matchedRows: number;
  fieldsToUpdate: number;
  preview: {
    empresa: string;
    matchMethod: string;
    updates: { field: string; label: string; oldValue: string | null; newValue: string }[];
  }[];
}

export class ImportsService {

  async preview(
    rows: ImportRow[],
    columnMapping: ImportColumn[],
    matchStrategies: MatchStrategy[],
    filename: string,
  ): Promise<ImportPreviewResult> {
    const { matchedStores } = await this.matchRows(rows, columnMapping, matchStrategies);

    let fieldsToUpdate = 0;
    const preview = [];

    for (const { store, row } of matchedStores.slice(0, 20)) {
      const updates = this.computeUpdates(store, row, columnMapping);
      fieldsToUpdate += updates.length;
      if (updates.length > 0) {
        preview.push({
          empresa: store.nomeFantasia || store.name,
          matchMethod: (row as any).__matchMethod,
          updates,
        });
      }
    }

    return {
      totalRows: rows.length,
      matchedRows: matchedStores.length,
      fieldsToUpdate,
      preview,
    };
  }

  async execute(
    rows: ImportRow[],
    columnMapping: ImportColumn[],
    matchStrategies: MatchStrategy[],
    filename: string,
    source: string,
    marcarComoCliente = false,
  ) {
    const { matchedStores, unmatchedRows } = await this.matchRows(rows, columnMapping, matchStrategies);

    const importJob = await prisma.importJob.create({
      data: {
        filename,
        source,
        totalRows: rows.length,
        matchedRows: matchedStores.length,
        updatedRows: 0,
        skippedRows: unmatchedRows,
      },
    });

    let updatedRows = 0;
    let updatedFields = 0;
    let marcadosCliente = 0;

    for (const { store, row } of matchedStores) {
      const updates = this.computeUpdates(store, row, columnMapping);

      // Separa campos diretos dos campos especiais (relações)
      const directUpdates = updates.filter(u => !IMPORTABLE_FIELDS[u.field]?.special);
      const specialUpdates = updates.filter(u => IMPORTABLE_FIELDS[u.field]?.special);

      // Atualiza campos diretos + marca como cliente se solicitado
      const directData: Record<string, any> = {};
      for (const u of directUpdates) directData[u.field] = u.newValue;
      if (marcarComoCliente && !store.clienteAutoforce) {
        directData.clienteAutoforce = true;
        marcadosCliente++;
      }
      if (Object.keys(directData).length) {
        await prisma.store.update({ where: { id: store.id }, data: directData });
      }

      // Trata campos especiais
      for (const u of specialUpdates) {
        if (u.field === 'websiteUrl') {
          await this.linkWebsite(store.id, u.newValue);
        } else if (u.field === 'brandName') {
          await this.linkBrand(store.id, u.newValue);
        }
      }

      if (updates.length) {
        await prisma.importUpdate.createMany({
          data: updates.map(u => ({
            importJobId: importJob.id,
            storeId: store.id,
            field: u.field,
            oldValue: u.oldValue,
            newValue: u.newValue,
          })),
        });

        updatedRows++;
        updatedFields += updates.length;
      }
    }

    await prisma.importJob.update({
      where: { id: importJob.id },
      data: { updatedRows },
    });

    return {
      jobId: importJob.id,
      totalRows: rows.length,
      matchedRows: matchedStores.length,
      updatedRows,
      updatedFields,
      unmatchedRows,
      marcadosCliente,
    };
  }

  async listJobs() {
    return prisma.importJob.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { updates: true } } },
    });
  }

  async getJob(id: string) {
    return prisma.importJob.findUnique({
      where: { id },
      include: {
        updates: {
          include: { store: { select: { id: true, name: true, nomeFantasia: true } } },
          orderBy: { createdAt: 'desc' },
          take: 100,
        },
      },
    });
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private async linkWebsite(storeId: string, rawUrl: string) {
    let url = rawUrl.trim();
    if (!url.startsWith('http')) url = 'https://' + url;
    url = url.replace(/\/$/, '');

    // Websites exigem brandId — só vincula se já existir no banco
    const website = await prisma.website.findFirst({
      where: {
        OR: [
          { url: { equals: url } },
          { url: { contains: url.replace(/^https?:\/\//, '') } },
        ],
      },
      select: { id: true },
    });
    if (website) {
      await prisma.store.update({ where: { id: storeId }, data: { websiteId: website.id } });
    }
  }

  private async linkBrand(storeId: string, brandName: string) {
    const name = brandName.trim();
    const brand = await prisma.brand.findFirst({
      where: {
        OR: [
          { name: { equals: name, mode: 'insensitive' } },
          { slug: { equals: name.toLowerCase().replace(/\s+/g, '-') } },
        ],
      },
      select: { id: true },
    });
    if (brand) {
      await prisma.store.update({ where: { id: storeId }, data: { brandId: brand.id } });
    }
  }

  private async matchRows(rows: ImportRow[], columnMapping: ImportColumn[], strategies: MatchStrategy[]) {
    const SELECT = {
      id: true, name: true, nomeFantasia: true,
      contactName: true, contactLastName: true, contactRole: true, contactEmail: true, contactPhone: true,
      email: true, phone: true, whatsapp: true, instagram: true, facebook: true, linkedin: true,
      cnpj: true, emailReceita: true,
      websiteId: true, brandId: true,
      clienteAutoforce: true,
    };

    const emailCol = columnMapping.find(c => c.storeField === 'contactEmail' || c.storeField === 'email')?.csvColumn;
    const cnpjCol = columnMapping.find(c => c.storeField === 'cnpj')?.csvColumn;
    const empresaCol = columnMapping.find(c => ['nomeFantasia', 'empresa'].includes(c.csvColumn.toLowerCase()))?.csvColumn
      || Object.keys(rows[0] || {}).find(k => k.toLowerCase().includes('empresa'));

    // Coleta valores únicos para queries em lote
    const emails = [...new Set(rows.map(r => emailCol ? r[emailCol] : '').filter(Boolean))];
    const domains = [...new Set(rows.map(r => emailCol && r[emailCol] ? r[emailCol].split('@')[1] : '').filter(Boolean))];
    const cnpjs = [...new Set(rows.map(r => cnpjCol ? r[cnpjCol]?.replace(/\D/g, '') : '').filter(Boolean))];

    const byEmail = emails.length ? await prisma.store.findMany({
      where: { OR: [{ emailReceita: { in: emails } }, { email: { in: emails } }, { contactEmail: { in: emails } }] },
      select: SELECT,
    }) : [];

    const byDomain = domains.length ? await prisma.store.findMany({
      where: { website: { OR: domains.map(d => ({ url: { contains: d } })) } },
      select: SELECT,
    }) : [];

    const byCnpj = cnpjs.length ? await prisma.store.findMany({
      where: { cnpj: { in: cnpjs } },
      select: SELECT,
    }) : [];

    // Maps
    const emailMap = new Map<string, any>();
    for (const s of byEmail) {
      if (s.emailReceita) emailMap.set(s.emailReceita.toLowerCase(), s);
      if (s.email) emailMap.set(s.email.toLowerCase(), s);
      if (s.contactEmail) emailMap.set(s.contactEmail.toLowerCase(), s);
    }
    const domainMap = new Map<string, any>();
    for (const s of byDomain) {
      for (const d of domains) {
        if ((s as any).website?.url?.includes(d) && !domainMap.has(d)) domainMap.set(d, s);
      }
    }
    const cnpjMap = new Map<string, any>();
    for (const s of byCnpj) {
      if (s.cnpj) cnpjMap.set(s.cnpj.replace(/\D/g, ''), s);
    }

    const matchedStores: { store: any; row: ImportRow }[] = [];
    let unmatchedRows = 0;

    for (const row of rows) {
      let store: any = null;
      let matchMethod = '';

      const email = emailCol ? row[emailCol] : '';
      const domain = email ? email.split('@')[1] : '';
      const cnpj = cnpjCol ? row[cnpjCol]?.replace(/\D/g, '') : '';

      if (strategies.includes('email') && email) {
        store = emailMap.get(email.toLowerCase());
        if (store) matchMethod = 'email';
      }
      if (!store && strategies.includes('domain') && domain) {
        store = domainMap.get(domain);
        if (store) matchMethod = 'dominio';
      }
      if (!store && strategies.includes('cnpj') && cnpj) {
        store = cnpjMap.get(cnpj);
        if (store) matchMethod = 'cnpj';
      }
      if (!store && strategies.includes('empresa') && empresaCol && row[empresaCol]) {
        const term = row[empresaCol].trim();
        if (term.length > 3) {
          store = await prisma.store.findFirst({
            where: { OR: [
              { nomeFantasia: { contains: term, mode: 'insensitive' } },
              { name: { contains: term, mode: 'insensitive' } },
            ]},
            select: SELECT,
          });
          if (store) matchMethod = 'empresa';
        }
      }

      if (store) {
        (row as any).__matchMethod = matchMethod;
        matchedStores.push({ store, row });
      } else {
        unmatchedRows++;
      }
    }

    return { matchedStores, unmatchedRows };
  }

  private computeUpdates(store: any, row: ImportRow, columnMapping: ImportColumn[]) {
    const updates: { field: string; label: string; oldValue: string | null; newValue: string }[] = [];

    for (const { csvColumn, storeField } of columnMapping) {
      const fieldDef = IMPORTABLE_FIELDS[storeField];
      if (!fieldDef) continue;
      const newValue = row[csvColumn]?.trim();
      if (!newValue) continue;

      if (storeField === 'websiteUrl') {
        // Só adiciona se a loja ainda não tem site
        if (store.websiteId) continue;
        updates.push({ field: storeField, label: fieldDef.label, oldValue: null, newValue });
      } else if (storeField === 'brandName') {
        // Só adiciona se a loja ainda não tem marca
        if (store.brandId) continue;
        updates.push({ field: storeField, label: fieldDef.label, oldValue: null, newValue });
      } else {
        const oldValue = store[storeField] ?? null;
        // Não sobrescreve dados existentes
        if (oldValue) continue;
        updates.push({ field: storeField, label: fieldDef.label, oldValue, newValue });
      }
    }

    return updates;
  }
}

export const importsService = new ImportsService();

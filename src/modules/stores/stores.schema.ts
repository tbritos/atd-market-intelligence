import { z } from 'zod';

export const listStoresSchema = z.object({
  body: z.object({}),
  params: z.object({}),
  query: z.object({
    page: z.string().regex(/^\d+$/).transform(Number).optional().describe('Page number (starts from 1)'),
    limit: z.string().regex(/^\d+$/).transform(Number).optional().describe('Number of items per page (max 1000)'),
    all: z.string().transform(val => val === 'true').optional().describe('Return all records without pagination'),
    brandId: z.string().uuid().optional().describe('Filter by brand ID'),
    stateId: z.string().uuid().optional().describe('Filter by state ID'),
    cityId: z.string().uuid().optional().describe('Filter by city ID'),
    groupId: z.string().uuid().optional().describe('Filter by group ID'),
    isActive: z.string().transform(val => val === 'true').optional().describe('Filter by active status'),
    // Novos filtros
    search: z.string().optional().describe('Busca por nome, CNPJ ou razão social'),
    situacaoCadastral: z.string().optional().describe('Situação cadastral: ATIVA, BAIXADA, INAPTA, SUSPENSA'),
    cnaeCode: z.string().optional().describe('Código CNAE principal'),
    hasCnpj: z.string().transform(val => val === 'true').optional().describe('Filtrar apenas stores com CNPJ'),
    hasWebsite: z.string().transform(val => val === 'true').optional().describe('Filtrar apenas stores com website vinculado'),
    onlyQualified: z.string().transform(val => val === 'true').optional().describe('Filtrar stores com website, telefone e cidade'),
    discoverySource: z.string().optional().describe('Fonte de descoberta: google_maps, google_maps_sem_match, etc'),
    tipo: z.string().optional().describe('Tipo: Matriz ou Filial'),
    uf: z.string().optional().describe('Sigla do estado (ex: SP, RJ)'),
    withPartners: z.string().transform(val => val === 'true').optional().describe('Incluir sócios na resposta'),
  })
});

export type ListStoresRequest = z.infer<typeof listStoresSchema>['query'];

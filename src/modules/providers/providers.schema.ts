import { z } from 'zod';

export const listProvidersSchema = z.object({
  body: z.object({}),
  params: z.object({}),
  query: z.object({
    page: z.string().regex(/^\d+$/).transform(Number).optional().describe('Page number (starts from 1)'),
    limit: z.string().regex(/^\d+$/).transform(Number).optional().describe('Number of items per page (max 1000)'),
    search: z.string().optional().describe('Search in provider name'),
    sortBy: z.enum(['name', 'avgPerformanceScore', 'avgSeoScore', 'avgDowntimeSeconds']).optional().describe('Sort field'),
    sortOrder: z.enum(['asc', 'desc']).optional().describe('Sort order'),
  })
});

export const createProviderSchema = z.object({
  body: z.object({
    name: z.string().min(1).describe('Provider name'),
    slug: z.string().min(1).describe('Provider slug'),
  }),
  params: z.object({}),
  query: z.object({})
});

export const updateProviderSchema = z.object({
  body: z.object({
    name: z.string().min(1).optional().describe('Provider name'),
    slug: z.string().min(1).optional().describe('Provider slug'),
  }),
  params: z.object({
    id: z.string().uuid().describe('Provider ID'),
  }),
  query: z.object({})
});

export type ListProvidersRequest = z.infer<typeof listProvidersSchema>['query'];
export type CreateProviderRequest = z.infer<typeof createProviderSchema>['body'];
export type UpdateProviderRequest = z.infer<typeof updateProviderSchema>['body'];
export type UpdateProviderParams = z.infer<typeof updateProviderSchema>['params'];
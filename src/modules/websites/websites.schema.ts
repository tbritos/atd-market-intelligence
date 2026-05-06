import { z } from 'zod';

export const providerStatsSchema = z.object({
  body: z.object({}),
  params: z.object({}),
  query: z.object({
    includeInactive: z.string().transform(val => val === 'true').optional().describe('Include inactive websites in stats'),
  })
});

export const listWebsitesSchema = z.object({
  body: z.object({}),
  params: z.object({}),
  query: z.object({
    page: z.string().regex(/^\d+$/).transform(Number).optional().describe('Page number (starts from 1)'),
    limit: z.string().regex(/^\d+$/).transform(Number).optional().describe('Number of items per page (max 1000)'),
    brandId: z.string().uuid().optional().describe('Filter by brand ID'),
    providerId: z.string().uuid().optional().describe('Filter by provider ID'),
    search: z.string().optional().describe('Search in website URL'),
    sortBy: z.enum(['avgPerformanceScore', 'seoScore', 'downtimeSeconds', 'avgResponseTime']).optional().describe('Sort field'),
    sortOrder: z.enum(['asc', 'desc']).optional().describe('Sort order'),
  })
});

export const providerMetricsSchema = z.object({
  body: z.object({}),
  params: z.object({}),
  query: z.object({
    includeInactive: z.string().transform(val => val === 'true').optional().describe('Include inactive websites in metrics'),
  })
});

export const updateWebsiteSchema = z.object({
  body: z.object({
    url: z.string().url().optional().describe('Website URL'),
    providerId: z.string().uuid().nullable().optional().describe('Provider ID'),
    brandId: z.string().uuid().optional().describe('Brand ID'),
    isActive: z.boolean().optional().describe('Whether website is active'),
  }),
  params: z.object({
    id: z.string().uuid().describe('Website ID'),
  }),
  query: z.object({})
});

export const deleteWebsiteSchema = z.object({
  body: z.object({}),
  params: z.object({
    id: z.string().uuid().describe('Website ID'),
  }),
  query: z.object({})
});

export type ProviderStatsRequest = z.infer<typeof providerStatsSchema>['query'];
export type ListWebsitesRequest = z.infer<typeof listWebsitesSchema>['query'];
export type ProviderMetricsRequest = z.infer<typeof providerMetricsSchema>['query'];
export type UpdateWebsiteRequest = z.infer<typeof updateWebsiteSchema>['body'];
export type UpdateWebsiteParams = z.infer<typeof updateWebsiteSchema>['params'];
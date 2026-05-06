import { z } from 'zod';

export const listBrandsSchema = z.object({
  body: z.object({}),
  params: z.object({}),
  query: z.object({
    page: z.string().regex(/^\d+$/).transform(Number).optional().describe('Page number (starts from 1)'),
    limit: z.string().regex(/^\d+$/).transform(Number).optional().describe('Number of items per page (max 1000)'),
    sortBy: z.enum(['name', 'avgPerformanceScore', 'avgSeoScore', 'avgResponseTime', 'totalWebsites', 'activeWebsites']).optional().describe('Sort field'),
    sortOrder: z.enum(['asc', 'desc']).optional().describe('Sort order'),
    hasMetrics: z.string().transform(val => val === 'true').optional().describe('Filter brands that have metrics data'),
  })
});

export const createBrandSchema = z.object({
  body: z.object({
    name: z.string().min(1).describe('Brand name'),
    slug: z.string().min(1).describe('Brand slug'),
  }),
  params: z.object({}),
  query: z.object({})
});

export const pipedriveBrandGroupsSchema = z.object({
  body: z.object({}),
  params: z.object({
    id: z.string().uuid().describe('Brand ID'),
  }),
  query: z.object({
    limit: z.string().regex(/^\d+$/).transform(Number).optional().describe('Max groups to check in Pipedrive'),
    bucket: z.enum(['all', 'priority', 'review', 'single', 'generic']).optional().describe('Group bucket filter'),
    refresh: z.string().transform(val => val === 'true').optional().describe('Refresh from Pipedrive instead of using cache'),
  }),
});

export type ListBrandsRequest = z.infer<typeof listBrandsSchema>['query'];
export type CreateBrandRequest = z.infer<typeof createBrandSchema>['body'];
export type PipedriveBrandGroupsRequest = z.infer<typeof pipedriveBrandGroupsSchema>['query'];

import { z } from 'zod';

export const startSearchJobSchema = z.object({
  body: z.object({
    brandIds: z.array(z.string().uuid()).optional().describe('Array of brand IDs to search for. If not provided, will search all brands'),
    stateIds: z.array(z.string().uuid()).optional().describe('Array of state IDs to search in. If not provided, will search all states'),
  }),
  params: z.object({}),
  query: z.object({})
});

const discoverySourcesSchema = z.enum(['google_places', 'cnae', 'brand_site']);

export const startDealerDiscoverySchema = z.object({
  body: z.object({
    brandIds: z.array(z.string().uuid()).optional(),
    stateIds: z.array(z.string().uuid()).optional(),
    sources: z.array(discoverySourcesSchema).min(1).optional(),
    onlyMissing: z.boolean().optional(),
    allowPaidSources: z.boolean().optional(),
  }),
  params: z.object({}),
  query: z.object({})
});

export type StartSearchJobRequest = z.infer<typeof startSearchJobSchema>['body'];
export type StartDealerDiscoveryRequest = z.infer<typeof startDealerDiscoverySchema>['body'];

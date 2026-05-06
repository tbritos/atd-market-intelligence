import { z } from 'zod';

export const globalStatsSchema = z.object({
  body: z.object({}),
  params: z.object({}),
  query: z.object({
    includeInactive: z.string().transform(val => val === 'true').optional().describe('Include inactive websites and stores in calculations'),
  })
});

export type GlobalStatsRequest = z.infer<typeof globalStatsSchema>['query'];
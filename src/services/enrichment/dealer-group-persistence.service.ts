import prisma from '../../utils/prisma';
import { PipedriveGroupCacheEntry } from './pipedrive-group-cache.service';

function toQueue(queue: PipedriveGroupCacheEntry['enrichment']['queue']) {
  switch (queue) {
    case 'blocked_crm':
      return 'BLOCKED_CRM';
    case 'apollo_ready':
      return 'APOLLO_READY';
    case 'hunter_fallback':
      return 'HUNTER_FALLBACK';
    case 'review':
      return 'REVIEW';
  }
}

function toConfidence(confidence: PipedriveGroupCacheEntry['enrichment']['confidence']) {
  switch (confidence) {
    case 'high':
      return 'HIGH';
    case 'medium':
      return 'MEDIUM';
    case 'low':
      return 'LOW';
  }
}

function toCrmStatus(status: PipedriveGroupCacheEntry['pipedrive']['status']) {
  switch (status) {
    case 'cliente':
      return 'CLIENTE';
    case 'deal_ativo':
      return 'DEAL_ATIVO';
    case 'lead':
      return 'LEAD';
    case 'not_found':
      return 'NOT_FOUND';
  }
}

function toRunStatus(enabled: boolean) {
  return enabled ? 'COMPLETED' : 'SKIPPED';
}

type PersistRow = PipedriveGroupCacheEntry & {
  storeIds?: string[];
  storeCities?: (string | null)[];
};

class DealerGroupPersistenceService {
  async persistBrandGroups(brandId: string, rows: PersistRow[], options?: { recordRun?: boolean }) {
    for (const row of rows) {
      const dealerGroup = await prisma.dealerGroup.upsert({
        where: {
          brandId_domain: {
            brandId,
            domain: row.domain,
          },
        },
        create: {
          brandId,
          domain: row.domain,
          websiteUrl: row.websiteUrl,
          bucket: row.bucket,
          providerName: null,
          storeCount: row.stores,
          storesWithPhone: 0,
          states: row.states,
          cities: (row.storeCities ?? []).filter(Boolean),
          crmStatus: toCrmStatus(row.pipedrive.status),
          crmOrgId: row.pipedrive.orgId,
          crmOrgName: row.pipedrive.orgName,
          crmOrgWebsite: row.pipedrive.website,
          crmCity: row.pipedrive.city,
          crmDealId: row.pipedrive.dealId,
          crmDealStage: row.pipedrive.dealStage,
          crmOwnerName: row.pipedrive.responsavel,
          crmMatchedTerm: row.pipedrive.matchedTerm,
          lastPipedriveCheckAt: new Date(row.checkedAt),
          queue: toQueue(row.enrichment.queue),
          priorityScore: row.enrichment.priorityScore,
          confidence: toConfidence(row.enrichment.confidence),
          reasons: row.enrichment.reasons,
          apolloStatus: row.enrichment.apollo.shouldEnrich ? 'PENDING' : 'SKIPPED',
          apolloMode: row.enrichment.apollo.mode,
          apolloDomain: row.enrichment.apollo.domain,
          apolloOrgQueryTerms: row.enrichment.apollo.orgQueryTerms,
          apolloPeopleQueryTerms: row.enrichment.apollo.peopleQueryTerms,
          apolloTitleHints: row.enrichment.apollo.titleHints,
          hunterStatus: row.enrichment.hunter.shouldEnrich ? 'PENDING' : 'SKIPPED',
          hunterMode: row.enrichment.hunter.mode,
          hunterDomain: row.enrichment.hunter.domain,
          hunterFinderCandidates: row.enrichment.hunter.emailFinderCandidates,
          readyForSdr: false,
        },
        update: {
          websiteUrl: row.websiteUrl,
          bucket: row.bucket,
          storeCount: row.stores,
          states: row.states,
          cities: (row.storeCities ?? []).filter(Boolean),
          crmStatus: toCrmStatus(row.pipedrive.status),
          crmOrgId: row.pipedrive.orgId,
          crmOrgName: row.pipedrive.orgName,
          crmOrgWebsite: row.pipedrive.website,
          crmCity: row.pipedrive.city,
          crmDealId: row.pipedrive.dealId,
          crmDealStage: row.pipedrive.dealStage,
          crmOwnerName: row.pipedrive.responsavel,
          crmMatchedTerm: row.pipedrive.matchedTerm,
          lastPipedriveCheckAt: new Date(row.checkedAt),
          queue: toQueue(row.enrichment.queue),
          priorityScore: row.enrichment.priorityScore,
          confidence: toConfidence(row.enrichment.confidence),
          reasons: row.enrichment.reasons,
          apolloStatus: row.enrichment.apollo.shouldEnrich ? 'PENDING' : 'SKIPPED',
          apolloMode: row.enrichment.apollo.mode,
          apolloDomain: row.enrichment.apollo.domain,
          apolloOrgQueryTerms: row.enrichment.apollo.orgQueryTerms,
          apolloPeopleQueryTerms: row.enrichment.apollo.peopleQueryTerms,
          apolloTitleHints: row.enrichment.apollo.titleHints,
          hunterStatus: row.enrichment.hunter.shouldEnrich ? 'PENDING' : 'SKIPPED',
          hunterMode: row.enrichment.hunter.mode,
          hunterDomain: row.enrichment.hunter.domain,
          hunterFinderCandidates: row.enrichment.hunter.emailFinderCandidates,
        },
      });

      if (row.storeIds && row.storeIds.length > 0) {
        await prisma.store.updateMany({
          where: { id: { in: row.storeIds } },
          data: { dealerGroupId: dealerGroup.id },
        });
      }

      await prisma.dealerGroupContact.deleteMany({
        where: {
          dealerGroupId: dealerGroup.id,
          source: 'PIPEDRIVE',
        },
      });

      if (row.pipedrive.persons.length > 0) {
        await prisma.dealerGroupContact.createMany({
          data: row.pipedrive.persons.map((person) => ({
            dealerGroupId: dealerGroup.id,
            source: 'PIPEDRIVE',
            externalId: String(person.id),
            fullName: person.name,
            title: person.jobTitle,
            email: person.email,
            phone: person.phone,
            isDecisionMaker: Boolean(person.jobTitle),
            isPrimary: false,
            rawPayload: person,
          })),
          skipDuplicates: true,
        });
      }

      if (options?.recordRun) {
        await prisma.dealerGroupRun.create({
          data: {
            dealerGroupId: dealerGroup.id,
            source: 'PIPEDRIVE',
            status: toRunStatus(true),
            requestedAt: new Date(row.checkedAt),
            completedAt: new Date(row.checkedAt),
            responsePayload: row.pipedrive,
          },
        });
      }
    }
  }
}

export const dealerGroupPersistenceService = new DealerGroupPersistenceService();

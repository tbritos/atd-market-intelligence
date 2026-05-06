import prismaClient from '../utils/prisma';
import { storeEnrichmentService } from '../services/enrichment/store-enrichment.service';

const prisma = prismaClient as any;

const STORE_IDS = [
  '0a8927f2-7d08-41e9-9695-5d3faf7a3483',
  '74bf27df-a692-4e99-8506-79abd6b64082',
  '5c1fadc5-6e4b-4cec-a423-8a8fb127a0ee',
  '297a5f9d-005a-4616-95dd-9c78e8bae592',
  'd07613e3-c94c-4d50-9312-219a7f3f6edb',
  'c9d61d51-a886-44df-8142-290ae577dcdc',
  '947cf049-6d80-467e-96c4-e1718d9cdd98',
  'a0a6d25c-6b7c-41a6-9c08-7974f9fa6cb4',
  '39bbae70-4005-4aff-bf70-3a891629b2ba',
  '2fcd6859-1d82-468c-9a96-4219c0df1cbf',
  'ac1e1f8f-97a2-4791-ad51-72fb5d73c61e',
  'b9fcbb37-91e8-4233-b1a0-0cfdae86f718',
  '0e22d9d0-29c2-4f5c-902a-a44c19ade577',
  'b408bf0e-5125-4359-9636-2f546ebcbc30',
  'ef10ffdd-bc6b-4d8d-a6b4-3003a338af22',
  'cf2d227e-4140-444b-8f9f-b64e2c9a68d8',
  '0e0a1ba1-b627-4728-956b-a3ea5480ef0d',
  '2fa078a0-6635-40f2-87f0-d9d68e01551e',
  '1c57503d-5da5-4a6f-a7b3-dda4b264ee8d',
  '4cedff25-30dd-4d66-a651-0e82217a6ac2',
];

async function main() {
  const summary = {
    total: STORE_IDS.length,
    success: 0,
    withEmail: 0,
    withPhone: 0,
    noCoverage: 0,
    skipped: 0,
    error: 0,
    results: [] as any[],
  };

  for (const storeId of STORE_IDS) {
    try {
      const store = await prisma.store.findUniqueOrThrow({
        where: { id: storeId },
        select: {
          id: true,
          name: true,
          brand: { select: { name: true } },
          state: { select: { code: true } },
          website: { select: { url: true, provider: { select: { name: true } } } },
        },
      });

      const result = await storeEnrichmentService.enrichStore(storeId);
      const updated = await prisma.store.findUniqueOrThrow({
        where: { id: storeId },
        select: {
          enrichmentStatus: true,
          enrichmentError: true,
          contactName: true,
          contactRole: true,
          contactEmail: true,
          contactPhone: true,
          partners: {
            select: { nome: true, email: true, phone: true, linkedinUrl: true, source: true },
          },
        },
      });

      summary.success++;
      if (updated.contactEmail) summary.withEmail++;
      if (updated.contactPhone) summary.withPhone++;
      if (updated.enrichmentError === 'sem_cobertura') summary.noCoverage++;
      if (updated.enrichmentStatus === 'skipped') summary.skipped++;

      summary.results.push({
        id: store.id,
        name: store.name,
        brand: store.brand.name,
        state: store.state.code,
        provider: store.website?.provider?.name ?? null,
        website: store.website?.url ?? null,
        steps: result.steps,
        enrichmentStatus: updated.enrichmentStatus,
        enrichmentError: updated.enrichmentError,
        contactName: updated.contactName,
        contactRole: updated.contactRole,
        contactEmail: updated.contactEmail,
        contactPhone: updated.contactPhone,
        partnerEmails: updated.partners.filter((p: any) => !!p.email).length,
        partnerLinkedins: updated.partners.filter((p: any) => !!p.linkedinUrl).length,
      });
    } catch (err: any) {
      summary.error++;
      summary.results.push({
        id: storeId,
        status: 'error',
        error: err?.message ?? 'Erro desconhecido',
      });
    }
  }

  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

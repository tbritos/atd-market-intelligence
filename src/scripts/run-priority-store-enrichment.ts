import prismaClient from '../utils/prisma';
import { storeEnrichmentService } from '../services/enrichment/store-enrichment.service';

const prisma = prismaClient as any;

const STORE_IDS = [
  'b7e8862f-5e1f-46e6-ba12-6950acd22408',
  '39a19106-58d9-4af3-a6bb-60f280ec5276',
  '495bb573-6d4b-49b9-810c-694eb62ddd86',
  '6a39e92f-1f64-4f24-8e8b-3640fc1b6248',
  'e83e6d5c-502f-461c-8075-51aa0a1279c8',
  '19a1dc41-40e8-4935-82f8-f452fcac8f8b',
  'dd12a0b5-81a2-4ac3-9b6b-d6000658c5e6',
  '916a463c-1201-42c8-8557-babd6dc5b0f1',
  'ed74c550-b0e3-4bd5-afaa-a1b1f0682b4f',
  'ee20a116-e0aa-4c00-83fa-dfc770ab2e25',
  '40f1ec2c-6118-4ad9-a473-3a5d5791be31',
  '5b3426f6-529a-4815-9a3e-15784b3e1872',
  'e1a22098-5de2-4c06-9c4c-4142060f4548',
  '9bbbc2cc-7165-4a49-a2c3-3d7b29c502d7',
  '83428d4b-cc43-4e15-bac9-a6eecc897f15',
  '63fcdccb-ffc6-4e5f-acd4-b24d0f811bfa',
  'fe86bd03-5bf6-43f1-9402-2d0b1ebb5c18',
  '9f6ab8f0-b0aa-4544-8591-1e169806c4f2',
  '6e5558c9-6a8a-4dac-8993-9089c8b4dac3',
  '17a4ecd6-ca3b-4289-85a2-91b0292dbc7a',
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

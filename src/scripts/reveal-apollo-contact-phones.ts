import axios from 'axios';
import prismaClient from '../utils/prisma';

const prisma = prismaClient as any;

const APOLLO_API_KEY = process.env.APOLLO_API_KEY ?? null;
const APOLLO_BASE = 'https://api.apollo.io/api/v1';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pickBestApolloPhone(person: any): string | null {
  const phoneNumbers: any[] = person?.phone_numbers ?? [];
  const preferred =
    phoneNumbers.find((phone) => phone?.type === 'mobile') ??
    phoneNumbers.find((phone) => phone?.sanitized_number || phone?.number) ??
    null;

  return preferred?.sanitized_number ?? preferred?.number ?? null;
}

async function main() {
  if (!APOLLO_API_KEY) {
    throw new Error('APOLLO_API_KEY não configurada');
  }

  const requested = Number(process.argv[2] ?? 20);
  const limit = Number.isFinite(requested) && requested > 0 ? Math.min(requested, 100) : 20;

  const candidates = await prisma.storePartner.findMany({
    where: {
      source: 'apollo',
      phone: null,
      OR: [
        {
          email: { not: null },
          linkedinUrl: { not: null },
        },
      ],
    },
    select: {
      id: true,
      storeId: true,
      nome: true,
      email: true,
      linkedinUrl: true,
      apolloPersonId: true,
    },
    orderBy: [{ createdAt: 'asc' }],
    take: limit,
  });

  let revealed = 0;
  let noPhone = 0;
  let errors = 0;
  const results: any[] = [];

  for (const partner of candidates) {
    try {
      const payload: Record<string, any> = {
        reveal_personal_emails: true,
      };

      if (partner.apolloPersonId) payload.id = partner.apolloPersonId;
      else if (partner.email) payload.email = partner.email;
      else if (partner.linkedinUrl) payload.linkedin_url = partner.linkedinUrl;
      else {
        results.push({ partnerId: partner.id, nome: partner.nome, status: 'skipped' });
        continue;
      }

      const res = await axios.post(
        `${APOLLO_BASE}/people/match`,
        payload,
        { headers: { 'X-Api-Key': APOLLO_API_KEY, 'Content-Type': 'application/json' }, timeout: 15000 },
      );

      const person = res.data?.person;
      const phone = pickBestApolloPhone(person);

      if (!person || !phone) {
        await prisma.storePartner.update({
          where: { id: partner.id },
          data: {
            apolloPersonId: person?.id ?? partner.apolloPersonId,
            linkedinUrl: person?.linkedin_url ?? partner.linkedinUrl,
            apolloHasPhone: person?.has_direct_phone === 'Yes' || person?.phone_numbers?.length > 0 || false,
            apolloPhoneRevealRequestedAt: new Date(),
            apolloPhoneRevealError: person ? 'Apollo não retornou telefone' : 'Apollo não retornou pessoa',
          },
        });
        noPhone++;
        results.push({ partnerId: partner.id, nome: partner.nome, status: 'no_phone' });
        await sleep(700);
        continue;
      }

      await prisma.storePartner.update({
        where: { id: partner.id },
        data: {
          apolloPersonId: person?.id ?? partner.apolloPersonId,
          linkedinUrl: person?.linkedin_url ?? partner.linkedinUrl,
          apolloHasPhone: true,
          apolloPhoneRevealRequestedAt: new Date(),
          apolloPhoneRevealedAt: new Date(),
          apolloPhoneRevealError: null,
          phone,
        },
      });

      const store = await prisma.store.findUnique({
        where: { id: partner.storeId },
        select: { contactPhone: true, contactEmail: true },
      });

      if (store && (!store.contactPhone || (partner.email && store.contactEmail === partner.email))) {
        await prisma.store.update({
          where: { id: partner.storeId },
          data: { contactPhone: phone },
        });
      }

      revealed++;
      results.push({ partnerId: partner.id, nome: partner.nome, status: 'revealed', phone });
      await sleep(700);
    } catch (err: any) {
      errors++;
      const msg = err?.response?.data?.error ?? err?.message ?? 'Erro no Apollo';
      await prisma.storePartner.update({
        where: { id: partner.id },
        data: {
          apolloPhoneRevealRequestedAt: new Date(),
          apolloPhoneRevealError: msg,
        },
      });
      results.push({ partnerId: partner.id, nome: partner.nome, status: 'error', error: msg });
    }
  }

  console.log(JSON.stringify({
    total: candidates.length,
    revealed,
    noPhone,
    errors,
    results,
  }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

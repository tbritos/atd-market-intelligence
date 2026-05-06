import { Router, Request, Response } from 'express';
import prismaClient from '../../utils/prisma';

const prisma = prismaClient as any;

const router = Router();

/**
 * POST /webhooks/apollo-phone-leads
 *
 * Apollo chama este endpoint após processar o reveal de telefone para AmostraLeadPessoa.
 * Faz lookup pelo person.id (apolloPessoaId) e atualiza o telefone.
 */
router.post('/apollo-phone-leads', async (req: Request, res: Response) => {
  try {
    const person = req.body?.person ?? req.body;
    if (!person) return res.status(400).json({ success: false, error: 'Payload vazio' });

    const apolloPessoaId: string | null = person.id ?? null;
    const phoneNumbers: any[] = person.phone_numbers ?? [];

    if (!apolloPessoaId) return res.status(200).json({ success: true, updated: false, reason: 'no_person_id' });
    if (phoneNumbers.length === 0) return res.status(200).json({ success: true, updated: false, reason: 'no_phones' });

    const mobile = phoneNumbers.find((p: any) => p.type === 'mobile') ?? phoneNumbers[0];
    const phone: string | null = mobile?.sanitized_number ?? mobile?.number ?? null;
    if (!phone) return res.status(200).json({ success: true, updated: false, reason: 'no_sanitized_number' });

    const pessoa = await prisma.amostraLeadPessoa.findFirst({ where: { apolloPessoaId } });
    if (!pessoa) return res.status(200).json({ success: true, updated: false, reason: 'pessoa_not_found', apolloPessoaId });

    const nomeCompleto = [person.first_name, person.last_name].filter(Boolean).join(' ');
    await prisma.amostraLeadPessoa.update({
      where: { id: pessoa.id },
      data: {
        telefone: phone,
        nome: nomeCompleto || undefined,
        email: person.email || pessoa.email,
        linkedin: person.linkedin_url || pessoa.linkedin,
      },
    });

    console.log(`[apollo-webhook-leads] Telefone salvo para ${pessoa.nome}: ${phone}`);
    return res.status(200).json({ success: true, updated: true, nome: pessoa.nome, phone });
  } catch (err: any) {
    console.error('[apollo-webhook-leads] Erro:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /webhooks/apollo-phone
 *
 * Apollo chama este endpoint de forma assíncrona após processar o reveal de telefone.
 * Payload esperado:
 * {
 *   person: {
 *     id: string,
 *     linkedin_url: string | null,
 *     phone_numbers: [{ sanitized_number: string, type: string, ... }],
 *     ...
 *   }
 * }
 *
 * Estratégia de lookup:
 *  1. Tenta encontrar o StorePartner pelo linkedin_url (salvo durante enrichment)
 *  2. Atualiza phone no StorePartner
 *  3. Se for o contato principal da store, atualiza Store.contactPhone também
 */
router.post('/apollo-phone', async (req: Request, res: Response) => {
  try {
    // Apollo pode encapsular em { person: {...} } ou entregar o objeto diretamente
    const person = req.body?.person ?? req.body;

    if (!person) {
      return res.status(400).json({ success: false, error: 'Payload vazio' });
    }

    const linkedinUrl: string | null = person.linkedin_url ?? null;
    const phoneNumbers: any[] = person.phone_numbers ?? [];

    if (phoneNumbers.length === 0) {
      // Apollo enviou webhook mas sem telefones — nada a fazer
      return res.status(200).json({ success: true, updated: false, reason: 'no_phones' });
    }

    // Prefere mobile, depois qualquer número
    const mobile = phoneNumbers.find((p: any) => p.type === 'mobile') ?? phoneNumbers[0];
    const phone: string | null = mobile?.sanitized_number ?? mobile?.number ?? null;

    if (!phone) {
      return res.status(200).json({ success: true, updated: false, reason: 'no_sanitized_number' });
    }

    const apolloPersonId: string | null = person.id ?? null;

    // Lookup: tenta pelo apolloPersonId primeiro, depois pelo linkedinUrl
    let partner = apolloPersonId
      ? await prisma.storePartner.findFirst({ where: { apolloPersonId } })
      : null;

    if (!partner && linkedinUrl) {
      partner = await prisma.storePartner.findFirst({ where: { linkedinUrl } });
    }

    if (!partner) {
      return res.status(200).json({ success: true, updated: false, reason: 'partner_not_found', apolloPersonId, linkedinUrl });
    }

    if (!partner) {
      return res.status(200).json({ success: true, updated: false, reason: 'partner_not_found', linkedinUrl });
    }

    // Atualiza o telefone no StorePartner
    await prisma.storePartner.update({
      where: { id: partner.id },
      data: {
        phone,
        apolloPhoneRevealedAt: new Date(),
        apolloPhoneRevealError: null,
      },
    });

    // Se este parceiro é o contato principal da store (mesmo email ou sem contactPhone), atualiza Store.contactPhone
    const store = await prisma.store.findUnique({
      where: { id: partner.storeId },
      select: { contactPhone: true, contactEmail: true },
    });

    if (store && (!store.contactPhone || store.contactEmail === partner.email)) {
      await prisma.store.update({
        where: { id: partner.storeId },
        data: { contactPhone: phone },
      });
    }

    console.log(`[apollo-webhook] Telefone salvo para ${partner.nome} (store ${partner.storeId}): ${phone}`);
    return res.status(200).json({ success: true, updated: true, storeId: partner.storeId, nome: partner.nome, phone });
  } catch (err: any) {
    console.error('[apollo-webhook] Erro:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;

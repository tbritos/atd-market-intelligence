import { Request, Response } from 'express';
import { AmostraLeadsService } from './amostra-leads.service';
import { handleError } from '../../utils/responseHandler';
import { leadEnrichmentQueue } from '../../config/queue';
import prisma from '../../utils/prisma';

const service = new AmostraLeadsService();

export const amostraLeadsController = {
  async importLeads(req: Request, res: Response) {
    try {
      const { rows } = req.body;
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ success: false, message: 'rows deve ser um array não vazio' });
      }
      const result = await service.importLeads(rows);
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      if (error instanceof Error) handleError(res, error.message, 500);
    }
  },

  async exportCsv(_req: Request, res: Response) {
    try {
      const csv = await service.exportCsv();
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="amostra-leads.csv"');
      res.send('\uFEFF' + csv); // BOM para Excel abrir UTF-8 corretamente
    } catch (error) {
      if (error instanceof Error) handleError(res, error.message, 500);
    }
  },

  async listLeads(req: Request, res: Response) {
    try {
      const search = req.query.search as string | undefined;
      const result = await service.listLeads(search);
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      if (error instanceof Error) handleError(res, error.message, 500);
    }
  },

  async getStats(_req: Request, res: Response) {
    try {
      const result = await service.getStats();
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      if (error instanceof Error) handleError(res, error.message, 500);
    }
  },

  async resetLeads(_req: Request, res: Response) {
    try {
      const result = await service.resetLeads();
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      if (error instanceof Error) handleError(res, error.message, 500);
    }
  },

  async updateEnrichment(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const result = await service.updateEnrichment(id, req.body);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      if (error instanceof Error) handleError(res, error.message, 500);
    }
  },

  async testApollo(req: Request, res: Response) {
    try {
      const leadId = req.query.leadId as string | undefined;
      const result = await service.testApolloLead(leadId);
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      if (error instanceof Error) handleError(res, error.message, 500);
    }
  },

  async enrichWithApollo(_req: Request, res: Response) {
    try {
      const result = await service.enrichWithApollo();
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      if (error instanceof Error) handleError(res, error.message, 500);
    }
  },

  async testHunterFull(req: Request, res: Response) {
    try {
      const { domain, nome } = req.query;
      if (!domain || typeof domain !== 'string') {
        return res.status(400).json({ success: false, message: 'domain obrigatório' });
      }
      const result = await service.testHunterFull(domain, nome as string | undefined);
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      if (error instanceof Error) handleError(res, error.message, 500);
    }
  },

  async enrichWithHunter(_req: Request, res: Response) {
    try {
      const result = await service.enrichWithHunter();
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      if (error instanceof Error) handleError(res, error.message, 500);
    }
  },

  async getApolloUsage(_req: Request, res: Response) {
    try {
      const result = await service.getApolloUsage();
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      if (error instanceof Error) handleError(res, error.message, 500);
    }
  },

  async testOrgEnrichByDomain(req: Request, res: Response) {
    try {
      const { domain } = req.query;
      if (!domain || typeof domain !== 'string') {
        return res.status(400).json({ success: false, message: 'domain obrigatório' });
      }
      const result = await service.testOrgEnrichByDomain(domain);
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      if (error instanceof Error) handleError(res, error.message, 500);
    }
  },

  async testOrgTopPeopleById(req: Request, res: Response) {
    try {
      const { orgId } = req.query;
      if (!orgId || typeof orgId !== 'string') {
        return res.status(400).json({ success: false, message: 'orgId obrigatório' });
      }
      const result = await service.testOrgTopPeopleById(orgId);
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      if (error instanceof Error) handleError(res, error.message, 500);
    }
  },

  async testOrgTopPeople(req: Request, res: Response) {
    try {
      const { leadId } = req.query;
      if (!leadId || typeof leadId !== 'string') {
        return res.status(400).json({ success: false, message: 'leadId obrigatório' });
      }
      const result = await service.testOrgTopPeople(leadId);
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      if (error instanceof Error) handleError(res, error.message, 500);
    }
  },

  async previewNormalizedNames(_req: Request, res: Response) {
    try {
      const result = await service.previewNormalizedNames();
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      if (error instanceof Error) handleError(res, error.message, 500);
    }
  },

  async testPeopleSearch(req: Request, res: Response) {
    try {
      const { leadId } = req.query;
      if (!leadId || typeof leadId !== 'string') {
        return res.status(400).json({ success: false, message: 'leadId obrigatório' });
      }
      const result = await service.testPeopleSearch(leadId);
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      if (error instanceof Error) handleError(res, error.message, 500);
    }
  },

  async testPeopleMatch(req: Request, res: Response) {
    try {
      const { leadId } = req.query;
      if (!leadId || typeof leadId !== 'string') {
        return res.status(400).json({ success: false, message: 'leadId obrigatório' });
      }
      const result = await service.testPeopleMatch(leadId);
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      if (error instanceof Error) handleError(res, error.message, 500);
    }
  },

  async addPessoa(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { nome, email, cargo, linkedin, telefone, isPrincipal } = req.body;
      if (!nome?.trim()) {
        return res.status(400).json({ success: false, message: 'nome é obrigatório' });
      }
      const result = await service.addPessoa(id, { nome, email, cargo, linkedin, telefone, isPrincipal });
      res.status(201).json({ success: true, data: result });
    } catch (error) {
      if (error instanceof Error) handleError(res, error.message, 500);
    }
  },

  async updatePessoa(req: Request, res: Response) {
    try {
      const { id, pessoaId } = req.params;
      const result = await service.updatePessoa(id, pessoaId, req.body);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      if (error instanceof Error) handleError(res, error.message, 500);
    }
  },

  async deletePessoa(req: Request, res: Response) {
    try {
      const { id, pessoaId } = req.params;
      await service.deletePessoa(id, pessoaId);
      res.status(204).send();
    } catch (error) {
      if (error instanceof Error) handleError(res, error.message, 500);
    }
  },

  async searchPessoasApollo(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const result = await service.searchPessoasApollo(id);
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      if (error instanceof Error) handleError(res, error.message, 500);
    }
  },

  async searchPessoasApolloAll(_req: Request, res: Response) {
    try {
      const result = await service.searchPessoasApolloAll();
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      if (error instanceof Error) handleError(res, error.message, 500);
    }
  },

  async countPessoasToReveal(_req: Request, res: Response) {
    try {
      const result = await service.countPessoasToReveal();
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      if (error instanceof Error) handleError(res, error.message, 500);
    }
  },

  async revealAllPessoas(_req: Request, res: Response) {
    try {
      const result = await service.revealAllPessoas();
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      if (error instanceof Error) handleError(res, error.message, 500);
    }
  },

  async revealPessoa(req: Request, res: Response) {
    try {
      const { id, pessoaId } = req.params;
      const result = await service.revealPessoa(id, pessoaId);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      if (error instanceof Error) handleError(res, error.message, 500);
    }
  },

  // ─── Pipeline inteligente ───────────────────────────────────────────────

  async enqueueLead(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const lead = await prisma.amostraLead.findUniqueOrThrow({
        where: { id },
        select: { id: true, empresa: true, statusPipeline: true },
      });

      if (lead.statusPipeline === 'running') {
        return res.status(409).json({ success: false, message: 'Pipeline já em execução para este lead.' });
      }

      await leadEnrichmentQueue.add('enrich', { leadId: lead.id, empresa: lead.empresa }, { jobId: `lead-${lead.id}` });
      res.status(202).json({ success: true, message: `Lead "${lead.empresa}" enfileirado para enriquecimento.` });
    } catch (error) {
      if (error instanceof Error) handleError(res, error.message, 500);
    }
  },

  async enqueueAll(_req: Request, res: Response) {
    try {
      const leads = await prisma.amostraLead.findMany({
        where: { statusPipeline: { in: ['pending', 'error'] } },
        select: { id: true, empresa: true },
        orderBy: { createdAt: 'asc' },
      });

      if (leads.length === 0) {
        return res.status(200).json({ success: true, message: 'Nenhum lead pendente para enriquecer.', queued: 0 });
      }

      const jobs = leads.map(lead => ({
        name: 'enrich',
        data: { leadId: lead.id, empresa: lead.empresa },
        opts: { jobId: `lead-${lead.id}` },
      }));

      await leadEnrichmentQueue.addBulk(jobs);
      res.status(202).json({ success: true, queued: leads.length, message: `${leads.length} leads enfileirados.` });
    } catch (error) {
      if (error instanceof Error) handleError(res, error.message, 500);
    }
  },

  async pipelineStats(_req: Request, res: Response) {
    try {
      const [counts, queueCounts] = await Promise.all([
        prisma.amostraLead.groupBy({
          by: ['statusPipeline'],
          _count: { _all: true },
        }),
        leadEnrichmentQueue.getJobCounts('waiting', 'active', 'completed', 'failed'),
      ]);

      const byStatus = Object.fromEntries(counts.map(c => [c.statusPipeline, c._count._all]));

      res.status(200).json({
        success: true,
        data: {
          leads: byStatus,
          queue: queueCounts,
        },
      });
    } catch (error) {
      if (error instanceof Error) handleError(res, error.message, 500);
    }
  },
};

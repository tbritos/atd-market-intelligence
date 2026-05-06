import { Router, Request, Response } from 'express';
import { amostraLeadsController } from './amostra-leads.controller';

const amostraLeadsRouter = Router();

// Import de leads da planilha
amostraLeadsRouter.post('/import', (req: Request, res: Response) => amostraLeadsController.importLeads(req, res));

// Listagem com busca opcional
amostraLeadsRouter.get('/', (req: Request, res: Response) => amostraLeadsController.listLeads(req, res));

// Exportar CSV
amostraLeadsRouter.get('/export/csv', (req: Request, res: Response) => amostraLeadsController.exportCsv(req, res));

// Stats de enriquecimento por API
amostraLeadsRouter.get('/stats', (req: Request, res: Response) => amostraLeadsController.getStats(req, res));

// Zerar todos os leads da amostra
amostraLeadsRouter.delete('/reset', (req: Request, res: Response) => amostraLeadsController.resetLeads(req, res));

// Atualizar resultado de enriquecimento de um lead
amostraLeadsRouter.patch('/:id/enrichment', (req: Request, res: Response) => amostraLeadsController.updateEnrichment(req, res));

// Busca pessoas Apollo em todos os leads com apolloOrgId
amostraLeadsRouter.post('/pessoas/apollo-search-all', (req: Request, res: Response) => amostraLeadsController.searchPessoasApolloAll(req, res));

// Contar quantas pessoas serão reveladas (preview de créditos)
amostraLeadsRouter.get('/pessoas/reveal-all/count', (req: Request, res: Response) => amostraLeadsController.countPessoasToReveal(req, res));

// Revelar email/telefone de todas as pessoas com dados disponíveis no Apollo
amostraLeadsRouter.post('/pessoas/reveal-all', (req: Request, res: Response) => amostraLeadsController.revealAllPessoas(req, res));

// Pessoas da empresa (decisores)
amostraLeadsRouter.post('/:id/pessoas', (req: Request, res: Response) => amostraLeadsController.addPessoa(req, res));
amostraLeadsRouter.post('/:id/pessoas/apollo-search', (req: Request, res: Response) => amostraLeadsController.searchPessoasApollo(req, res));
amostraLeadsRouter.post('/:id/pessoas/:pessoaId/reveal', (req: Request, res: Response) => amostraLeadsController.revealPessoa(req, res));
amostraLeadsRouter.patch('/:id/pessoas/:pessoaId', (req: Request, res: Response) => amostraLeadsController.updatePessoa(req, res));
amostraLeadsRouter.delete('/:id/pessoas/:pessoaId', (req: Request, res: Response) => amostraLeadsController.deletePessoa(req, res));

// Teste Apollo com 1 lead (retorna resposta bruta)
amostraLeadsRouter.get('/enrich/apollo/test', (req: Request, res: Response) => amostraLeadsController.testApollo(req, res));

// Enriquecimento Apollo em massa
amostraLeadsRouter.post('/enrich/apollo', (req: Request, res: Response) => amostraLeadsController.enrichWithApollo(req, res));

// Preview de nomes normalizados de todas as empresas
amostraLeadsRouter.get('/normalize/preview', (req: Request, res: Response) => amostraLeadsController.previewNormalizedNames(req, res));

// Busca pessoas por nome da empresa (mixed_people/search)
amostraLeadsRouter.get('/enrich/apollo/people-search', (req: Request, res: Response) => amostraLeadsController.testPeopleSearch(req, res));

// Teste people/match com 1 lead
amostraLeadsRouter.get('/enrich/apollo/people-match', (req: Request, res: Response) => amostraLeadsController.testPeopleMatch(req, res));

// Teste organization_top_people com 1 lead (usa apolloOrgId já salvo)
amostraLeadsRouter.get('/enrich/apollo/org-top-people', (req: Request, res: Response) => amostraLeadsController.testOrgTopPeople(req, res));

// Teste enrich por domínio manual
amostraLeadsRouter.get('/enrich/apollo/by-domain', (req: Request, res: Response) => amostraLeadsController.testOrgEnrichByDomain(req, res));

// Teste org top people por orgId direto
amostraLeadsRouter.get('/enrich/apollo/org-top-people-by-id', (req: Request, res: Response) => amostraLeadsController.testOrgTopPeopleById(req, res));

// Usage stats da conta Apollo
amostraLeadsRouter.get('/enrich/apollo/usage', (req: Request, res: Response) => amostraLeadsController.getApolloUsage(req, res));

// Hunter — teste completo por domínio (domain-search + companies/find)
amostraLeadsRouter.get('/enrich/hunter/test', (req: Request, res: Response) => amostraLeadsController.testHunterFull(req, res));

// Hunter — enriquecimento em massa
amostraLeadsRouter.post('/enrich/hunter', (req: Request, res: Response) => amostraLeadsController.enrichWithHunter(req, res));

// ─── Pipeline inteligente ───────────────────────────────────────────────────
// Enfileira todos os leads pendentes/erro para o pipeline completo
amostraLeadsRouter.post('/pipeline/enqueue-all', (req: Request, res: Response) => amostraLeadsController.enqueueAll(req, res));

// Enfileira um lead específico
amostraLeadsRouter.post('/:id/pipeline/enqueue', (req: Request, res: Response) => amostraLeadsController.enqueueLead(req, res));

// Status geral do pipeline (leads + fila)
amostraLeadsRouter.get('/pipeline/stats', (req: Request, res: Response) => amostraLeadsController.pipelineStats(req, res));

export default amostraLeadsRouter;

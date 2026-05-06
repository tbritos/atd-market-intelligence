import { Router, Request, Response } from 'express';
import { discoveryController } from './discovery.controller';

const discoveryRouter = Router();

// Cobertura por estado (quantas stores, % com site, status dos jobs)
discoveryRouter.get('/coverage', (req: Request, res: Response) => discoveryController.getCoverage(req, res));

// Stats da fila de discovery
discoveryRouter.get('/queue-stats', (req: Request, res: Response) => discoveryController.getQueueStats(req, res));

// Dispara busca para um estado específico
discoveryRouter.post('/state/:stateCode/start', (req: Request, res: Response) => discoveryController.startDiscovery(req, res));

// Marcas presentes em um estado com contagem de stores
discoveryRouter.get('/state/:stateCode/brands', (req: Request, res: Response) => discoveryController.getBrandsForState(req, res));

export default discoveryRouter;

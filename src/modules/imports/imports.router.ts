import { Router, Request, Response } from 'express';
import { importsController } from './imports.controller';

const importsRouter = Router();

importsRouter.get('/fields', (req: Request, res: Response) => importsController.getFields(req, res));
importsRouter.get('/', (req: Request, res: Response) => importsController.listJobs(req, res));
importsRouter.get('/:id', (req: Request, res: Response) => importsController.getJob(req, res));
importsRouter.post('/preview', (req: Request, res: Response) => importsController.preview(req, res));
importsRouter.post('/execute', (req: Request, res: Response) => importsController.execute(req, res));

export default importsRouter;

import { Request, Response, Router } from 'express';
import { SearchSitesController } from './search-sites.controller';
import { validate } from '../../utils/middlewares/validate.middleware';
import { startDealerDiscoverySchema, startSearchJobSchema } from './search-sites.schema';

const searchSitesRouter = Router();
const searchSitesController = new SearchSitesController();

searchSitesRouter.post('/start',
  validate(startSearchJobSchema),
  (req: Request, res: Response) => searchSitesController.startSearchJobs(req, res)
);

// Multi-source dealer discovery (Google Places + CNAE + brand sites)
searchSitesRouter.post('/discover',
  validate(startDealerDiscoverySchema),
  (req: Request, res: Response) => searchSitesController.startDealerDiscovery(req, res)
);

export default searchSitesRouter;

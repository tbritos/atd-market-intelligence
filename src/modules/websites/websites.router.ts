import { Request, Response, Router } from 'express';
import { WebsitesController } from './websites.controller';
import { validate } from '../../utils/middlewares/validate.middleware';
import { providerStatsSchema, listWebsitesSchema, providerMetricsSchema, updateWebsiteSchema, deleteWebsiteSchema } from './websites.schema';

const websitesRouter = Router();
const websitesController = new WebsitesController();

websitesRouter.get('/provider-stats',
  validate(providerStatsSchema),
  (req: Request, res: Response) => websitesController.getProviderStats(req, res)
);

websitesRouter.get('/',
  validate(listWebsitesSchema),
  (req: Request, res: Response) => websitesController.listWebsites(req, res)
);

websitesRouter.get('/provider-metrics',
  validate(providerMetricsSchema),
  (req: Request, res: Response) => websitesController.getProviderMetrics(req, res)
);

websitesRouter.get('/:id',
  (req: Request, res: Response) => websitesController.getById(req, res)
);

websitesRouter.put('/:id',
  validate(updateWebsiteSchema),
  (req: Request, res: Response) => websitesController.updateWebsite(req, res)
);

websitesRouter.delete('/:id',
  validate(deleteWebsiteSchema),
  (req: Request, res: Response) => websitesController.deleteWebsite(req, res)
);

websitesRouter.post('/fix-google-redirects',
  (req: Request, res: Response) => websitesController.fixGoogleRedirectUrls(req, res)
);

export default websitesRouter;
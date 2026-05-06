import { Request, Response, Router } from 'express';
import { StoresController } from './stores.controller';
import { validate } from '../../utils/middlewares/validate.middleware';
import { listStoresSchema } from './stores.schema';

const storesRouter = Router();
const storesController = new StoresController();

storesRouter.get('/stats',
  (req: Request, res: Response) => storesController.getStoreStats(req, res)
);

storesRouter.get('/cnaes',
  (req: Request, res: Response) => storesController.listCnaes(req, res)
);

storesRouter.post('/enrich-bulk',
  (req: Request, res: Response) => storesController.enqueueBulkEnrichment(req, res)
);

storesRouter.post('/website-match',
  (req: Request, res: Response) => storesController.matchWebsitesFromBrandAdapters(req, res)
);

storesRouter.post('/website-search-bulk',
  (req: Request, res: Response) => storesController.enqueueBulkWebsiteEnrichment(req, res)
);

storesRouter.post('/match-contacts',
  (req: Request, res: Response) => storesController.matchContacts(req, res)
);

storesRouter.post('/pagespeed-bulk',
  (req: Request, res: Response) => storesController.enqueueBulkPagespeed(req, res)
);

storesRouter.post('/provider-bulk',
  (req: Request, res: Response) => storesController.enqueueBulkProviderDetection(req, res)
);

storesRouter.get('/sdr-sample',
  (req: Request, res: Response) => storesController.getSdrSample(req, res)
);

storesRouter.get('/sdr-export',
  (req: Request, res: Response) => storesController.getSdrExport(req, res)
);

storesRouter.get('/clientes',
  (req: Request, res: Response) => storesController.listClientes(req, res)
);

storesRouter.post('/clientes/reset',
  (req: Request, res: Response) => storesController.resetClientes(req, res)
);

storesRouter.post('/clientes/update-cs',
  (req: Request, res: Response) => storesController.updateClientesCs(req, res)
);

storesRouter.post('/create-from-contacts',
  (req: Request, res: Response) => storesController.createFromContacts(req, res)
);

storesRouter.get('/',
  validate(listStoresSchema),
  (req: Request, res: Response) => storesController.listStores(req, res)
);

storesRouter.get('/:id',
  (req: Request, res: Response) => storesController.getStore(req, res)
);

storesRouter.post('/:id/enrich',
  (req: Request, res: Response) => storesController.enqueueEnrichment(req, res)
);

export default storesRouter;
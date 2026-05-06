import { Request, Response, Router } from 'express';
import { ProvidersController } from './providers.controller';
import { validate } from '../../utils/middlewares/validate.middleware';
import { listProvidersSchema, createProviderSchema, updateProviderSchema } from './providers.schema';

const providersRouter = Router();
const providersController = new ProvidersController();

providersRouter.get('/',
  validate(listProvidersSchema),
  (req: Request, res: Response) => providersController.listProviders(req, res)
);

providersRouter.post('/',
  validate(createProviderSchema),
  (req: Request, res: Response) => providersController.createProvider(req, res)
);

providersRouter.put('/:id',
  validate(updateProviderSchema),
  (req: Request, res: Response) => providersController.updateProvider(req, res)
);

export default providersRouter;
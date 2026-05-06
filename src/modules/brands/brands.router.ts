import { Request, Response, Router } from 'express';
import { BrandsController } from './brands.controller';
import { validate } from '../../utils/middlewares/validate.middleware';
import { listBrandsSchema, createBrandSchema, pipedriveBrandGroupsSchema } from './brands.schema';

const brandsRouter = Router();
const brandsController = new BrandsController();

brandsRouter.get('/',
  validate(listBrandsSchema),
  (req: Request, res: Response) => brandsController.listBrands(req, res)
);

brandsRouter.post('/',
  validate(createBrandSchema),
  (req: Request, res: Response) => brandsController.createBrand(req, res)
);

brandsRouter.get('/:id/pipedrive-groups',
  validate(pipedriveBrandGroupsSchema),
  (req: Request, res: Response) => brandsController.getBrandGroupsPipedrive(req, res)
);

export default brandsRouter;

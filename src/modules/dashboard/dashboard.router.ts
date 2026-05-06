import { Request, Response, Router } from 'express';
import { DashboardController } from './dashboard.controller';
import { validate } from '../../utils/middlewares/validate.middleware';
import { globalStatsSchema } from './dashboard.schema';

const dashboardRouter = Router();
const dashboardController = new DashboardController();

dashboardRouter.get('/global-stats',
  validate(globalStatsSchema),
  (req: Request, res: Response) => dashboardController.getGlobalStats(req, res)
);

export default dashboardRouter;
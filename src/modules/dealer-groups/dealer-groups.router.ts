import { Router } from 'express';
import { DealerGroupsController } from './dealer-groups.controller';

const dealerGroupsRouter = Router();
const controller = new DealerGroupsController();

dealerGroupsRouter.get('/stats', (req, res) => controller.getStats(req, res));
dealerGroupsRouter.get('/:id', (req, res) => controller.getById(req, res));
dealerGroupsRouter.get('/', (req, res) => controller.list(req, res));

export default dealerGroupsRouter;

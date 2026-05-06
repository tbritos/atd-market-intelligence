import { Request, Response } from 'express';
import { discoveryService } from './discovery.service';
import { handleError } from '../../utils/responseHandler';

export const discoveryController = {
  async getCoverage(_req: Request, res: Response) {
    try {
      const result = await discoveryService.getCoverage();
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      if (error instanceof Error) handleError(res, error.message, 500);
    }
  },

  async startDiscovery(req: Request, res: Response) {
    try {
      const { stateCode } = req.params;
      const { brandSlugs, forceRedo } = req.body ?? {};
      const result = await discoveryService.startDiscoveryForState(stateCode.toUpperCase(), { brandSlugs, forceRedo });
      res.status(202).json({ success: true, data: result });
    } catch (error) {
      if (error instanceof Error) handleError(res, error.message, 500);
    }
  },

  async getBrandsForState(req: Request, res: Response) {
    try {
      const { stateCode } = req.params;
      const result = await discoveryService.getBrandsForState(stateCode.toUpperCase());
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      if (error instanceof Error) handleError(res, error.message, 500);
    }
  },

  async getQueueStats(_req: Request, res: Response) {
    try {
      const result = await discoveryService.getQueueStats();
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      if (error instanceof Error) handleError(res, error.message, 500);
    }
  },
};

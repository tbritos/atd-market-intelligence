import { Request, Response } from 'express';
import { DashboardService } from './dashboard.service';
import { handleError } from '../../utils/responseHandler';
import { GlobalStatsRequest } from './dashboard.schema';

export class DashboardController {
  private dashboardService: DashboardService;

  constructor() {
    this.dashboardService = new DashboardService();
  }

  async getGlobalStats(req: Request, res: Response) {
    try {
      const query: GlobalStatsRequest = req.query;
      const result = await this.dashboardService.getGlobalStats(query);
      
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      if (error instanceof Error) {
        handleError(res, error.message, 400);
      }
    }
  }
}
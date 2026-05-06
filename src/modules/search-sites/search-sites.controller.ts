import { Request, Response } from 'express';
import { SearchSitesService } from './search-sites.service';
import { handleError } from '../../utils/responseHandler';
import { StartDealerDiscoveryRequest, StartSearchJobRequest } from './search-sites.schema';

export class SearchSitesController {
  private searchSitesService: SearchSitesService;

  constructor() {
    this.searchSitesService = new SearchSitesService();
  }

  async startSearchJobs(req: Request, res: Response) {
    try {
      const data: StartSearchJobRequest = req.body;
      const result = await this.searchSitesService.startSearchJobs(data);
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      if (error instanceof Error) handleError(res, error.message, 400);
    }
  }

  async startDealerDiscovery(req: Request, res: Response) {
    try {
      const data: StartDealerDiscoveryRequest = req.body;
      const result = await this.searchSitesService.startDealerDiscovery(data);
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      if (error instanceof Error) handleError(res, error.message, 400);
    }
  }
}

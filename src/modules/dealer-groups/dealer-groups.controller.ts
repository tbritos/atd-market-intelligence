import { Request, Response } from 'express';
import { DealerGroupsService } from './dealer-groups.service';

export class DealerGroupsController {
  private service: DealerGroupsService;

  constructor() {
    this.service = new DealerGroupsService();
  }

  async list(req: Request, res: Response) {
    try {
      const { page, limit, search, brandId, crmStatus, readyForSdr } = req.query;

      const result = await this.service.list({
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
        search: search as string,
        brandId: brandId as string,
        crmStatus: crmStatus as string,
        readyForSdr: readyForSdr === 'true',
      });

      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  async getById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const data = await this.service.getById(id);

      if (!data) {
        return res.status(404).json({ success: false, error: 'Dealer Group not found' });
      }

      res.json({ success: true, data });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  async getStats(req: Request, res: Response) {
    try {
      const data = await this.service.getStats();
      res.json({ success: true, data });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
}

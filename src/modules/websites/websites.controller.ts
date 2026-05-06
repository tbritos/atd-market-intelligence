import { Request, Response } from 'express';
import { WebsitesService } from './websites.service';
import { handleError } from '../../utils/responseHandler';
import { ProviderStatsRequest, ListWebsitesRequest, ProviderMetricsRequest, UpdateWebsiteRequest } from './websites.schema';

export class WebsitesController {
  private websitesService: WebsitesService;

  constructor() {
    this.websitesService = new WebsitesService();
  }

  async getProviderStats(req: Request, res: Response) {
    try {
      const query: ProviderStatsRequest = req.query;
      const result = await this.websitesService.getProviderStats(query);
      
      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      if (error instanceof Error) {
        handleError(res, error.message, 400);
      }
    }
  }

  async listWebsites(req: Request, res: Response) {
    try {
      const query: ListWebsitesRequest = req.query;
      const result = await this.websitesService.listWebsites(query);
      
      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      if (error instanceof Error) {
        handleError(res, error.message, 400);
      }
    }
  }

  async getProviderMetrics(req: Request, res: Response) {
    try {
      const query: ProviderMetricsRequest = req.query;
      const result = await this.websitesService.getProviderMetrics(query);
      
      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      if (error instanceof Error) {
        handleError(res, error.message, 400);
      }
    }
  }

  async updateWebsite(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const body: UpdateWebsiteRequest = req.body;
      
      const result = await this.websitesService.updateWebsite(id, body);
      
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      if (error instanceof Error) {
        const statusCode = error.message === 'Website not found' ? 404 : 400;
        handleError(res, error.message, statusCode);
      }
    }
  }

  async deleteWebsite(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const result = await this.websitesService.deleteWebsite(id);

      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      if (error instanceof Error) {
        const statusCode = error.message === 'Website not found' ? 404 : 400;
        handleError(res, error.message, statusCode);
      }
    }
  }

  async getById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const result = await this.websitesService.getWebsiteById(id);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      if (error instanceof Error) {
        const statusCode = error.message === 'Website not found' ? 404 : 400;
        handleError(res, error.message, statusCode);
      }
    }
  }

  async fixGoogleRedirectUrls(_req: Request, res: Response) {
    try {
      const result = await this.websitesService.fixGoogleRedirectUrls();
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      if (error instanceof Error) handleError(res, error.message, 500);
    }
  }
}
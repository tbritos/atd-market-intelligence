import { Request, Response } from 'express';
import { ProvidersService } from './providers.service';
import { handleError } from '../../utils/responseHandler';
import { ListProvidersRequest, CreateProviderRequest, UpdateProviderRequest } from './providers.schema';

export class ProvidersController {
  private providersService: ProvidersService;

  constructor() {
    this.providersService = new ProvidersService();
  }

  async listProviders(req: Request, res: Response) {
    try {
      const query: ListProvidersRequest = req.query;
      const result = await this.providersService.listProviders(query);
      
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

  async createProvider(req: Request, res: Response) {
    try {
      const body: CreateProviderRequest = req.body;
      
      const result = await this.providersService.createProvider(body);
      
      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      if (error instanceof Error) {
        handleError(res, error.message, 400);
      }
    }
  }

  async updateProvider(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const body: UpdateProviderRequest = req.body;
      
      const result = await this.providersService.updateProvider(id, body);
      
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      if (error instanceof Error) {
        const statusCode = error.message === 'Provider not found' ? 404 : 400;
        handleError(res, error.message, statusCode);
      }
    }
  }
}
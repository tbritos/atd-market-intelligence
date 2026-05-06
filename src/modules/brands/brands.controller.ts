import { Request, Response } from 'express';
import { BrandsService } from './brands.service';
import { handleError } from '../../utils/responseHandler';
import { ListBrandsRequest, CreateBrandRequest, PipedriveBrandGroupsRequest } from './brands.schema';

export class BrandsController {
  private brandsService: BrandsService;

  constructor() {
    this.brandsService = new BrandsService();
  }

  async listBrands(req: Request, res: Response) {
    try {
      const query: ListBrandsRequest = req.query;
      const result = await this.brandsService.listBrands(query);
      
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

  async createBrand(req: Request, res: Response) {
    try {
      const body: CreateBrandRequest = req.body;
      
      const result = await this.brandsService.createBrand(body);
      
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

  async getBrandGroupsPipedrive(req: Request, res: Response) {
    try {
      const query: PipedriveBrandGroupsRequest = req.query;
      const { id } = req.params;
      const result = await this.brandsService.getBrandGroupsPipedrive(id, query);

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

import { Request, Response } from 'express';
import { StoresService } from './stores.service';
import { handleError } from '../../utils/responseHandler';
import { ListStoresRequest } from './stores.schema';

export class StoresController {
  private storesService: StoresService;

  constructor() {
    this.storesService = new StoresService();
  }

  async listStores(req: Request, res: Response) {
    try {
      const query: ListStoresRequest = req.query;
      const result = await this.storesService.listStores(query);
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      if (error instanceof Error) handleError(res, error.message, 400);
    }
  }

  async getStore(req: Request, res: Response) {
    try {
      const store = await this.storesService.getStore(req.params.id);
      if (!store) return res.status(404).json({ success: false, message: 'Store not found' });
      res.status(200).json({ success: true, data: store });
    } catch (error) {
      if (error instanceof Error) handleError(res, error.message, 400);
    }
  }

  async getStoreStats(_req: Request, res: Response) {
    try {
      const result = await this.storesService.getStoreStats();
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      if (error instanceof Error) handleError(res, error.message, 400);
    }
  }

  async enqueueBulkEnrichment(req: Request, res: Response) {
    try {
      const cnaeCode = (req.query.cnaeCode || req.body?.cnaeCode) as string | undefined;
      const result = await this.storesService.enqueueBulkEnrichment(cnaeCode);
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      if (error instanceof Error) handleError(res, error.message, 400);
    }
  }

  async listCnaes(_req: Request, res: Response) {
    try {
      const result = await this.storesService.listCnaes();
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      if (error instanceof Error) handleError(res, error.message, 400);
    }
  }

  async enqueueEnrichment(req: Request, res: Response) {
    try {
      const result = await this.storesService.enqueueEnrichment(req.params.id);
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      if (error instanceof Error) handleError(res, error.message, 400);
    }
  }

  async matchWebsitesFromBrandAdapters(req: Request, res: Response) {
    try {
      const cnaeCode = (req.query.cnaeCode || req.body?.cnaeCode) as string | undefined;
      const result = await this.storesService.matchWebsitesFromBrandAdapters(cnaeCode);
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      if (error instanceof Error) handleError(res, error.message, 400);
    }
  }

  async matchContacts(req: Request, res: Response) {
    try {
      const { contacts } = req.body;
      if (!Array.isArray(contacts)) return res.status(400).json({ success: false, message: 'contacts must be an array' });
      const result = await this.storesService.matchContacts(contacts);
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      console.error('matchContacts error:', error);
      if (error instanceof Error) handleError(res, error.message, 500);
    }
  }

  async getSdrSample(req: Request, res: Response) {
    try {
      const limit = parseInt(req.query.limit as string) || 1000;
      const result = await this.storesService.getSdrSample(limit);
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      console.error('getSdrSample error:', error);
      if (error instanceof Error) handleError(res, error.message, 500);
    }
  }

  async updateClientesCs(req: Request, res: Response) {
    try {
      const { rows } = req.body;
      if (!Array.isArray(rows)) return res.status(400).json({ success: false, message: 'rows must be an array' });
      const result = await this.storesService.updateClientesCs(rows);
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      console.error('updateClientesCs error:', error);
      if (error instanceof Error) handleError(res, error.message, 500);
    }
  }

  async resetClientes(_req: Request, res: Response) {
    try {
      const result = await this.storesService.resetClientes();
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      console.error('resetClientes error:', error);
      if (error instanceof Error) handleError(res, error.message, 500);
    }
  }

  async listClientes(req: Request, res: Response) {
    try {
      const search = req.query.search as string | undefined;
      const result = await this.storesService.listClientes(search);
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      console.error('listClientes error:', error);
      if (error instanceof Error) handleError(res, error.message, 500);
    }
  }

  async getSdrExport(req: Request, res: Response) {
    try {
      const limit = parseInt(req.query.limit as string) || 5000;
      const result = await this.storesService.getSdrExport(limit);
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      console.error('getSdrExport error:', error);
      if (error instanceof Error) handleError(res, error.message, 500);
    }
  }

  async enqueueBulkPagespeed(req: Request, res: Response) {
    try {
      const cnaeCode = req.query.cnaeCode as string | undefined;
      const result = await this.storesService.enqueueBulkPagespeed(cnaeCode);
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      if (error instanceof Error) handleError(res, error.message, 500);
    }
  }

  async enqueueBulkProviderDetection(req: Request, res: Response) {
    try {
      const cnaeCode = req.query.cnaeCode as string | undefined;
      const result = await this.storesService.enqueueBulkProviderDetection(cnaeCode);
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      if (error instanceof Error) handleError(res, error.message, 500);
    }
  }

  async createFromContacts(req: Request, res: Response) {
    try {
      const { contacts, marcarComoCliente } = req.body;
      if (!Array.isArray(contacts)) return res.status(400).json({ success: false, message: 'contacts must be an array' });
      const result = await this.storesService.createFromContacts(contacts, !!marcarComoCliente);
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      console.error('createFromContacts error:', error);
      if (error instanceof Error) handleError(res, error.message, 500);
    }
  }

  async enqueueBulkWebsiteEnrichment(req: Request, res: Response) {
    try {
      const cnaeCode = (req.query.cnaeCode || req.body?.cnaeCode) as string | undefined;
      const result = await this.storesService.enqueueBulkWebsiteEnrichment(cnaeCode);
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      if (error instanceof Error) handleError(res, error.message, 400);
    }
  }
}

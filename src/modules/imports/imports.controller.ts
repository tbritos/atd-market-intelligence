import { Request, Response } from 'express';
import { importsService } from './imports.service';
import { handleError } from '../../utils/responseHandler';

export class ImportsController {
  async preview(req: Request, res: Response) {
    try {
      const { rows, columnMapping, matchStrategies, filename } = req.body;
      if (!Array.isArray(rows) || !Array.isArray(columnMapping)) {
        return res.status(400).json({ success: false, message: 'rows e columnMapping são obrigatórios' });
      }
      const result = await importsService.preview(rows, columnMapping, matchStrategies || ['email', 'domain'], filename || 'import.csv');
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      console.error('import preview error:', error);
      if (error instanceof Error) handleError(res, error.message, 500);
    }
  }

  async execute(req: Request, res: Response) {
    try {
      const { rows, columnMapping, matchStrategies, filename, source, marcarComoCliente } = req.body;
      if (!Array.isArray(rows) || !Array.isArray(columnMapping)) {
        return res.status(400).json({ success: false, message: 'rows e columnMapping são obrigatórios' });
      }
      const result = await importsService.execute(rows, columnMapping, matchStrategies || ['email', 'domain'], filename || 'import.csv', source || 'manual', !!marcarComoCliente);
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      console.error('import execute error:', error);
      if (error instanceof Error) handleError(res, error.message, 500);
    }
  }

  async listJobs(req: Request, res: Response) {
    try {
      const jobs = await importsService.listJobs();
      res.status(200).json({ success: true, data: jobs });
    } catch (error) {
      if (error instanceof Error) handleError(res, error.message, 500);
    }
  }

  async getJob(req: Request, res: Response) {
    try {
      const job = await importsService.getJob(req.params.id);
      if (!job) return res.status(404).json({ success: false, message: 'Job não encontrado' });
      res.status(200).json({ success: true, data: job });
    } catch (error) {
      if (error instanceof Error) handleError(res, error.message, 500);
    }
  }

  async getFields(req: Request, res: Response) {
    try {
      const { IMPORTABLE_FIELDS } = await import('./imports.service');
      res.status(200).json({ success: true, data: IMPORTABLE_FIELDS });
    } catch (error) {
      if (error instanceof Error) handleError(res, error.message, 500);
    }
  }
}

export const importsController = new ImportsController();

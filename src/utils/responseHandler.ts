import { Response } from 'express';

export const handleError = (res: Response, message: string, statusCode = 500) => {
  res.status(statusCode).json({ 
    error: message, 
    status: statusCode 
  });
};
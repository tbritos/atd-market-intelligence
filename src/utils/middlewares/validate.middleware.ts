import type { AnyZodObject } from 'zod'
import type { Request, Response, NextFunction } from 'express'
import { ZodError } from 'zod'

export const validate = (schema: AnyZodObject) =>
  async (req: Request<unknown>, res: Response, next: NextFunction) => {
    try {
      const result = await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params
      })

      req.body = result.body
      req.query = result.query
      req.params = result.params

      return next();
    } catch (error) {
      if(error instanceof ZodError) {
        return res.status(422).json({
          message: 'Invalid request',
          status: 422,
          details: error.issues
        });   
      }
      return next(error);
    }
  }
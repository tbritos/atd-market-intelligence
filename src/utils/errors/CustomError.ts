export class CustomError extends Error {
  statusCode: number;

  constructor({ message, statusCode }: { message: string; statusCode: number }) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'CustomError';
  }
}
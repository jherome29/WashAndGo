import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();

      if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
        this.logger.error(
          (exception as Error).message,
          (exception as Error).stack,
        );
        return response.status(status).json({
          statusCode: status,
          message: 'An unexpected error occurred. Please try again.',
        });
      }

      return response.status(status).json(exception.getResponse());
    }

    this.logger.error(
      (exception as Error)?.message ?? String(exception),
      (exception as Error)?.stack,
    );
    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'An unexpected error occurred. Please try again.',
    });
  }
}

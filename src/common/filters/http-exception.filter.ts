import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let error = 'Internal Server Error';
    let message = 'Erro interno do servidor.';

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();

      const payload = exception.getResponse();

      if (typeof payload === 'string') {
        message = payload;
      } else if (payload && typeof payload === 'object') {
        const body = payload as Record<string, any>;

        if (Array.isArray(body.message)) {
          message = body.message.join(' | ');
        } else if (typeof body.message === 'string') {
          message = body.message;
        }

        error = body.error || this.getDefaultError(statusCode);
      } else {
        error = this.getDefaultError(statusCode);
      }
    } else if (exception instanceof Error) {
      message = exception.message || message;
    }

    response.status(statusCode).json({
      statusCode,
      error,
      message,
      path: request.originalUrl || request.url,
      timestamp: new Date().toISOString(),
    });
  }

  private getDefaultError(status: number): string {
    switch (status) {
      case 400:
        return 'Bad Request';
      case 401:
        return 'Unauthorized';
      case 403:
        return 'Forbidden';
      case 404:
        return 'Not Found';
      case 409:
        return 'Conflict';
      default:
        return 'Error';
    }
  }
}

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ERROR_CODES } from '@sharm/contracts';

export class DomainError extends HttpException {
  constructor(
    public readonly code: string,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    public readonly details?: unknown,
  ) {
    super({ code, message, details }, status);
  }
}

@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { correlationId?: string }>();
    const correlationId = req.correlationId ?? 'unknown';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: string = ERROR_CODES.INTERNAL_ERROR;
    let message = 'An unexpected server error occurred. Please try again.';
    let details: unknown = undefined;

    if (exception instanceof DomainError) {
      status = exception.getStatus();
      code = exception.code;
      message = exception.message;
      details = exception.details;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (body && typeof body === 'object') {
        const b = body as Record<string, unknown>;
        code = typeof b.code === 'string' ? b.code : this.mapStatusToCode(status);
        message = Array.isArray(b.message)
          ? b.message.join('; ')
          : typeof b.message === 'string'
            ? b.message
            : exception.message;
        details = b.details;
      } else {
        code = this.mapStatusToCode(status);
      }
    } else {
      // Never leak database credentials, raw SQL errors, or stack traces to clients
      const errObj = exception as { code?: string; message?: string };
      if (errObj?.code === 'P1001' || errObj?.code === 'P1002' || errObj?.message?.includes("Can't reach database")) {
        status = HttpStatus.SERVICE_UNAVAILABLE;
        code = 'DATABASE_UNAVAILABLE';
        message = 'The reservation database is temporarily unreachable. No changes were saved; please try again shortly.';
      } else {
        console.error(
          JSON.stringify({
            level: 'error',
            correlationId,
            path: req.originalUrl,
            method: req.method,
            errorName: exception instanceof Error ? exception.name : 'UnknownError',
            errorCode: errObj?.code,
          }),
        );
      }
    }

    res.status(status).json({
      error: {
        code,
        message,
        ...(details !== undefined ? { details } : {}),
        correlationId,
      },
    });
  }

  private mapStatusToCode(status: number): string {
    switch (status) {
      case 400:
        return ERROR_CODES.VALIDATION_ERROR;
      case 401:
        return ERROR_CODES.UNAUTHORIZED;
      case 403:
        return ERROR_CODES.FORBIDDEN;
      case 404:
        return ERROR_CODES.NOT_FOUND;
      case 409:
        return ERROR_CODES.CONFLICT;
      case 429:
        return ERROR_CODES.RATE_LIMITED;
      default:
        return ERROR_CODES.INTERNAL_ERROR;
    }
  }
}

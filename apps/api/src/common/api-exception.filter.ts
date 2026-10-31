import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { Request, Response } from "express";

type RequestWithId = Request & { requestId?: string };
type FieldError = { field: string; messages: string[] };

function statusCodeName(status: number): string {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return "BAD_REQUEST";
    case HttpStatus.UNAUTHORIZED:
      return "UNAUTHORIZED";
    case HttpStatus.FORBIDDEN:
      return "FORBIDDEN";
    case HttpStatus.NOT_FOUND:
      return "NOT_FOUND";
    case HttpStatus.CONFLICT:
      return "CONFLICT";
    case HttpStatus.TOO_MANY_REQUESTS:
      return "RATE_LIMITED";
    default:
      return status >= 500 ? "INTERNAL_SERVER_ERROR" : "REQUEST_FAILED";
  }
}

export function validationExceptionFactory(
  errors: { property: string; constraints?: Record<string, string> }[],
) {
  const fieldErrors: FieldError[] = errors.map((error) => ({
    field: error.property,
    messages: Object.values(error.constraints ?? {}),
  }));

  return new BadRequestException({
    code: "VALIDATION_FAILED",
    message: "Request validation failed",
    field_errors: fieldErrors,
  });
}

export function toApiError(
  exception: unknown,
  requestId: string,
): {
  error: {
    code: string;
    message: string;
    request_id: string;
    field_errors?: FieldError[];
  };
} {
  const status =
    exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
  const responseBody =
    exception instanceof HttpException ? exception.getResponse() : undefined;
  const body: Record<string, unknown> =
    typeof responseBody === "object" && responseBody !== null
      ? (responseBody as Record<string, unknown>)
      : {};
  const candidateMessage = "message" in body ? body.message : undefined;
  const message =
    typeof candidateMessage === "string"
      ? candidateMessage
      : status >= 500
        ? "An unexpected error occurred"
        : exception instanceof HttpException
          ? exception.message
          : "An unexpected error occurred";

  return {
    error: {
      code:
        "code" in body && typeof body.code === "string"
          ? body.code
          : statusCodeName(status),
      message,
      request_id: requestId,
      ...(Array.isArray(body.field_errors)
        ? { field_errors: body.field_errors as FieldError[] }
        : {}),
    },
  };
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<RequestWithId>();
    const response = http.getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    response
      .status(status)
      .json(toApiError(exception, request.requestId ?? "unknown"));
  }
}

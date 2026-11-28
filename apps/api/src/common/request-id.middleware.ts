import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

type RequestWithId = Request & { requestId?: string };

export class RequestIdMiddleware {
  use(request: RequestWithId, response: Response, next: NextFunction): void {
    const requestId = randomUUID();
    const startedAt = performance.now();
    request.requestId = requestId;
    response.setHeader("x-request-id", requestId);
    response.on("finish", () => {
      process.stdout.write(
        `${JSON.stringify({
          timestamp: new Date().toISOString(),
          level: "info",
          event: "http_request",
          request_id: requestId,
          method: request.method,
          status_code: response.statusCode,
          duration_ms: Math.round(performance.now() - startedAt),
        })}\n`,
      );
    });
    next();
  }
}

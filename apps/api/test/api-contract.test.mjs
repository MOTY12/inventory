import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import test from "node:test";
import { NotFoundException, ValidationPipe } from "@nestjs/common";
import {
  toApiError,
  validationExceptionFactory,
} from "../dist/common/api-exception.filter.js";
import { PaginationQueryDto } from "../dist/common/pagination-query.dto.js";
import { ReportFilterDto } from "../dist/reporting/reporting.dto.js";
import { PasswordHasher } from "../dist/identity/password-hasher.js";
import { JwtService } from "@nestjs/jwt";
import { AccessTokenService } from "../dist/identity/access-token.service.js";
import {
  hashRefreshToken,
  issueRefreshToken,
} from "../dist/identity/refresh-token.js";
import { PrismaService } from "../dist/database/prisma.service.js";
import { HealthController } from "../dist/health/health.controller.js";
import { databaseIdentityFingerprint } from "../dist/health/database-identity.js";

test("development readiness exposes only a non-secret fingerprint of the live database identity", async () => {
  const priorNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  const identity = {
    database: "inventory_dev",
    schema: "public",
    serverAddress: "127.0.0.1",
    serverPort: 5432,
  };
  const controller = new HealthController({
    isReady: () => true,
    $queryRaw: async () => [identity],
  });
  try {
    const status = await controller.ready();
    assert.deepEqual(status, {
      service: "inventory-api",
      status: "ok",
      databaseIdentity: databaseIdentityFingerprint(identity),
    });
    assert.match(status.databaseIdentity, /^[a-f0-9]{64}$/);
    process.env.NODE_ENV = "production";
    assert.deepEqual(await controller.ready(), {
      service: "inventory-api",
      status: "ok",
    });
  } finally {
    if (priorNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = priorNodeEnv;
  }
});

test("password hasher stores an Argon2id verifier and checks candidates safely", async () => {
  const hasher = new PasswordHasher();
  const password = "correct horse battery staple 42";
  const encodedHash = await hasher.hash(password);

  assert.match(encodedHash, /^\$argon2id\$/);
  assert.notEqual(encodedHash, password);
  assert.equal(await hasher.verify(encodedHash, password), true);
  assert.equal(await hasher.verify(encodedHash, "wrong password"), false);
  assert.equal(await hasher.verify("not-a-password-hash", password), false);
});

test("access JWTs are short lived, issuer/audience scoped and organization aware", async () => {
  const tokens = new AccessTokenService(
    new JwtService(),
    "a-local-test-secret-with-more-than-32-bytes",
  );
  const issued = await tokens.issue({
    sub: "user-1",
    sid: "session-1",
    organizationId: "org-1",
  });

  assert.equal(issued.expiresIn, 900);
  assert.deepEqual(await tokens.verify(issued.token), {
    sub: "user-1",
    sid: "session-1",
    organizationId: "org-1",
  });
  await assert.rejects(
    new AccessTokenService(
      new JwtService(),
      "another-test-secret-with-more-than-32-bytes",
    ).verify(issued.token),
  );
  const expired = await new JwtService().signAsync(
    { sid: "session-1" },
    {
      secret: "a-local-test-secret-with-more-than-32-bytes",
      algorithm: "HS256",
      issuer: "inventory-saas",
      audience: "inventory-web",
      subject: "user-1",
      expiresIn: -1,
    },
  );
  await assert.rejects(tokens.verify(expired));
});

test("refresh tokens are random and only their digest is suitable for persistence", () => {
  const first = issueRefreshToken();
  const second = issueRefreshToken();

  assert.equal(first.token.length, 43);
  assert.notEqual(first.token, second.token);
  assert.notEqual(first.tokenHash, first.token);
  assert.equal(hashRefreshToken(first.token), first.tokenHash);
  assert.notEqual(hashRefreshToken(second.token), first.tokenHash);
});

test("Prisma service supports deferred connection for isolated API tests and shuts down cleanly", async () => {
  const priorConnectionSetting = process.env.DATABASE_CONNECT_ON_STARTUP;
  const priorDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_CONNECT_ON_STARTUP = "false";
  process.env.DATABASE_URL ??=
    "postgresql://inventory:local-dev-only-change-me@localhost:5432/inventory_dev?schema=public";

  const prisma = new PrismaService();
  try {
    await prisma.onModuleInit();
    assert.equal(prisma.isReady(), false);
    await prisma.onApplicationShutdown();
  } finally {
    await prisma.$disconnect();
    if (priorConnectionSetting === undefined)
      delete process.env.DATABASE_CONNECT_ON_STARTUP;
    else process.env.DATABASE_CONNECT_ON_STARTUP = priorConnectionSetting;
    if (priorDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = priorDatabaseUrl;
  }
});

test("Prisma connection failures return a safe dependency error", async () => {
  const priorConnectionSetting = process.env.DATABASE_CONNECT_ON_STARTUP;
  const priorDatabaseUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_CONNECT_ON_STARTUP;
  process.env.DATABASE_URL =
    "postgresql://inventory:local-dev-only-change-me@127.0.0.1:1/inventory_dev?connect_timeout=1";

  const prisma = new PrismaService();
  try {
    await assert.rejects(prisma.onModuleInit(), (error) => {
      assert.equal(error.getStatus(), 503);
      assert.deepEqual(error.getResponse(), {
        code: "DATABASE_UNAVAILABLE",
        message: "The database is unavailable",
      });
      return true;
    });
  } finally {
    await prisma.$disconnect();
    if (priorConnectionSetting === undefined)
      delete process.env.DATABASE_CONNECT_ON_STARTUP;
    else process.env.DATABASE_CONNECT_ON_STARTUP = priorConnectionSetting;
    if (priorDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = priorDatabaseUrl;
  }
});

test("validation errors use the documented field error shape", () => {
  const exception = validationExceptionFactory([
    {
      property: "name",
      constraints: { isNotEmpty: "name should not be empty" },
    },
  ]);

  assert.deepEqual(toApiError(exception, "request-123"), {
    error: {
      code: "VALIDATION_FAILED",
      message: "Request validation failed",
      request_id: "request-123",
      field_errors: [{ field: "name", messages: ["name should not be empty"] }],
    },
  });
});

test("pagination DTO rejects out of range values and transforms valid query values", async () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    exceptionFactory: validationExceptionFactory,
  });
  const metadata = { type: "query", metatype: PaginationQueryDto };

  const transformed = await pipe.transform(
    { page: "2", page_size: "50" },
    metadata,
  );
  assert.ok(transformed instanceof PaginationQueryDto);
  assert.equal(transformed.page, 2);
  assert.equal(transformed.page_size, 50);

  await assert.rejects(
    pipe.transform({ page_size: "101" }, metadata),
    (error) => {
      const apiError = toApiError(error, "validation-request").error;
      assert.equal(apiError.code, "VALIDATION_FAILED");
      assert.equal(apiError.request_id, "validation-request");
      assert.deepEqual(
        apiError.field_errors?.map((item) => item.field),
        ["page_size"],
      );
      return true;
    },
  );
});

test("business report filters accept ISO currencies and reject malformed values", async () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    exceptionFactory: validationExceptionFactory,
  });
  const metadata = { type: "query", metatype: ReportFilterDto };
  const valid = await pipe.transform(
    { currency: "NGN", from: "2026-01-01" },
    metadata,
  );
  assert.equal(valid.currency, "NGN");
  const combined = await pipe.transform(
    {
      from: "2026-01-01",
      to: "2026-01-31",
      branch_id: "1a6375c2-9535-4386-92c4-11d50a772af0",
      warehouse_id: "c6df050e-eab8-495c-9522-1f7ee0848755",
      customer_id: "62c01f14-5821-4268-a816-048391b9b677",
      supplier_id: "80bb5c17-2664-42d6-b1a8-32ef55001894",
      product_id: "5c1c0aaf-f3af-4588-8b96-dd62d28c6d93",
      category_id: "aa672f0b-5912-4f78-b353-e0d6766a3e96",
      currency: "USD",
      status: "CONFIRMED",
      q: "pump",
      sort_by: "name",
      purchasing_sort_by: "received_value",
      page: "2",
      page_size: "10",
    },
    metadata,
  );
  assert.equal(combined.page, 2);
  assert.equal(combined.page_size, 10);
  assert.equal(combined.sort_by, "name");
  assert.equal(combined.purchasing_sort_by, "received_value");
  await assert.rejects(pipe.transform({ currency: "ngn" }, metadata));
  await assert.rejects(pipe.transform({ currency: "NGNN" }, metadata));
  await assert.rejects(pipe.transform({ sort_by: "total_value" }, metadata));
  await assert.rejects(
    pipe.transform({ purchasing_sort_by: "margin" }, metadata),
  );
  await assert.rejects(pipe.transform({ status: "PAID" }, metadata));
  await assert.rejects(
    pipe.transform({ page_size: "101" }, metadata),
    (error) =>
      toApiError(error, "report-page-size").error.code === "VALIDATION_FAILED",
  );
  await assert.rejects(pipe.transform({ from: "not-a-date" }, metadata));
});

test("unknown routes use a consistent not found envelope", () => {
  assert.deepEqual(toApiError(new NotFoundException(), "request-456"), {
    error: {
      code: "NOT_FOUND",
      message: "Not Found",
      request_id: "request-456",
    },
  });
});

test("unexpected errors do not expose internal exception messages", () => {
  assert.deepEqual(toApiError(new Error("database secret"), "request-789"), {
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred",
      request_id: "request-789",
    },
  });
});

test("running API responds with request IDs and Swagger document", async () => {
  const port = 45000 + (process.pid % 10000);
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["dist/main.js"], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      DATABASE_URL:
        process.env.DATABASE_URL ??
        "postgresql://inventory:local-dev-only-change-me@localhost:5432/inventory_dev?schema=public",
      DATABASE_CONNECT_ON_STARTUP: "false",
      REPORT_EXPORT_WORKER_ENABLED: "false",
      HOST: "127.0.0.1",
      JWT_ACCESS_SECRET:
        process.env.JWT_ACCESS_SECRET ??
        "local-development-only-secret-change-before-deploy-123456",
      PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.setEncoding("utf8").on("data", (chunk) => (output += chunk));
  child.stderr.setEncoding("utf8").on("data", (chunk) => (output += chunk));

  try {
    let response;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      try {
        response = await fetch(`${baseUrl}/api/v1/status`, {
          signal: AbortSignal.timeout(250),
        });
        break;
      } catch {
        if (child.exitCode !== null)
          throw new Error(`API exited before becoming ready: ${output}`);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    assert.ok(response, `API failed to start: ${output}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("x-request-id") ?? "", /^[0-9a-f-]{36}$/);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("x-frame-options"), "DENY");
    assert.equal(
      response.headers.get("referrer-policy"),
      "strict-origin-when-cross-origin",
    );
    assert.deepEqual(await response.json(), {
      service: "inventory-api",
      status: "ok",
    });

    const unauthenticated = await fetch(`${baseUrl}/api/v1/auth/me`);
    assert.equal(unauthenticated.status, 401);

    const barcodeLookup = await fetch(
      `${baseUrl}/api/v1/organizations/current/catalog/products/by-barcode?barcode=ABC-123`,
    );
    assert.equal(barcodeLookup.status, 401);

    for (const [path, method] of [
      ["/api/v1/organizations/current/sales/invoices", "GET"],
      ["/api/v1/organizations/current/sales/invoices/summary", "GET"],
      ["/api/v1/organizations/current/sales/invoices", "POST"],
      [
        "/api/v1/organizations/current/sales/invoices/00000000-0000-4000-8000-000000000001/pdf",
        "GET",
      ],
      ["/api/v1/organizations/current/sales/payments", "GET"],
      ["/api/v1/organizations/current/sales/payments", "POST"],
      ["/api/v1/organizations/current/sales/tax-rates", "GET"],
      [
        "/api/v1/organizations/current/sales/customers/00000000-0000-4000-8000-000000000001/financial-summary",
        "GET",
      ],
    ]) {
      const response = await fetch(`${baseUrl}${path}`, { method });
      assert.equal(
        response.status,
        401,
        `${method} ${path} must require a bearer token`,
      );
    }

    for (const report of [
      "inventory-summary",
      "valuation",
      "movements",
      "low-stock",
      "sales/summary",
      "sales/trends",
      "purchases/summary",
      "purchases/trends",
      "receivables/aging",
    ]) {
      const response = await fetch(
        `${baseUrl}/api/v1/organizations/current/reports/${report}`,
      );
      assert.equal(
        response.status,
        401,
        `${report} must require a bearer token`,
      );
    }
    for (const [path, method] of [
      ["/api/v1/organizations/current/reports/exports", "GET"],
      ["/api/v1/organizations/current/reports/exports", "POST"],
      [
        "/api/v1/organizations/current/reports/exports/00000000-0000-4000-8000-000000000001/download",
        "GET",
      ],
    ]) {
      const response = await fetch(`${baseUrl}${path}`, { method });
      assert.equal(
        response.status,
        401,
        `${method} ${path} must require a bearer token`,
      );
    }

    const invalidRegistration = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "not-an-email", password: "short" }),
    });
    assert.equal(invalidRegistration.status, 400);

    const csrfResponse = await fetch(`${baseUrl}/api/v1/auth/csrf`);
    assert.equal(csrfResponse.status, 200);
    const csrfPayload = await csrfResponse.json();
    assert.equal(csrfPayload.csrfToken.length, 43);
    assert.match(csrfResponse.headers.get("set-cookie") ?? "", /csrf_token=/);

    const live = await fetch(`${baseUrl}/api/v1/health/live`);
    assert.equal(live.status, 200);
    assert.deepEqual(await live.json(), {
      service: "inventory-api",
      status: "ok",
    });

    const ready = await fetch(`${baseUrl}/api/v1/health/ready`);
    assert.equal(ready.status, 503);
    assert.deepEqual(await ready.json(), {
      error: {
        code: "DEPENDENCIES_UNAVAILABLE",
        message: "Required service adapters are not configured",
        request_id: ready.headers.get("x-request-id"),
      },
    });

    const notFound = await fetch(`${baseUrl}/api/v1/does-not-exist`);
    assert.equal(notFound.status, 404);
    assert.equal(notFound.headers.get("x-request-id") !== null, true);
    assert.deepEqual(await notFound.json(), {
      error: {
        code: "NOT_FOUND",
        message: "Cannot GET /api/v1/does-not-exist",
        request_id: notFound.headers.get("x-request-id"),
      },
    });

    const swagger = await fetch(`${baseUrl}/api/docs-json`);
    assert.equal(swagger.status, 200);
    const spec = await swagger.json();
    assert.equal(spec.openapi.startsWith("3."), true);
    assert.ok(spec.paths["/api/v1/status"]);
    assert.ok(spec.paths["/api/v1/health/live"]);
    assert.ok(spec.paths["/api/v1/auth/register"]);
    assert.ok(spec.paths["/api/v1/auth/refresh"]);
    assert.ok(spec.paths["/api/v1/auth/forgot-password"]);
    assert.ok(spec.paths["/api/v1/auth/reset-password"]);
    assert.ok(
      spec.paths["/api/v1/organizations/current/reports/inventory-summary"],
    );
    assert.ok(spec.paths["/api/v1/organizations/current/reports/valuation"]);
    assert.ok(spec.paths["/api/v1/organizations/current/reports/movements"]);
    assert.ok(spec.paths["/api/v1/organizations/current/reports/low-stock"]);
    assert.ok(
      spec.paths["/api/v1/organizations/current/reports/sales/summary"],
    );
    assert.ok(spec.paths["/api/v1/organizations/current/reports/sales/trends"]);
    assert.ok(
      spec.paths["/api/v1/organizations/current/reports/purchases/summary"],
    );
    assert.ok(
      spec.paths["/api/v1/organizations/current/reports/purchases/trends"],
    );
    assert.ok(
      spec.paths["/api/v1/organizations/current/reports/receivables/aging"],
    );
    assert.ok(spec.paths["/api/v1/organizations/current/reports/exports"]);
    assert.ok(
      spec.paths[
        "/api/v1/organizations/current/reports/exports/{exportId}/download"
      ],
    );
    assert.ok(
      spec.paths["/api/v1/organizations/current/catalog/products/by-barcode"],
    );
    for (const path of [
      "/api/v1/organizations/current/sales/invoices",
      "/api/v1/organizations/current/sales/invoices/{invoiceId}",
      "/api/v1/organizations/current/sales/invoices/{invoiceId}/issue",
      "/api/v1/organizations/current/sales/invoices/{invoiceId}/void",
      "/api/v1/organizations/current/sales/invoices/{invoiceId}/pdf",
      "/api/v1/organizations/current/sales/payments",
      "/api/v1/organizations/current/sales/payments/{paymentId}/reverse",
      "/api/v1/organizations/current/sales/tax-rates",
      "/api/v1/organizations/current/sales/customers/{customerId}/financial-summary",
    ]) {
      assert.ok(spec.paths[path], `OpenAPI must register ${path}`);
    }

    for (
      let attempt = 0;
      attempt < 10 && !output.includes('"event":"http_request"');
      attempt += 1
    ) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    const requestLog = output
      .split("\n")
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .find((line) => line?.event === "http_request");
    assert.ok(
      requestLog,
      `Expected a structured request log; output was: ${output}`,
    );
    assert.equal(typeof requestLog.request_id, "string");
    for (const sensitiveField of [
      "url",
      "body",
      "query",
      "authorization",
      "cookie",
      "password",
    ]) {
      assert.equal(sensitiveField in requestLog, false);
    }
  } finally {
    child.kill("SIGTERM");
    if (child.exitCode === null) await once(child, "exit");
  }
});

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import test from "node:test";
import { NotFoundException, ValidationPipe } from "@nestjs/common";
import { toApiError, validationExceptionFactory } from "../dist/common/api-exception.filter.js";
import { PaginationQueryDto } from "../dist/common/pagination-query.dto.js";
import { PasswordHasher } from "../dist/identity/password-hasher.js";
import { JwtService } from "@nestjs/jwt";
import { AccessTokenService } from "../dist/identity/access-token.service.js";
import { hashRefreshToken, issueRefreshToken } from "../dist/identity/refresh-token.js";

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
  const tokens = new AccessTokenService(new JwtService(), "a-local-test-secret-with-more-than-32-bytes");
  const issued = await tokens.issue({ sub: "user-1", sid: "session-1", organizationId: "org-1" });

  assert.equal(issued.expiresIn, 900);
  assert.deepEqual(await tokens.verify(issued.token), {
    sub: "user-1",
    sid: "session-1",
    organizationId: "org-1",
  });
  await assert.rejects(
    new AccessTokenService(new JwtService(), "another-test-secret-with-more-than-32-bytes").verify(issued.token),
  );
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

test("validation errors use the documented field error shape", () => {
  const exception = validationExceptionFactory([
    { property: "name", constraints: { isNotEmpty: "name should not be empty" } },
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

  const transformed = await pipe.transform({ page: "2", page_size: "50" }, metadata);
  assert.ok(transformed instanceof PaginationQueryDto);
  assert.equal(transformed.page, 2);
  assert.equal(transformed.page_size, 50);

  await assert.rejects(pipe.transform({ page_size: "101" }, metadata), (error) => {
    const apiError = toApiError(error, "validation-request").error;
    assert.equal(apiError.code, "VALIDATION_FAILED");
    assert.equal(apiError.request_id, "validation-request");
    assert.deepEqual(apiError.field_errors?.map((item) => item.field), ["page_size"]);
    return true;
  });
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
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.setEncoding("utf8").on("data", (chunk) => (output += chunk));
  child.stderr.setEncoding("utf8").on("data", (chunk) => (output += chunk));

  try {
    let response;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      try {
        response = await fetch(`${baseUrl}/api/v1/status`, { signal: AbortSignal.timeout(250) });
        break;
      } catch {
        if (child.exitCode !== null) throw new Error(`API exited before becoming ready: ${output}`);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    assert.ok(response, `API failed to start: ${output}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("x-request-id") ?? "", /^[0-9a-f-]{36}$/);
    assert.deepEqual(await response.json(), { service: "inventory-api", status: "ok" });

    const live = await fetch(`${baseUrl}/api/v1/health/live`);
    assert.equal(live.status, 200);
    assert.deepEqual(await live.json(), { service: "inventory-api", status: "ok" });

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

    for (let attempt = 0; attempt < 10 && !output.includes('"event":"http_request"'); attempt += 1) {
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
    assert.ok(requestLog, `Expected a structured request log; output was: ${output}`);
    assert.equal(typeof requestLog.request_id, "string");
    for (const sensitiveField of ["url", "body", "query", "authorization", "cookie", "password"]) {
      assert.equal(sensitiveField in requestLog, false);
    }
  } finally {
    child.kill("SIGTERM");
    if (child.exitCode === null) await once(child, "exit");
  }
});

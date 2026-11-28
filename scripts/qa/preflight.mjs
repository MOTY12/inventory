import { spawnSync } from "node:child_process";
import net from "node:net";
import { ApiClient } from "./api-client.mjs";
import {
  verifyQaDatabaseTarget,
  verifyQaOwnerMembership,
} from "./database-target.mjs";
import { assertAuthorizedOrganization, assertSafeTarget } from "./safety.mjs";

const timeoutMs = (env) =>
  Math.max(1000, Number(env.QA_HTTP_TIMEOUT_MS || 8000));

function localHttpUrl(value, name, defaultValue) {
  const url = new URL(value || defaultValue);
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    url.protocol !== "http:" ||
    !["localhost", "127.0.0.1", "::1"].includes(host) ||
    url.username ||
    url.password
  ) {
    throw new Error(`${name} must be an unauthenticated loopback HTTP URL`);
  }
  return url.toString().replace(/\/$/, "");
}

function redisCommand(args) {
  return `${"*" + args.length}\r\n${args
    .map((arg) => `$${Buffer.byteLength(arg)}\r\n${arg}\r\n`)
    .join("")}`;
}

export async function probeRedis(env, { connect = net.createConnection } = {}) {
  const host = env.REDIS_HOST || "127.0.0.1";
  if (!/^(localhost|127(?:\.\d{1,3}){3}|::1)$/.test(host))
    throw new Error("Redis host must be loopback for local QA");
  if (!env.REDIS_PASSWORD)
    throw new Error("REDIS_PASSWORD is required to verify local Redis");
  const port = Number(env.REDIS_PORT || 6379);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("REDIS_PORT is invalid");
  const socket = connect({ host, port });
  const timeout = setTimeout(
    () => socket.destroy(new Error("timeout")),
    timeoutMs(env),
  );
  try {
    await new Promise((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("error", reject);
    });
    const reply = new Promise((resolve, reject) => {
      let output = "";
      socket.on("data", (chunk) => {
        output += chunk.toString("utf8");
        if (output.includes("-"))
          reject(new Error("Redis authentication or ping failed"));
        if (output.includes("+OK\r\n") && output.includes("+PONG\r\n"))
          resolve();
      });
      socket.once("error", reject);
    });
    socket.write(
      redisCommand(["AUTH", env.REDIS_PASSWORD]) + redisCommand(["PING"]),
    );
    await reply;
  } finally {
    clearTimeout(timeout);
    socket.destroy();
  }
}

async function checkApi(env, apiBaseUrl, fetchImpl) {
  for (const path of ["/health/live", "/health/ready"]) {
    const response = await fetchImpl(`${apiBaseUrl}${path}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs(env)),
      redirect: "error",
    });
    if (!response.ok)
      throw new Error(`API ${path} returned HTTP ${response.status}`);
    if (path.endsWith("/ready")) {
      const body = await response.json().catch(() => null);
      if (
        !body ||
        body.status !== "ok" ||
        typeof body.databaseIdentity !== "string" ||
        !body.databaseIdentity
      )
        throw new Error("API readiness did not return a database identity");
    }
  }
}

async function checkStorage(env) {
  const endpoint = localHttpUrl(
    env.S3_ENDPOINT,
    "S3_ENDPOINT",
    "http://127.0.0.1:9090",
  );
  const { HeadBucketCommand, S3Client } = await import("@aws-sdk/client-s3");
  const client = new S3Client({
    region: env.S3_REGION || "us-east-1",
    endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID || "inventory-local-access",
      secretAccessKey:
        env.S3_SECRET_ACCESS_KEY ||
        "inventory-local-secret-change-before-deploy",
    },
  });
  try {
    await client.send(
      new HeadBucketCommand({ Bucket: env.S3_BUCKET || "inventory-local" }),
    );
  } finally {
    client.destroy();
  }
}

async function checkAuthentication(env, apiBaseUrl) {
  const api = new ApiClient({ baseUrl: apiBaseUrl, timeoutMs: timeoutMs(env) });
  let loggedIn = false;
  try {
    await api.login(env.QA_EMAIL, env.QA_PASSWORD);
    loggedIn = true;
    const memberships = await api.get("/organizations");
    assertAuthorizedOrganization(memberships, env.QA_ORGANIZATION_ID);
  } finally {
    if (loggedIn && api.cookie.includes("refresh_token=")) {
      await api
        .raw("POST", "/auth/logout", { retryAuth: false })
        .catch(() => {});
    }
  }
}

function migrationCheck() {
  const result = spawnSync(
    "npx",
    ["prisma", "migrate", "status", "--config", "prisma.config.ts"],
    { encoding: "utf8", timeout: 30000, stdio: ["ignore", "pipe", "pipe"] },
  );
  if (result.error || result.status !== 0)
    throw new Error("Prisma migration status could not be verified");
  if (!/Database schema is up to date/i.test(result.stdout))
    throw new Error("Prisma reports pending or unknown migrations");
}

function present(name, env) {
  return Boolean(String(env[name] || "").trim());
}

function message(error, env = {}) {
  let value = error instanceof Error ? error.message : "Check failed";
  for (const key of [
    "QA_PASSWORD",
    "REDIS_PASSWORD",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
    "DATABASE_URL",
  ]) {
    const secret = env[key];
    if (secret) value = value.replaceAll(String(secret), "[redacted]");
  }
  return value
    .replace(/Bearer\s+[^\s,;]+/gi, "Bearer [redacted]")
    .replace(/(?:postgres(?:ql)?:\/\/)[^\s]+/gi, "[database URL redacted]");
}

export async function runQaPreflight(env = process.env, injected = {}) {
  const fetchImpl = injected.fetchImpl || fetch;
  const checks = [];
  const add = (name, status, details) =>
    checks.push({ name, status, ...(details ? { details } : {}) });
  const missingConfiguration = ["QA_EMAIL", "QA_PASSWORD"].filter(
    (name) => !present(name, env),
  );
  let safe;
  try {
    safe = assertSafeTarget(env, { requireCredentials: false });
    const frontendUrl = localHttpUrl(
      env.QA_WEB_BASE_URL,
      "QA_WEB_BASE_URL",
      "http://localhost:3000",
    );
    add("local-development-target", "ready");

    const tasks = [
      ["api-readiness", () => checkApi(env, safe.apiBaseUrl, fetchImpl)],
      [
        "database-and-qa-workspace",
        () =>
          (injected.verifyDatabase || verifyQaDatabaseTarget)(
            env,
            safe.apiBaseUrl,
            { fetchImpl, requireOwner: false },
          ),
      ],
      ["qa-owner-membership", () => verifyQaOwnerMembership(env)],
      [
        "redis-authenticated-ping",
        () => (injected.checkRedis || probeRedis)(env),
      ],
      [
        "object-storage-bucket",
        () => (injected.checkStorage || checkStorage)(env),
      ],
      [
        "frontend-login-page",
        async () => {
          const response = await fetchImpl(`${frontendUrl}/login`, {
            signal: AbortSignal.timeout(timeoutMs(env)),
            redirect: "error",
          });
          if (!response.ok)
            throw new Error(`Frontend /login returned HTTP ${response.status}`);
          const html = await response.text();
          if (!html.includes("Stockroom"))
            throw new Error(
              "Frontend response is not the Stockroom login page",
            );
        },
      ],
      ["migration-status", injected.checkMigrations || migrationCheck],
    ];
    for (const [name, run] of tasks) {
      if (name === "qa-owner-membership" && !present("QA_EMAIL", env)) {
        add(
          name,
          "blocked",
          "Set QA_EMAIL for an active OWNER of the verified QA workspace",
        );
        continue;
      }
      try {
        await (injected[name] || run)();
        add(name, "ready");
      } catch (error) {
        add(name, "failed", message(error, env));
      }
    }

    if (missingConfiguration.length) {
      add(
        "qa-owner-authentication",
        "blocked",
        "Set QA_EMAIL and QA_PASSWORD for an active OWNER in the verified QA workspace",
      );
    } else {
      try {
        await (injected.checkAuthentication || checkAuthentication)(
          env,
          safe.apiBaseUrl,
        );
        add(
          "qa-owner-authentication",
          "ready",
          "Owner login and workspace membership verified; session was logged out",
        );
      } catch (error) {
        add("qa-owner-authentication", "failed", message(error, env));
      }
    }
  } catch (error) {
    add("local-development-target", "failed", message(error, env));
    for (const name of [
      "api-readiness",
      "database-and-qa-workspace",
      "qa-owner-membership",
      "redis-authenticated-ping",
      "object-storage-bucket",
      "frontend-login-page",
      "migration-status",
    ])
      add(
        name,
        "blocked",
        "Skipped because the configured QA target is unsafe or incomplete",
      );
    add(
      "qa-owner-authentication",
      "blocked",
      "Skipped until local development target validation passes",
    );
  }
  const status = checks.some((item) => item.status === "failed")
    ? "FAILED"
    : checks.some((item) => item.status === "blocked")
      ? "BLOCKED"
      : "READY";
  const remediation = missingConfiguration.map(
    (name) =>
      `Set ${name} in the ignored local .env file; never print or commit credentials.`,
  );
  if (
    checks.some(
      (item) =>
        ["qa-owner-membership", "qa-owner-authentication"].includes(
          item.name,
        ) && ["failed", "blocked"].includes(item.status),
    )
  ) {
    remediation.push(
      "Set QA_EMAIL and QA_PASSWORD in ignored .env for an existing active OWNER of the exact approved QA workspace; do not reset or change the account password.",
    );
  }
  return {
    status,
    missingConfiguration,
    checks,
    remediation: status === "READY" ? [] : remediation,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = await runQaPreflight(process.env);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.status !== "READY") process.exitCode = 1;
}

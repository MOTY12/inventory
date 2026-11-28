import { isIP } from "node:net";

export const QA_ORGANIZATION_NAME = "Quality 001 QA Workspace";

function isLoopback(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return (
    host === "localhost" ||
    host === "::1" ||
    host === "127.0.0.1" ||
    (isIP(host) === 4 && host.startsWith("127."))
  );
}

export function assertSafeWebTarget(value = "http://localhost:3000") {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("QA_WEB_BASE_URL must be a local HTTP URL");
  }
  if (
    url.protocol !== "http:" ||
    !isLoopback(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("QA_WEB_BASE_URL must be a local HTTP URL");
  }
  return url.toString().replace(/\/$/, "");
}

export function assertSafeTarget(env, { requireCredentials = true } = {}) {
  if (
    !["development", "test"].includes(env.NODE_ENV) ||
    !["development", "test"].includes(env.QA_ENVIRONMENT)
  ) {
    throw new Error(
      "QA generator requires QA_ENVIRONMENT=development or test and a non-production NODE_ENV",
    );
  }
  if (
    !env.QA_ORGANIZATION_ID ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      env.QA_ORGANIZATION_ID,
    )
  ) {
    throw new Error(
      "Set QA_ORGANIZATION_ID to the explicitly approved QA organization UUID",
    );
  }
  if (env.QA_ORGANIZATION_NAME !== QA_ORGANIZATION_NAME)
    throw new Error(
      `Set QA_ORGANIZATION_NAME exactly to ${QA_ORGANIZATION_NAME}`,
    );
  const api = new URL(env.QA_API_BASE_URL || "http://localhost:4000/api/v1");
  if (
    api.protocol !== "http:" ||
    !isLoopback(api.hostname) ||
    api.port !== "4000" ||
    api.pathname.replace(/\/$/, "") !== "/api/v1"
  ) {
    throw new Error("QA_API_BASE_URL must be the local HTTP API at /api/v1");
  }
  if (!env.DATABASE_URL)
    throw new Error(
      "DATABASE_URL is required for the production-target safety check",
    );
  const db = new URL(env.DATABASE_URL);
  const database = decodeURIComponent(
    db.pathname.replace(/^\//, ""),
  ).toLowerCase();
  if (
    !isLoopback(db.hostname) ||
    !/(^|[_-])(dev|development|test|testing)([_-]|$)/.test(database)
  ) {
    throw new Error(
      "QA generator refuses a non-local or non-development/test DATABASE_URL",
    );
  }
  if (requireCredentials && (!env.QA_EMAIL || !env.QA_PASSWORD))
    throw new Error("Set QA_EMAIL and QA_PASSWORD outside source control");
  return {
    apiBaseUrl: api.toString().replace(/\/$/, ""),
    organizationId: env.QA_ORGANIZATION_ID,
  };
}

export function assertAuthorizedOrganization(memberships, organizationId) {
  const entry = memberships.find(
    (item) => item.organization?.id === organizationId,
  );
  if (!entry)
    throw new Error(
      "Authenticated account is not an active member of the approved QA organization",
    );
  if (entry.role !== "OWNER")
    throw new Error(
      "QA fixture mutation requires OWNER membership in the approved QA organization",
    );
  return entry.organization;
}

export function assertOrganizationIdentity(
  organization,
  expectedId,
  expectedName,
) {
  if (organization?.id !== expectedId || organization?.name !== expectedName)
    throw new Error(
      "Authenticated API organization identity did not match the explicitly approved QA target",
    );
}

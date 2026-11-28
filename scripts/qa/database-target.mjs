import { createHash } from "node:crypto";
import pg from "pg";

const { Client: PgClient } = pg;

export function databaseIdentityFingerprint(row) {
  return createHash("sha256")
    .update(
      [
        row.database,
        row.schema,
        row.serverAddress,
        String(row.serverPort),
      ].join("\0"),
    )
    .digest("hex");
}

export async function verifyQaDatabaseTarget(
  env,
  apiBaseUrl,
  { fetchImpl = fetch, Client = PgClient, requireOwner = true } = {},
) {
  const url = new URL(env.DATABASE_URL);
  const expectedDatabase = decodeURIComponent(url.pathname.slice(1));
  const expectedSchema =
    env.DATABASE_SCHEMA || url.searchParams.get("schema") || "public";
  if (!/^[A-Za-z_][A-Za-z0-9_$]{0,62}$/.test(expectedSchema))
    throw new Error("QA database schema identifier is invalid");

  const client = new Client({
    connectionString: env.DATABASE_URL,
    connectionTimeoutMillis: Number(env.QA_HTTP_TIMEOUT_MS || 15000),
  });
  let identity;
  try {
    await client.connect();
    await client.query("SELECT set_config('search_path', $1, false)", [
      expectedSchema,
    ]);
    const identityResult = await client.query(
      `SELECT current_database() AS database,
              current_schema() AS schema,
              inet_server_addr()::text AS "serverAddress",
              inet_server_port() AS "serverPort"`,
    );
    identity = identityResult.rows[0];
    if (
      identity.database !== expectedDatabase ||
      identity.schema !== expectedSchema ||
      typeof identity.serverAddress !== "string" ||
      !Number.isInteger(identity.serverPort)
    ) {
      throw new Error(
        "Connected PostgreSQL identity does not match the configured QA target",
      );
    }
    if (requireOwner) {
      if (!env.QA_EMAIL)
        throw new Error("Configured QA OWNER email is required");
      const owner = await client.query(
        `SELECT o.id, o.name, m.role, m.status, u.status AS "userStatus"
           FROM organizations o
           JOIN memberships m ON m.organization_id = o.id
           JOIN users u ON u.id = m.user_id
          WHERE o.id = $1
            AND o.name = $2
            AND u.email_normalized = lower($3)
            AND m.status = 'ACTIVE'`,
        [env.QA_ORGANIZATION_ID, env.QA_ORGANIZATION_NAME, env.QA_EMAIL],
      );
      if (
        owner.rowCount !== 1 ||
        owner.rows[0].role !== "OWNER" ||
        owner.rows[0].userStatus !== "ACTIVE"
      ) {
        throw new Error(
          "Configured QA account must be an active OWNER of the exact QA organization in the configured database",
        );
      }
    } else {
      const workspace = await client.query(
        `SELECT o.id,
                o.name,
                count(DISTINCT m.user_id) FILTER (
                  WHERE m.role = 'OWNER'
                    AND m.status = 'ACTIVE'
                    AND u.status = 'ACTIVE'
                )::int AS "activeOwners"
           FROM organizations o
           LEFT JOIN memberships m ON m.organization_id = o.id
           LEFT JOIN users u ON u.id = m.user_id
          WHERE o.id = $1 AND o.name = $2
          GROUP BY o.id`,
        [env.QA_ORGANIZATION_ID, env.QA_ORGANIZATION_NAME],
      );
      if (workspace.rowCount !== 1 || workspace.rows[0].activeOwners < 1)
        throw new Error(
          "The configured QA workspace identity or active OWNER membership is not valid",
        );
    }
  } catch (error) {
    if (
      error.message.includes("QA target") ||
      error.message.includes("active OWNER")
    ) {
      throw error;
    }
    throw new Error(
      "Unable to verify the configured local QA database and owner identity",
    );
  } finally {
    await client.end().catch(() => {});
  }

  const response = await fetchImpl(`${apiBaseUrl}/health/ready`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(Number(env.QA_HTTP_TIMEOUT_MS || 15000)),
    redirect: "error",
  });
  let ready;
  try {
    ready = await response.json();
  } catch {
    throw new Error("Local API readiness did not return a valid JSON identity");
  }
  if (
    !response.ok ||
    ready.databaseIdentity !== databaseIdentityFingerprint(identity)
  )
    throw new Error(
      "Running API database identity does not match the approved local QA database",
    );
  return true;
}

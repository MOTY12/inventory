import { createHash } from "node:crypto";

export type DatabaseIdentity = {
  database: string;
  schema: string;
  serverAddress: string;
  serverPort: number;
};

export function databaseIdentityFingerprint(
  identity: DatabaseIdentity,
): string {
  const value = [
    identity.database,
    identity.schema,
    identity.serverAddress,
    String(identity.serverPort),
  ].join("\0");
  return createHash("sha256").update(value).digest("hex");
}

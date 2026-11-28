import { createHash, randomBytes } from "node:crypto";

export interface IssuedRefreshToken {
  token: string;
  tokenHash: string;
}

export function issueRefreshToken(): IssuedRefreshToken {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");
  return { token, tokenHash };
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

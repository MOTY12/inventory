# Security design

## Identity/session
Use Argon2id password hashing; never store plaintext passwords. Owner-directed provisional implementation uses short-lived signed JWT access tokens and rotating/revocable refresh sessions; browser refresh tokens must use secure, HTTP-only, SameSite cookies. Rate-limit login, recovery, invitation and export endpoints. Email verification is required by the planned account lifecycle; MFA is designed for but enforcement is deferred by owner direction. These defaults are not validated customer requirements. Do not log tokens or reset links.

## Authorization
RBAC capabilities plus location scope; least privilege defaults. Deny by default. Admin/support access to tenant data is not implicit; break-glass requires customer authorization, time bound, reason, audit and alert. Enforce on API service/repository, not merely UI.

## Data isolation
Require authenticated organization membership. Every tenant-owned query includes org scope; composite foreign keys, scoped unique keys, optional PostgreSQL row-level security as defense-in-depth. Background jobs persist tenant ID and revalidate. Prevent object-store cross-tenant reads via scoped keys and short-lived signed URLs. Test guessed IDs across all resources and export paths.

## Integrity and abuse controls
CSRF protections for cookie auth; CORS allowlist; CSP/security headers; input size/type limits; SQL injection defense via parameterized ORM; upload content scanning; CSV formula injection protection; idempotency and bounded request body size; rate limits and pagination caps. Protect webhook signatures/replay.

## Audit/observability
Audit actor, organization, action, entity reference, timestamp, request ID, before/after diff excluding secrets, and reason for sensitive changes. Append-only movement ledger. Structured logs scrub PII and credentials. Alert on repeated auth failure, cross-tenant deny patterns, export spikes, job failure and integrity reconciliation mismatch.

## Operations
TLS, encryption at rest, managed secrets, dependency scanning, least-privilege IAM, separate environments, restore-tested encrypted backups, patch cadence, incident response and breach notification plan. Define retention, data deletion and data-subject processes with Nigerian privacy counsel before public launch. No production personal data in development fixtures.

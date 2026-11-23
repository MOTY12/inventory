# Tenant isolation and security review

**Review date:** 2026-11-23  
**Repository:** `develop` at `4486f87`  
**Status:** REVIEW IN PROGRESS — implementation controls and isolated tests reviewed; dependency advisory verification remains blocked.

## Scope and threat model

This review considered a shared PostgreSQL schema serving multiple independent organizations. The principal threats are a member changing organization/resource identifiers, a limited employee reaching an ungranted warehouse, a revoked user continuing to use a session, invitation/token replay, a report job or download crossing tenant boundaries, and sensitive values leaking in API errors/logs. The user is authorized by an active organization membership; warehouse visibility is additionally scoped by grants except for OWNER/ADMIN, who have organization-wide warehouse access. No support or platform administrator bypass is assumed.

Reviewed identity/session, organization membership and invitation flows, RBAC and warehouse guards, catalog, locations, inventory, imports, purchasing, sales, reporting/exports, background workers, PostgreSQL constraints/raw SQL, frontend session/workspace handling, environment configuration, Compose configuration, API errors/logging and dependency audit availability. This is a source and automated-test review, not a penetration test, browser UAT, production configuration audit, or compliance assessment.

## Findings and changes

### MEDIUM — baseline browser security response headers absent — FIXED

Before this review, neither the Nest API nor Next.js set baseline anti-sniffing, framing, referrer, cross-origin isolation, or permissions headers. Added these headers to API responses and all Next.js routes. HSTS is emitted only in production. Regression coverage asserts API response headers over HTTP. CSP was intentionally not added: Next.js currently has no nonce mechanism, while Swagger UI has inline behavior; deploy a nonce-aware CSP policy as a separately verified change.

### No confirmed critical/high application authorization defect found in reviewed paths

No cross-tenant or warehouse-grant bypass was reproduced. Tenant context is derived from the verified session's organization claim and rechecked against active membership. Role is loaded from the database, route capability metadata fails closed, and warehouse checks verify both organization ownership and user grants. Tenant-owned domain reads/writes and report SQL are scoped; raw SQL uses Prisma tagged parameters. Composite tenant constraints are present. Export processing rechecks the requester membership/role and saved warehouse scope; download also checks the downloader's current authorized scope. No `PLATFORM_ADMIN` membership role exists in the schema or assignable-role list.

## Verification evidence

- `npm test`: 51 passed, 0 failed, 2 opt-in PostgreSQL suites skipped in the default run; web suite 2 passed, 0 failed. An initial sandbox run hit local `listen EPERM`; rerunning with loopback listener permission passed, including live API response header assertions.
- `RUN_POSTGRES_INTEGRATION=1 node --test apps/api/test/postgres.integration.test.mjs`: 10 passed, 0 failed, 0 skipped. Covered refresh concurrency/reuse, logout/expiry, cross-organization selection and context denial, invitation email binding/one-time use/expiry, deactivated membership, warehouse grants, branch/warehouse tenant isolation and catalog hierarchy.
- `RUN_POSTGRES_INTEGRATION=1 node --test apps/api/test/inventory.postgres.integration.test.mjs`: 13 passed, 0 failed, 0 skipped. Covered product/catalog, CSV imports, suppliers, customers, sales orders/reservations, purchase receiving, immutable movements/balances, stock adjustments, transfers, report scope and export retry/download/expiry. These suites used generated isolated schemas; no database reset or owner data deletion was performed.
- Typecheck, lint, formatting check and production build passed after the response-header change. Prisma validation passed. `prisma migrate status` could not complete: the configured `inventory_dev` endpoint at `localhost:5433` returned a schema-engine connection error. No migration was applied.
- `npm audit --omit=dev --audit-level=high` could not reach `registry.npmjs.org` (`ENOTFOUND`). Earlier install output recorded 7 lockfile advisories (4 moderate, 3 high) without advisory detail. This review cannot clear those dependency findings; treat them as unverified and resolve them when registry access is restored.
- No authenticated interactive browser review was possible in this session. No production service, live customer database, external scanner, or production infrastructure was tested.

## Remaining risks and decisions

- Dependency advisory details and remediation are pending registry access; this prevents QUALITY-002 closure under its no-unresolved-high acceptance gate.
- Rate limiting is in-process and not distributed across API replicas. Production deployment must provide shared rate limiting before exposing auth endpoints at scale.
- CSP requires a nonce-compatible Next.js strategy and Swagger-specific verification. Current browser headers are defense-in-depth, not a complete CSP policy.
- PostgreSQL RLS and privileged support access remain deferred decisions in `docs/progress/decisions.md`; do not add a bypass or assume a support role.
- Production email, TLS/proxy configuration, secret management, object-store IAM, audit alerting, backup encryption/retention, MFA enforcement and Nigerian privacy/compliance review remain deployment/release work.
- INV-010 still lacks real browser/component event acceptance. QUALITY-003 still lacks queue/object-store recovery drills and approved RPO/RTO objectives.

## Next steps

1. Re-run `npm audit --omit=dev --audit-level=high` once registry access is available; inspect advisory details and apply only compatible fixes with tests.
2. Keep QUALITY-002 IN_PROGRESS until dependency risk is resolved or explicitly dispositioned and the no-critical/high pilot gate is evidenced.
3. Add/execute barcode component interaction coverage for real Enter and repeat-scan behavior; then continue QUALITY-003 queue/object-storage recovery work and RPO/RTO approval.

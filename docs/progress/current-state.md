# Current state

**Updated:** 2026-11-22 (Africa/Lagos)

## Repository and roadmap

- Workspace: `/Users/newuser/Documents/GitHub/inventory`; branch `develop`; starting HEAD for this verification was `966eb69`. Worktree was clean at start. No commit or push was made.
- Completed roadmap count: **27/47**, recalculated from individual task entries after restoring the missing `INV-002` heading. Newly completed during this verification: `INV-001`, `INV-002`, `INV-003`, `INV-004`, `INV-007`, `INV-008`, `INV-009`, `PROCUREMENT-001`, `PROCUREMENT-002`, `PROCUREMENT-003`, `SALES-001`, `SALES-003`. Existing completed tasks remain as listed in `docs/progress/completed-tasks.md` and the task ledger.
- No database reset, deletion, or migration deployment was performed. Docker Compose services were healthy. Prisma status reported all 19 migrations current. Synthetic QA records were used for authenticated checks; they remain in the local development database and no credentials/tokens were written to documentation.

## Acceptance evidence

- Authenticated HTTP exercised catalog units/categories, product create/edit/search/archive and conversion listing; supplier and customer lifecycle; PO draft/submission; partial then full receipt with same-key replay; sales confirmation, multiple partial picks and fulfillments; adjustment posting; warehouse transfer dispatch/receipt replay; product/opening-balance CSV preview/commit; and reorder evaluation.
- Verified cross-tenant denials for catalog, supplier/customer and inventory routes. A warehouse clerk without a grant was denied balance access and allowed after the explicit warehouse grant.
- Inventory reconciliation passed after receiving, fulfillment, imports, adjustments and transfers; replay did not duplicate receipts, transfer postings or fulfillment movements. The opt-in PostgreSQL suites additionally exercised transaction rollback, concurrency, scope and ledger behavior.
- PostgreSQL opt-in tests: `RUN_POSTGRES_INTEGRATION=1 node --test apps/api/test/postgres.integration.test.mjs apps/api/test/inventory.postgres.integration.test.mjs` passed 22/22, 0 failed, 0 skipped after new archived-supplier/customer and cross-tenant-adjustment regression assertions.
- Docker services were healthy; API readiness returned HTTP 200. Web login and low-stock routes returned HTTP 200. Prisma migration status was 19/19 current. No migration was applied in this session.

## UI and verification limits

- Interactive browser control is unavailable: browser RPC returned `Trusted RPC service is not configured: browser`. Therefore UI acceptance is not claimed from the HTTP or build checks; pages are build-verified only. Record manual authenticated UI/device workflow in `QUALITY-001`.
- The Next.js development server displayed a security advisory interstitial on first startup; `CI=1` allowed local checks to proceed. No dependency upgrade was applied. Review/update the affected Next.js dependency as a separate approved maintenance action.
- No product feature outside this acceptance-verification scope was started. Reports, invoices and payments remain unstarted or separately gated.

## Work remaining

- Final checks: typecheck, lint, and formatting passed. Default `npm test` passed 41, failed 0, with 2 opt-in PostgreSQL suites skipped; those suites were explicitly run above (22 passed, 0 failed, 0 skipped). Production build compiled and generated routes, then exited with Next.js `SecurityFatalError` because installed Next.js 16.4.3 is flagged as affected by a known security vulnerability. No upgrade or bypass was applied; this is a build/security blocker to resolve in a separately scoped change. The initial sandbox test attempt also failed on ephemeral localhost bind (`EPERM`); the approved rerun passed.
- Restore build-generated `apps/web/next-env.d.ts` and `apps/web/tsconfig.tsbuildinfo` to their initial clean state after build.
- Preserve the synthetic local QA fixtures unless the owner requests cleanup; do not delete existing records.
- Interactive Chrome acceptance, real user/device UAT, and the full receive→transfer→sale→report end-to-end scenario remain part of `QUALITY-001` / release verification, despite the focused workflow evidence here.

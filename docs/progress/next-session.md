# Next session — complete SALES-004 browser acceptance

Updated: 2026-11-28 (Africa/Lagos)

## Checkpoint

- Repository: `/Users/newuser/Documents/GitHub/inventory`; branch `develop`; HEAD `e9a09b0` (`update invoice postgres`), equal to `origin/develop` at review time. No tracked changes were made in this session; no commit, push, or deployment.
- Roadmap count remains **30/47**. SALES-004 is **IN_PROGRESS**. REPORT-002 depends on SALES-004 in `docs/implementation/dependency-map.md`, so it must not be marked complete or advanced first.
- The existing SALES-004 implementation and isolated PostgreSQL evidence (4/4), typecheck/lint/format/default suite, 18 QA harness tests and production build were already recorded. `npm run qa:test` was rerun now and passed **18/18**.

## Environment and QA workspace

- Docker Compose PostgreSQL, Redis and S3Mock are healthy. Prisma reports 22 migrations and schema up to date. Nest API was started with local DB access; readiness returned HTTP 200.
- Next dev server was started at `http://localhost:3001` because port 3000 was occupied. Chrome opened a protected route and reached `/login`; there is no authenticated session in the available Chrome tab.
- Read-only database check found exactly one `Quality 001 QA Workspace` and one active OWNER membership. Verified workspace ID/name and `NODE_ENV=development` plus `QA_API_BASE_URL=http://localhost:4000/api/v1` were added to the ignored local `.env`. No user identifiers or credentials were printed.
- `QA_SCENARIO=document-states npm run qa:seed` was attempted after this configuration and stopped safely with: `Set QA_EMAIL and QA_PASSWORD outside source control`. No API login or fixture mutation occurred.

## Exact owner action required

In the repository’s ignored `.env`, set credentials for the existing active OWNER account in that QA workspace:

```dotenv
QA_EMAIL=<owner-provided QA account email>
QA_PASSWORD=<owner-provided QA account password>
```

Do not send the password in chat or commit `.env`. If that OWNER credential is not available, provide explicit authorization to create a dedicated QA account through the supported local registration/invitation flow. Do not reset any existing password.

## Resume steps

1. Check `git status --short`, `git rev-parse --short HEAD`, and confirm `e9a09b0`; preserve any later user work.
2. After owner credentials are in ignored `.env`, verify only variable presence (never print values), then run `QA_SCENARIO=document-states npm run qa:seed`. Record the returned QA run ID.
3. Use `QA_RUN_ID=<run-id> npm run qa:verify` and inspect/resume the manifest before any retry. Do not create duplicate fixture runs blindly.
4. Sign in to the local app at the currently running port (3001 unless Next reports otherwise), using the approved QA OWNER account. Verify invoice creation/issue, sequential number, immutable issued fields, captured actual PDF, partial/full payment, reversal/replacement, customer financial history and final reconciliation.
5. Verify invoice/payment operations leave stock movement, reservations and warehouse balances unchanged. Execute the documented authorization checks only when restricted/foreign QA actor values are configured.
6. Reuse already recorded passing tests. After any source fixes, rerun relevant tests and `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`, `npm run qa:test`, `npm run build`, `git diff --check`; explicitly run affected opt-in PostgreSQL suites and report skipped counts separately.
7. Complete SALES-004 only if all mandatory acceptance is evidenced, including authenticated browser workflow and PDF file inspection. Recalculate the count from individual task entries. Then and only then advance to REPORT-002.

## Remaining blockers

- Missing `QA_EMAIL` and `QA_PASSWORD`; no authenticated Chrome session.
- Browser invoice/payment lifecycle, real PDF file capture/inspection, and browser-level financial/inventory reconciliation remain unverified.
- No separate P0 implementation task is dependency-ready ahead of SALES-004 in the approved graph: REPORT-002 depends on SALES-004, and QUALITY-001 depends on REPORT-002. Preserve this order rather than bypassing dependencies.

No persistent business data was changed in this session.

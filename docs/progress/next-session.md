# Next session checkpoint

**Updated:** 2026-11-25 (Africa/Lagos)

## Resume facts

- Repository `/Users/newuser/Documents/GitHub/inventory`, branch `develop`, start HEAD `8d3e044`. Preserve the current uncommitted QA scenario implementation; no commit was made.
- Current roadmap count is **30/47**. No task newly completed. `SALES-004`, `REPORT-002`, and `QUALITY-001` remain IN_PROGRESS; QUALITY-001 operational acceptance is NOT RUN.
- No migration, reset, deletion, production deployment, or account/password change occurred.

## Work completed in this session

- Added scenario registry supporting `baseline` and `document-states`; other names fail closed.
- New QA manifests use schema version 2, while the validator continues to accept valid v1 baseline manifests.
- Implemented the PO and sales-order document-state fixture and verifier. It creates run-isolated PO states DRAFT, SUBMITTED, PARTIALLY_RECEIVED, RECEIVED and CANCELLED, plus SO states DRAFT, CONFIRMED, PARTIALLY_FULFILLED, FULFILLED and CANCELLED, through normal authenticated APIs. Verification checks exact quantity fields with scaled integers. The test uses an API-shaped fake; no live scenario execution is claimed.
- Added a seed/resume regression asserting PO/SO document counts remain stable across replay.
- Updated `scripts/qa/manifest.mjs`, `scripts/qa/workflow.mjs`, `scripts/qa/workflow.test.mjs`, and added `scripts/qa/scenarios/{registry.mjs,document-states.mjs}`. Updated QA guide, acceptance record, task ledger, master plan, progress summaries and session log.

## Checks and actual outcomes

- `npm run qa:test`: **14/14 passed**.
- `npm test`: **60 API/shared passed; 3 opt-in PostgreSQL suites skipped; web 2/2 passed**.
- Explicit isolated PostgreSQL test commands: `postgres.integration.test.mjs` **10/10**, `inventory.postgres.integration.test.mjs` **13/13**, `sales-invoices.postgres.integration.test.mjs` **3/3**; total **26/26**, no skipped tests. Initial sandbox attempts got EPERM; elevated local reruns passed against temporary schemas.
- `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build --workspace=@inventory/api`, isolated-copy `next build --webpack` (**29 routes**), `npm run db:validate --workspace=@inventory/api`, read-only `npx prisma migrate status --config prisma.config.ts` (**22/22 current**), and `git diff --check` passed.
- `docker compose ps`: PostgreSQL, Redis and S3Mock healthy. QA configuration check reported `DATABASE_URL` set, while `NODE_ENV`, `QA_ENVIRONMENT`, `QA_API_BASE_URL`, `QA_ORGANIZATION_ID`, `QA_ORGANIZATION_NAME`, `QA_EMAIL`, and `QA_PASSWORD` are missing. No secret values were printed.
- Started and left the NestJS API and Next.js web dev servers running. API readiness returned HTTP 200 and a read-only PostgreSQL identity query matched its database fingerprint. Chrome rendered `http://localhost:3000/login`; no credentials were entered, so authenticated browser acceptance did not run. No QA seed, CSV/PDF validation, or EXPLAIN run occurred. No fixture/business data was mutated.

## Exact next steps

1. The local API and web servers are running on ports 4000 and 3000. Recheck `/api/v1/health/ready` and database fingerprint if either process restarted. Configure the already approved QA organization ID/name and existing active OWNER login in ignored `.env`; do not invent an account or modify a password.
2. Run `npm run qa:test`; run `QA_SCENARIO=document-states npm run qa:seed`, record the run ID, then `QA_SCENARIO=document-states QA_RUN_ID=<id> npm run qa:verify`; resume with `QA_SCENARIO=document-states QA_RUN_ID=<id> npm run qa:resume` and verify again. Compare PO/SO, receipt, fulfillment, reservation, movement and balance counts before/after resume.
3. Extend document states to cover draft/issued/unpaid/partial/paid/reversed/overdue/no-due-date/void invoices, with exact amount and payment-status assertions.
4. Implement a true multi-currency scenario with NGN and USD source transactions and report/aging/pagination reconciliation; do not apply exchange conversion.
5. Implement and exercise authorization using approved isolated identities and the existing role model, including tenant/warehouse/export revocation denial.
6. Add financial-export execution using the existing REPORT-003 queue; download, parse and reconcile all four supported CSV types to API pages.
7. Complete authenticated SALES-004 and REPORT-002 browser acceptance plus disposable-schema EXPLAIN evidence. Then execute the named QUALITY-001 full lifecycle and record actual IDs/results.
8. Update all progress docs and count from individual task entries; leave task states/count unchanged until their full acceptance is evidenced. Do not commit or push unless separately directed.

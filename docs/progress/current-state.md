# Current state

**Updated:** 2026-11-25 (Africa/Lagos)

## Repository and roadmap

- Repository: `/Users/newuser/Documents/GitHub/inventory`; branch `develop`; HEAD at session start was `8d3e044` (`update develop`). Worktree was clean at session start; this session has uncommitted QA scenario implementation and documentation updates.
- Roadmap count remains **30/47**. No task became complete. SALES-004 and REPORT-002 remain IN_PROGRESS; QUALITY-001 is IN_PROGRESS for tooling and fixture implementation only. Its operational acceptance remains NOT RUN and dependency-gated.
- No commit, push, deployment, migration application, database reset, or deletion occurred.

## QA fixture scenario work

- Added a scenario registry. Supported selectors are `baseline` and `document-states`; unsupported names fail closed.
- New runs write schema-version-2 manifests with an export resource collection and scenario metadata. Valid schema-version-1 baseline manifests remain loadable.
- `document-states` uses ordinary API operations to prepare draft/submitted/partial/received/cancelled PO records and draft/confirmed/partial/fulfilled/cancelled sales orders. Its verifier reads live documents and checks eleven expected statuses plus exact ordered/received/picked/fulfilled quantities using scaled integers. A mocked API-shaped test exercises seed and resume and confirms document counts do not increase.
- This is fixture implementation only. No live authenticated scenario was seeded. Invoice lifecycle variants, multi-currency, restricted/foreign authorization sessions, financial CSV export capture/reconciliation, and browser acceptance remain unimplemented or unrun.
- Changed paths: `scripts/qa/manifest.mjs`, `scripts/qa/workflow.mjs`, `scripts/qa/workflow.test.mjs`, new `scripts/qa/scenarios/registry.mjs`, new `scripts/qa/scenarios/document-states.mjs`, plus QA and progress documentation.

## Environment and verification

- Docker Compose reports PostgreSQL, Redis, and S3Mock healthy. Read-only Prisma status: **22 migrations, up to date** in `inventory_dev.public`. No migration was applied this session.
- QA environment configuration presence check: `DATABASE_URL` is set; `NODE_ENV`, `QA_ENVIRONMENT`, `QA_API_BASE_URL`, `QA_ORGANIZATION_ID`, `QA_ORGANIZATION_NAME`, `QA_EMAIL`, and `QA_PASSWORD` are missing. Secret values were not printed. Do not create/change accounts or passwords to bypass this gate.
- `npm run qa:test`: **14 passed, 0 failed, 0 skipped**.
- `npm test`: **60 API/shared passed, 0 failed, 3 opt-in PostgreSQL skipped; web 2 passed, 0 failed**.
- Explicit opt-in PostgreSQL runs, individually and with local DB access: auth/organization **10/10**, inventory/procurement/sales/transfers/report infrastructure **13/13**, SALES-004/reporting **3/3**; **26/26 total**, no skips/failures. An initial sandbox-only attempt failed with EPERM/database unavailable; the elevated local runs passed using isolated test schemas.
- `npm run typecheck`, `npm run lint`, `npm run format:check`, API build, isolated-copy Next Webpack production build (**29 routes**), `npm run db:validate --workspace=@inventory/api`, read-only migration status, and `git diff --check` passed. The ordinary web build was isolated because an existing Next dev process may hold the shared `.next` lock.
- Started the API and web dev servers and left them running. `/api/v1/health/ready` returned **HTTP 200**; a read-only CLI PostgreSQL identity query matched the API's fingerprint. Chrome rendered `http://localhost:3000/login` and showed the Stockroom sign-in form. No credentials were entered. No QA fixture mutation, authenticated UI workflow, CSV download capture, PDF inspection, or performance EXPLAIN was performed.

## Next actions

1. Configure the existing approved QA organization and active OWNER values in ignored `.env`; do not invent credentials. Verify live API readiness and API/CLI database identity.
2. Run `npm run qa:test`, then seed and verify `QA_SCENARIO=document-states`; inspect manifest IDs, status values, movements and counts. Resume and verify a second time to confirm no duplicate documents or movements.
3. Implement and test invoice-state variants in the document-state scenario, then add NGN/USD fixtures with currency-separated report assertions and pagination.
4. Implement authorization fixtures using separate explicitly configured or isolated integration-test users; add the financial export scenario with downloaded CSV parsing and exact API reconciliation.
5. Run authenticated SALES-004 and REPORT-002 browser acceptance and representative disposable-schema EXPLAIN measurements. Only then run `COMPLETE_INVENTORY_BUSINESS_LIFECYCLE` for QUALITY-001.
6. Keep SALES-004, REPORT-002, and QUALITY-001 IN_PROGRESS and the count at **30/47** until the task ledger acceptance criteria and required evidence are complete.

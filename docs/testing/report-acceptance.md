# Report acceptance gate

REPORT-002 remains IN_PROGRESS and dependency-gated on PROCUREMENT-003 and SALES-004. Do not advance the roadmap count while SALES-004 browser acceptance remains open.

## Reusable browser suite

The Playwright suite `tests/e2e/reports/business-reports.spec.mjs` reuses the common safe run-manifest loader and OWNER sign-in helper from `tests/e2e/support/qa-browser.mjs`. It requires a completed `financial-exports` manifest containing the paired NGN/USD scenario and all eight API-reconciled exports. It exercises the business-report UI for summary, detail and receivables aging views; date, branch, warehouse, currency, status, search and sort filters; and captures each actual CSV download from the UI. Downloaded rows are parsed and reconciled against tenant-scoped report API responses with exact decimal arithmetic. The report export history includes a stable export-ID data attribute for exact manifest selection.

After services are running and `npm run qa:preflight` returns READY, run:

```bash
QA_SCENARIO=financial-exports npm run qa:seed
QA_SCENARIO=financial-exports QA_RUN_ID=<actual-run-id> npm run qa:verify
QA_SCENARIO=financial-exports QA_RUN_ID=<actual-run-id> npm run qa:e2e:reports
```

Use only the printed run ID, preserve the manifest and artifacts, and resume rather than creating duplicate records. Browser CSV capture is not verified until the Playwright run completes and the downloaded files are inspected/reconciled. The finance acceptance is separate:

```bash
QA_SCENARIO=document-states npm run qa:seed
QA_SCENARIO=document-states QA_RUN_ID=<actual-run-id> npm run qa:verify
QA_SCENARIO=document-states QA_RUN_ID=<actual-run-id> npm run qa:e2e:finance
```

## Current evidence (2026-11-28)

- `npm run qa:test`: 29 passed, 0 failed, 0 skipped, including focused report CSV/API exactness and mismatch rejection.
- `npm run qa:e2e:reports -- --list`: discovers one report browser acceptance test. Discovery only; it was not executed. `npm run qa:e2e:finance -- --list` discovers one finance test; also not executed.
- This session's `npm run qa:preflight` failed API readiness, PostgreSQL/database target checks, Redis, S3Mock, frontend and migration status because the local services were unavailable. It could not verify current OWNER eligibility. A prior preflight verified the QA workspace but rejected the configured login because it was not an active OWNER there.
- No QA scenario was seeded; no browser, PDF, or CSV file was captured. No business record was changed. REPORT-002 remains IN_PROGRESS and completed count remains 30/47.

Remaining gaps include pagination across more than one page, the complete role/tenant/warehouse denial matrix and revocation cases, representative EXPLAIN ANALYZE evidence, and actual browser execution. A build or test listing does not satisfy these acceptance criteria.

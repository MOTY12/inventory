# Report acceptance gate

REPORT-002 remains in progress. Its existing reporting APIs, UI, exports, and PostgreSQL tests do not remove the approved dependency on SALES-004 and PROCUREMENT-003. Do not advance the roadmap count while SALES-004 browser acceptance remains open.

After the SALES-004 gate closes, run the existing `multi-currency`, `financial-exports`, and (only with approved actors) `authorization` QA scenarios using `npm run qa:preflight`, `npm run qa:seed`, the recorded `QA_RUN_ID`, and `npm run qa:verify`. Capture actual CSV downloads and reconcile file rows to tenant-scoped API/database results. Verify currency separation, report filters, role/tenant/warehouse denial, populated UI, and query performance evidence before closing REPORT-002. A route response or production build alone is insufficient.

Current stage is still SALES-004. This session did not add new REPORT-002 implementation because its approved dependencies are not complete; existing REPORT-002 code and evidence remain documented in the task ledger.

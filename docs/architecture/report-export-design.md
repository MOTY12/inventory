# Asynchronous report export design

**Status:** Implemented in progress; acceptance is not closed. Updated 2026-11-23.

## Workflow and ownership

- Reports are generated from existing REPORT-001 service methods. The API validates the report type and filters, derives the active organization from the authenticated membership, checks `reports:read`, and captures the authorized warehouse IDs.
- `ReportExport` in PostgreSQL is the durable source of truth for job state and metadata. Redis/BullMQ stores only the queue payload (`exportId`, retry generation), never report rows or file contents. A periodic dispatcher re-adds PENDING rows after process startup, and stable job IDs suppress duplicate queue insertion.
- Processing checks the requester still has an active membership and report capability. It rechecks warehouse authorization against the saved scope before generating output. A retry increments `retrySequence`, so an older queue message cannot overwrite a newer retry.
- Supported states: `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`, `EXPIRED`. BullMQ uses three attempts with exponential delay. The database retains the final state and safe user-facing error; structured operational logs retain IDs, attempt number and error class, not raw exception text.

## Report scope and consistency

- Inventory Summary and Valuation reuse `ReportingService.inventorySummary`/`valuation`; the exporter does not duplicate cost calculations. Movements reuse `movementsAt` with a request-time cutoff. Low Stock reuses `lowStock` and is a current alert snapshot evaluated when the worker starts.
- For Summary and Valuation, the export stores the requested `as_of` value, or request time when the user did not choose one. The worker passes that cutoff to every page, so immutable movement and reservation history is evaluated against the same instant. Movement filters are preserved and capped at the export request time.
- Each report page is bounded to 100 rows and requested in stable service order. The async generator yields CSV under Node stream backpressure, writes to a temporary file, then uploads that file. It does not load the whole report into application memory. Exports are capped by `REPORT_EXPORT_MAX_ROWS` (default 1,000,000).
- The cutoff preserves ledger-derived quantities, reservations and weighted-average valuation as of the same instant. Product/category labels and active catalog/report-rule membership are not temporal records; they reflect current catalog/report service behavior. Low-stock is not historical and can change while a long export is paging. Those dimensions are limitations of the current reporting model, not a claim of a full database MVCC snapshot across the job.
- Currency remains a per-row field (and existing report totals remain grouped by currency); CSV output does not combine different currencies. Numeric values are serialized from exact decimal strings.

## CSV and private storage

- Text fields are quoted and quote-escaped. Formula-like text prefixes (`=`, `+`, `-`, `@`) are prefixed with an apostrophe even after leading whitespace/control characters. Numeric fields are emitted only when they match a decimal grammar, preserving negative values without treating arbitrary strings as numbers. Output uses UTF-8 BOM and CRLF rows.
- Files are stored in the configured private S3-compatible bucket under `organizations/{organizationId}/report-exports/{exportId}/report.csv`. No ACL/public URL is created. Production startup requires explicit endpoint and credentials; local S3Mock values are development defaults only.
- Downloads stream through the authenticated API and recheck the active organization, the export requester’s active membership/report role, the downloader’s warehouse scope and expiry. Responses use `private, no-store`. Default expiry is 24 hours, configurable from 1–168 hours; hourly cleanup removes expired objects and marks jobs `EXPIRED`.
- PostgreSQL persistence retains export metadata/history after file expiry. Retrying a failed export reuses the deterministic object key and overwrites a partial prior upload instead of creating a duplicate object.

## Configuration

- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`
- `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`
- `REPORT_EXPORT_TTL_HOURS` (default `24`)
- `REPORT_EXPORT_MAX_ROWS` (default `1000000`)

See `.env.example` for local values. The API contract test may set `REPORT_EXPORT_WORKER_ENABLED=false` to avoid opening Redis connections in its route-only subprocess; normal runtime enables the worker unless explicitly disabled.

## Verification still required

- Isolated PostgreSQL + Redis/BullMQ + S3Mock currently verifies Inventory Summary queueing, generation, scoped result values, private object read, and cleanup.
- Movement, Valuation, Low Stock, expiry cleanup, queue recovery after process restart, authenticated HTTP download/retry, and browser flows need integration acceptance before REPORT-003 can be marked complete.

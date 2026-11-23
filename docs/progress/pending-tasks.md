# Pending work

This summary is subordinate to the unique task statuses and dependencies in `docs/implementation/task-breakdown.md`.

## Current implementation

- **INV-010 — IN_PROGRESS:** Existing scanner workflows now have a focused submit/queue regression (one scan once, repeated rapid scans sequentially). Browser acceptance remains for native Enter-key behavior, workspace switching and UI feedback; keep open until that evidence exists.
- **REPORT-003 — IN_PROGRESS:** Async CSV exports now have persisted jobs, BullMQ, private S3 storage, authenticated history/retry/download, and Reports UI. Inventory Summary passed isolated PostgreSQL + Redis/BullMQ + S3Mock integration. Verify Movement, Valuation and Low Stock exports, expiry cleanup and authenticated/browser workflows before closure.

## Product/architecture approvals and production follow-up

- **PROD-002 — IN_PROGRESS:** Validate target segment/brand, statutory tax and invoice obligations, pricing/subscription limits before customer commitments.
- **ARCH-002 — IN_PROGRESS:** Decide RLS and privileged support access. Do not expand tenant security boundary without approval.
- **FOUNDATION-006 hardening:** Production email provider, distributed/shared rate limiting, and automated browser E2E remain follow-up work.
- Product, legal/accounting, hosting/data-residency, MFA enforcement, and billing decisions remain documented in `docs/progress/decisions.md`.

## Roadmap tasks not yet started

- After REPORT-003, check dependencies and approval gates in `docs/implementation/task-breakdown.md` before selecting another task. Do not implement tax/invoice/payment behavior that depends on unresolved decisions.
- QUALITY-001 interactive end-to-end UAT remains unverified because browser RPC is unavailable.

## Environment/verification gaps

- npm advisory audit could not connect to the registry in this environment. Next.js is now 16.4.6 and production build passed, but dependency audit status remains unknown.
- No report performance benchmark or manual authenticated report UI session was conducted.
- The default API contract test requires a local listener and fails with `listen EPERM` in the current environment; focused tests were run without that test and it is not counted as passing.

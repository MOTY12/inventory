# Pending work

This summary is subordinate to the unique task statuses and dependencies in `docs/implementation/task-breakdown.md`.

## Current implementation

- **INV-010 — IN_PROGRESS:** Keyboard barcode input and exact tenant-scoped barcode lookup are wired into new sales orders. Verify repeated scans increment base-unit quantity, keyboard Enter behavior, and unknown-code error; assess camera scanning feasibility. Keep in progress until evidence exists.

## Product/architecture approvals and production follow-up

- **PROD-002 — IN_PROGRESS:** Validate target segment/brand, statutory tax and invoice obligations, pricing/subscription limits before customer commitments.
- **ARCH-002 — IN_PROGRESS:** Decide RLS and privileged support access. Do not expand tenant security boundary without approval.
- **FOUNDATION-006 hardening:** Production email provider, distributed/shared rate limiting, and automated browser E2E remain follow-up work.
- Product, legal/accounting, hosting/data-residency, MFA enforcement, and billing decisions remain documented in `docs/progress/decisions.md`.

## Roadmap tasks not yet started

- Check task dependencies and open decision gates in `docs/implementation/task-breakdown.md` before implementation. Current candidates after INV-010 include procurement/sales finance records, report exports, and report/dashboard extensions; do not implement tax/invoice/payment behavior that depends on unresolved decisions.
- QUALITY-001 interactive end-to-end UAT remains unverified because browser RPC is unavailable.

## Environment/verification gaps

- npm advisory audit could not connect to the registry in this environment. Next.js is now 16.4.6 and production build passed, but dependency audit status remains unknown.
- No report performance benchmark or manual authenticated report UI session was conducted.

# Finance browser acceptance

The Playwright finance test is intentionally opt-in. It operates only on an approved `document-states` QA manifest and its run-scoped `browserAcceptanceOrder`; it rejects a mismatched organization or missing fixture before opening the application. Preflight must return READY before fixture creation.

```bash
QA_SCENARIO=document-states npm run qa:seed
QA_RUN_ID=<printed-run-id> npm run qa:verify
QA_RUN_ID=<printed-run-id> npm run qa:e2e:finance
```

The finance browser test logs in through the UI, selects the configured QA workspace, creates or resumes the invoice linked to the seeded confirmed order, issues it, downloads the actual PDF, records 30,000 and 50,000 NGN payments, reverses the second payment, records a 50,000 NGN replacement, and checks the customer financial history. It uses unique invoice notes and deterministic payment references to discover work after interruption and refuses ambiguous duplicates. It uses read-only database queries to reconcile exact four-decimal totals and compare inventory balance/reservation/movement snapshots before and after.

Expected controlled reconciliation is gross recorded payments 130,000 NGN, reversed payment 50,000 NGN, effective paid 80,000 NGN, and outstanding 0 NGN. These are test expectations only; they are not evidence until a browser run succeeds. PDF validation checks the downloaded bytes, signature, invoice number, customer, product, quantity, unit price, currency, and total. Artifacts are saved under ignored `.qa-artifacts/` and must not be committed.

Run-specific artifacts and manifest records remain in ignored `.qa-artifacts/` and `.qa-runs/`. Retries are disabled; recovery is explicit through manifest and database identity, not by blindly re-running mutations. The test uses no stored browser authentication state.

## Current result (2026-11-28)

Playwright discovers one finance test, which shares `loadQaBrowserRun` and `signInQaOwner` with the report suite. The finance workflow has **not** run. The latest preflight could not reach the API/database or local services, so it could not test OWNER eligibility; a prior preflight found the configured user was not an active OWNER of the approved workspace. No QA run ID exists for this workflow. Do not mark SALES-004 complete until this test and all other acceptance criteria have actual evidence.

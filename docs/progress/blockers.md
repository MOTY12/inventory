# Blockers and constraints

## Implementation follow-ups

- **Automated browser E2E:** No automated browser test suite exists. Manual Chrome testing verified registration, mailbox email verification, login, dashboard, organization setup, locations page, branch/warehouse creation, and persistence after reload. Role/grant settings and full refresh/logout UI remain unverified in Chrome.
- **Docker access in sandbox:** Docker Compose services were started and verified using approved external access. PostgreSQL, Redis and S3Mock report healthy; PostgreSQL is reachable at `localhost:5433`.
- **Production email:** Only the development/test delivery adapter is configured. Production email provider and operational delivery behavior remain open.
- **Distributed rate limits:** Authentication throttling is process-local and does not coordinate multiple API replicas. Add shared storage before horizontal production operation.
- **FOUNDATION-009:** Complete. Migration applied and PostgreSQL integration tests passed 9/9. Manual Chrome workflow succeeded.
- **Local development account:** Created and email-verified using the local development mailbox; Chrome login and dashboard navigation passed. Credentials were given to the user in this session; do not store the password in progress documentation.
- **Development server lifecycle:** `npm run build` replaces the API `dist` output while `nest start --watch` is running, briefly stopping the API; restart the dev API after production builds. Current API has been restarted successfully. The existing frontend on port 3000 returned HTTP 200.

## Planning constraints

- **REA CDP unavailable:** Browser target discovery at `127.0.0.1:9222` was unavailable. Public official pages and visible browser evidence were used as documented; no Chrome reconfiguration was done.
- **Material decisions pending:** target segment/brand, tax and statutory invoice scope, subscription pricing/limits, production data residency/hosting commitments, MFA enforcement, RLS and privileged support access remain open in `decisions.md`. Owner defaults are provisional assumptions, not validated requirements.
- **Interview evidence deferred:** the protocol exists; interviews are deferred to pilot validation and no participant findings are claimed.

# Local QA preflight

Use `npm run qa:preflight` before creating or changing QA fixtures. This command is read-only apart from verifying authentication, which creates a normal login session and immediately logs it out. It never seeds business records.

The preflight checks a loopback development/test target, API liveness/readiness and database fingerprint, exact configured QA organization identity and active OWNER membership, Redis authentication/PING, the configured object-storage bucket, the frontend login page, Prisma migration status, and owner login/workspace access. It prints structured `READY`, `BLOCKED`, or `FAILED` output and redacts credential-like values.

Configure the following only in the ignored repository `.env` file. The approved resolution for the current blocker is to use credentials for the existing active OWNER in the exact QA workspace:

```dotenv
NODE_ENV=development
QA_ENVIRONMENT=development
QA_API_BASE_URL=http://localhost:4000/api/v1
QA_WEB_BASE_URL=http://localhost:3001
QA_ORGANIZATION_ID=<approved QA workspace UUID>
QA_ORGANIZATION_NAME="Quality 001 QA Workspace"
QA_EMAIL=<active OWNER email in that workspace>
QA_PASSWORD=<owner-provided password>
DATABASE_URL=<approved local development database URL>
REDIS_PASSWORD=<local Redis password>
```

Never paste credentials into source, manifests, shell output, or chat. Do not reset a user's password. If the existing eligible OWNER credential is unavailable, require explicit authorization before creating a dedicated local QA account through supported registration/invitation workflows. Never seed unless preflight returns READY.

`QA_WEB_BASE_URL` must point to the Stockroom web server. The current local setup uses port 3001 because another app occupies port 3000. The preflight checks migrations only; it does not apply migrations or reset data.

## Latest result (2026-11-28)

`npm run qa:preflight` confirmed safe local target configuration, then failed API readiness, PostgreSQL/database identity, Redis, S3Mock, frontend `/login`, migration status, and authentication because local services were unavailable in the execution environment (`fetch failed` / loopback `EPERM`). The OWNER membership check could not complete, so this run does not establish whether the configured account is eligible. The previous preflight had verified the QA workspace but found the configured login was not an active OWNER of it. The owner selected the existing OWNER credential path; after services are available, set `QA_EMAIL` and `QA_PASSWORD` in ignored `.env` to that existing owner's credentials and rerun preflight. No fixture or financial document was created. See `docs/progress/next-session.md` for exact resume steps.

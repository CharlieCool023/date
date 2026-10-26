---
name: run-velum
description: Start, run, smoke-test, screenshot, or stop the Velum monorepo locally (Next.js web, realtime WebSocket server, pg-boss worker, Postgres/Redis/S3 storage in Docker), preview email templates, or run its tests. Use when asked to run Velum, launch the app, check a change works in the real app, screenshot a page or an email, or mint an invite.
---

Velum is a pnpm/Turborepo monorepo with three apps (web on :3000, realtime on :4001, worker) plus Docker infra. Drive it with `.claude/skills/run-velum/driver.sh`, which brings up the infra, launches all apps, smoke-tests them with `curl`, screenshots pages with headless Chrome, and previews emails. Verified on Windows 11 with Git Bash, Docker Desktop, Node 22.21 and pnpm 10.28.

All paths are relative to the repo root.

## Prerequisites

- Node 22+, pnpm 10 (`packageManager: pnpm@10.28.2`), Docker Desktop.
- Docker Desktop must be **running**. If `docker ps` fails with `open //./pipe/dockerDesktopLinuxEngine`, start it:
  `powershell.exe -Command 'Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"'`, then wait until `docker info` succeeds.
- Chrome or Edge, for screenshots. The driver finds it automatically.

## Setup (once)

```bash
pnpm install
```

`.env` at the repo root is gitignored. If it's missing, create it from `.env.example` and replace every `replace-with-...` value with random bytes:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # SESSION_SECRET, LOCAL_DEV_MASTER_KEY, BLIND_INDEX_KEY
```

Settings that matter locally:

- **Storage:** `STORAGE_ENDPOINT="http://localhost:9000"`, `STORAGE_ACCESS_KEY` set, and a `STORAGE_SECRET_KEY` of at least 8 characters. Docker Compose reads these to configure SeaweedFS.
- **Email:** `EMAIL_API_KEY` is a Resend key. A send-only key is fine. `EMAIL_FROM` must be on a domain verified in Resend.
- **Admin:** `ADMIN_EMAILS` must contain the founder's email **before** that person registers, because the role is assigned at sign-up.

## Run (agent path)

```bash
bash .claude/skills/run-velum/driver.sh up        # docker infra + buckets + schema (if missing) + seed; ~20s
bash .claude/skills/run-velum/driver.sh dev       # FOREGROUND: run with run_in_background; log -> /tmp/velum-run/dev.log
bash .claude/skills/run-velum/driver.sh wait      # blocks until web + realtime are up; fails loudly on startup errors
bash .claude/skills/run-velum/driver.sh smoke     # curl health/zones/pages/realtime + lists pg-boss schedules
bash .claude/skills/run-velum/driver.sh shot /signin          # -> /tmp/velum-run/signin.png
bash .claude/skills/run-velum/driver.sh email session_proposed # render template (no send) -> /tmp/velum-run/email-session_proposed.png
bash .claude/skills/run-velum/driver.sh stop      # kill :3000/:4001 listeners + worker/turbo node processes
```

| command | what it does |
|---|---|
| `up` | Runs `docker compose up -d --wait` for postgres, redis and storage, then the one-shot `storage-buckets`. Applies `packages/db/migrations/0001_initial.sql` with psql if the `zones` table doesn't exist, then runs `pnpm db:seed`. |
| `dev` | Loads `.env` into the environment, then `exec pnpm dev` (turbo runs all three apps). |
| `wait` | Polls `dev.log` for Next's `Ready in` and Fastify's `Server listening at`, then checks for `ERR_`/`Error:` lines. |
| `smoke` | Expects health `{"status":"ok"}`, 2 Lagos zones, 200 for `/`, `/signin` and `/invite`, realtime **403**, and 5 pg-boss schedules. |
| `shot [path] [name]` | Headless Chrome at 1280×900 with an 8s virtual-time budget. |
| `email [template]` | Runs `renderEmail` from `packages/email` and screenshots the HTML. Template names are the `EmailTemplate` union in `packages/email/src/index.ts`. |
| `stop` | Necessary because killing the `pnpm dev` shell leaves orphaned node processes on Windows. |

Artifacts go to `$VELUM_RUN_DIR`, which defaults to `/tmp/velum-run`. In Git Bash that's `C:\Users\<you>\AppData\Local\Temp\velum-run\` (check with `cygpath -w /tmp/velum-run`). Use the Windows path with the Read tool to look at screenshots.

**Mint an invite.** This sends a **real** email through Resend on the worker's next one-minute scan:

```bash
set -a; . ./.env; set +a; pnpm cli invite:mint --email=person@example.com
docker compose exec -T postgres psql -U velum -d velum -c "select template,status,attempts from email_outbox"
```

The token is never printed; the link only exists in the email. To test sending without emailing anyone, use Resend's sandbox recipient `delivered@resend.dev`.

## Run (human path)

```bash
docker compose up -d; set -a; . ./.env; set +a; pnpm dev   # open http://localhost:3000; Ctrl-C, then driver.sh stop
```

Passkeys (WebAuthn) are tied to `localhost`, so sign-up works only in Chrome or Edge on this machine. To sign up, open an invite link, create a passkey, save the recovery codes, then onboard: eligibility, 2 photos, a selfie, 12 answers and availability. The founder admin approves verifications at `/admin`, and can approve their own.

## Test

```bash
pnpm test        # 10 turbo tasks; contracts 3, core 3, email 5 tests
pnpm typecheck   # 10 tasks
pnpm --filter @velum/email test
```

## Gotchas

- **`pnpm db:migrate` is broken.** `packages/db/migrations/` has a hand-written `0001_initial.sql` but no `meta/_journal.json`, so drizzle-kit fails with `Can't find meta/_journal.json file`. `driver.sh up` applies the SQL directly with psql instead.
- **Root `.env` isn't loaded automatically.** Each app's `dotenv/config` reads `.env` from that package's own directory, not the repo root. Always run `set -a; . ./.env; set +a` first; turbo's `globalPassThroughEnv` then passes the variables to every app.
- **MinIO images are gone.** `minio/minio` and `minio/mc` fail on Docker Hub with "pull access denied", and Quay returns 401. Storage is SeaweedFS (`chrislusf/seaweedfs:3.97`) with `-ip.bind=0.0.0.0`; without that flag it listens only on the container IP and the `localhost` health check never passes.
- **Emails render with React Email from a `.tsx` layout.** tsx in the worker doesn't apply its tsconfig `jsx` setting to files in other workspace packages. That's why `packages/email/src/email-layout.tsx` starts with `/** @jsxRuntime automatic */` and `/** @jsxImportSource react */`. Remove them and the worker fails with `React is not defined`.
- **The worker swallows send errors.** `sendOutboxItem` uses a bare `catch {}`, so outbox rows only show `failed` plus a backoff of 30s·2^attempts. To retry immediately after a fix:
  `docker compose exec -T postgres psql -U velum -d velum -c "update email_outbox set status='pending', send_after=now() where status='failed'"`.
- **Realtime returning 403 on plain `curl` is correct.** The server checks Origin and the session.
- **The background `pnpm dev` task dies but its children don't.** On Windows they keep :3000 and :4001, so the next `dev` fails or serves stale env. Run `driver.sh stop` before relaunching, and after any `.env` change.

## Troubleshooting

- **`ERROR: Top-level await is currently not supported with the "cjs" output format`** (realtime or worker): the app's `package.json` is missing `"type": "module"`. Now fixed in both.
- **`Cannot find package 'dotenv'`** (realtime or worker): add it with `pnpm --filter @velum/realtime --filter @velum/worker add dotenv@^16.4.7`. Now fixed.
- **`Key (name)=(email.scan) is not present in table "queue"`**: pg-boss v10 needs `createQueue` before `schedule`. The worker now creates its queues after `boss.start()`.
- **`pnpm cli invite:mint` prints usage and exits 2**: the root script used to pass a literal `--`. Fixed in `package.json`. The CLI also used to hang after success; it now closes the DB pool.
- **`dependency failed to start: container date-storage-1 is unhealthy`**: SeaweedFS is missing `-ip.bind=0.0.0.0`, or wasn't given its roughly 15s for raft leader election. `start_period: 20s` covers that.
- **Resend `401 restricted_api_key`** on `GET /domains`: the key is send-only. That's fine for sending, but you can't list domains with it.

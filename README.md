# Velum

Velum is an invite-only dating PWA built around anonymous conversation and mutual consent. This repository is a greenfield TypeScript monorepo; local infrastructure is provided by Docker Compose.

## Getting started

1. Install Node.js 22+, pnpm 10+, and Docker.
2. Copy `.env.example` to `.env` and set local-only secrets.
3. Run `pnpm install`, then `docker compose up -d`.
4. Apply `packages/db/migrations/*.sql` in order (for example `bash .claude/skills/run-velum/driver.sh up`, which also seeds), then run `pnpm dev`. `pnpm db:migrate` does not work with these hand-written migrations.

The web app runs at `http://localhost:3000`; the realtime service and worker run as separate workspace applications. Do not use local development keys or credentials in staging or production.

## Deploying with Vercel, Render, Supabase and Upstash

- **Vercel** runs the Next.js web app. The root `vercel.json` defines a single `web` service rooted at `apps/web` and routes all traffic to it.
- **Render** runs the realtime server and the job worker together on one free Web Service, defined in `render.yaml`. `scripts/render-start.mjs` starts both and exits if either stops, so Render restarts the service. The realtime server can't run on Vercel: a Dark Room lasts up to ten minutes, longer than a Vercel function may hold a WebSocket open.
- **Supabase** provides Postgres and S3-compatible private storage. **Upstash** provides Redis.

Render's free Web Services sleep after 15 minutes without inbound HTTP traffic, which drops live rooms and pauses scheduled jobs. Point a free uptime monitor (for example UptimeRobot or cron-job.org) at `https://<render-host>/health` every 10 minutes. One always-on free service fits within Render's 750 free instance hours a month.

The web app and the realtime server run on different sites, so the browser does not send the web session cookie to the realtime server. Before joining a room, the browser requests `POST /api/v1/sessions/:id/ticket`. That returns a single-use ticket valid for 60 seconds and bound to the member and the session; only its hash is stored, in Redis. The browser sends the ticket in the WebSocket `join` event.

Set production values in each provider's secret environment-variable settings, never in the repository:

- `APP_URL` and `WEBAUTHN_ORIGIN` are the web app's origin, on both Vercel and Render. `WEBAUTHN_RP_ID` is its hostname only.
- `NEXT_PUBLIC_REALTIME_URL` is `wss://<render-host>/ws`. It is inlined at build time, so redeploy the web app after changing it.
- `LOCAL_DEV_MASTER_KEY` (the encryption key) and `BLIND_INDEX_KEY` must be identical on Vercel and Render. Losing them makes stored emails and evidence unreadable.
- **Supabase database:** the direct `db.<ref>.supabase.co` host is IPv6-only, so use the pooler. On Vercel, `DATABASE_URL` is the transaction pooler (port 6543); the client disables prepared statements for it. On Render, both `DATABASE_URL` and `DATABASE_DIRECT_URL` are the session pooler (port 5432), which pg-boss requires.
- **Supabase migrations:** apply `packages/db/migrations/*.sql` in order. `0002_enable_rls.sql` enables row-level security on every public table, so Supabase's REST API can't read app data with the publishable key. The app connects as the table owner, which bypasses RLS.
- **Supabase storage:** `STORAGE_ENDPOINT` is `https://<ref>.storage.supabase.co/storage/v1/s3`, using S3 access keys from Storage settings. The buckets `velum-photos` and `velum-selfies` must exist and stay private.
- **Upstash:** `REDIS_URL` is `rediss://default:<token>@<host>.upstash.io:6379`; the password is the database token. The REST URL used by `@upstash/redis` doesn't work with this repository's Node Redis clients. Rotate any token that has been shared in chat.
- **Report evidence:** `MODERATION_PUBLIC_KEY` on Render is a PEM public key with newlines written as `\n`. Keep the matching private key offline; only moderators reviewing evidence need it.

## Privacy invariants

- Dark Room message bodies are ephemeral Redis data and are never logged or inserted into Postgres. A report may retain only a consented, encrypted snapshot.
- The peer's unveil decision is never exposed unless both people confirm.
- Photos and profile details stay private until mutual unveil.
- Email templates contain no names, photos, scores, addresses, or chat content.
- Passkey recovery codes are one-time use; email recovery notifies the registered address immediately and withholds the single-use replacement-passkey link for 24 hours.
- Account deletion immediately disables access, then purges relational data and private images after the seven-day retention period.
- The product does not claim to prevent screenshots.

See `AGENTS.md` and `docs/ARCHITECTURE.md` for engineering and product constraints.

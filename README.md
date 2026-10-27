# Velum

Velum is an invite-only dating PWA built around anonymous conversation and mutual consent. This repository is a greenfield TypeScript monorepo; local infrastructure is provided by Docker Compose.

## Getting started

1. Install Node.js 22+, pnpm 10+, and Docker.
2. Copy `.env.example` to `.env` and set local-only secrets.
3. Run `pnpm install`, then `docker compose up -d`.
4. Run `pnpm db:migrate` and `pnpm dev`.

The web app runs at `http://localhost:3000`; the realtime service and worker run as separate workspace applications. Do not use local development keys or credentials in staging or production.

## Deploying with Vercel and Render

The root `vercel.json` deploys the Next.js web app from `apps/web` and routes all Vercel traffic to it. Keep the realtime server and job worker on Render: the Dark Room runs for up to ten minutes, longer than Vercel Hobby's WebSocket function limit.

Create these two Render services from this repository, with the repository root as the service root:

- **Realtime:** choose **Web Service**. Build with `corepack enable && pnpm install --frozen-lockfile && pnpm exec turbo run build --filter=@velum/realtime...`; start with `pnpm --filter @velum/realtime start`; set the health-check path to `/health`. The service accepts Render's `PORT` environment variable and exposes its WebSocket at `/ws`.
- **Worker:** choose **Background Worker**. Use the same build command, changing the filter to `@velum/worker...`; start with `pnpm --filter @velum/worker start`. It has no public URL.

Set production values in the hosting providers' secret environment-variable settings; never commit them. Configure the web app with the variables in `.env.example`, using the production domain for `APP_URL`, `WEBAUTHN_ORIGIN`, and `WEBAUTHN_RP_ID` (the hostname only for the RP ID), and the Render Web Service's secure WebSocket URL for `NEXT_PUBLIC_REALTIME_URL` (for example, `wss://<realtime-host>/ws`). Set `WEBAUTHN_ORIGIN` to the web app's origin on the realtime service too, so its origin check accepts the browser connection.

For Supabase, `DATABASE_URL` may use the transaction pooler; the Postgres client disables prepared statements for pooler compatibility. Set `DATABASE_DIRECT_URL` to a direct connection or the **session** pooler for the background worker, not the transaction pooler. For Upstash, use its Redis protocol `rediss://` connection string as `REDIS_URL`; the REST URL and token used by `@upstash/redis` are not compatible with this repository's Node Redis clients. Rotate any Upstash token shared in chat before using it.

## Privacy invariants

- Dark Room message bodies are ephemeral Redis data and are never logged or inserted into Postgres. A report may retain only a consented, encrypted snapshot.
- The peer's unveil decision is never exposed unless both people confirm.
- Photos and profile details stay private until mutual unveil.
- Email templates contain no names, photos, scores, addresses, or chat content.
- Passkey recovery codes are one-time use; email recovery notifies the registered address immediately and withholds the single-use replacement-passkey link for 24 hours.
- Account deletion immediately disables access, then purges relational data and private images after the seven-day retention period.
- The product does not claim to prevent screenshots.

See `AGENTS.md` and `docs/ARCHITECTURE.md` for engineering and product constraints.

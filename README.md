# Velum

Velum is an invite-only dating PWA built around anonymous conversation and mutual consent. This repository is a greenfield TypeScript monorepo; local infrastructure is provided by Docker Compose.

## Getting started

1. Install Node.js 22+, pnpm 10+, and Docker.
2. Copy `.env.example` to `.env` and set local-only secrets.
3. Run `pnpm install`, then `docker compose up -d`.
4. Run `pnpm db:migrate` and `pnpm dev`.

The web app runs at `http://localhost:3000`; the realtime service and worker run as separate workspace applications. Do not use local development keys or credentials in staging or production.

## Privacy invariants

- Dark Room message bodies are ephemeral Redis data and are never logged or inserted into Postgres. A report may retain only a consented, encrypted snapshot.
- The peer's unveil decision is never exposed unless both people confirm.
- Photos and profile details stay private until mutual unveil.
- Email templates contain no names, photos, scores, addresses, or chat content.
- Passkey recovery codes are one-time use; email recovery notifies the registered address immediately and withholds the single-use replacement-passkey link for 24 hours.
- Account deletion immediately disables access, then purges relational data and private images after the seven-day retention period.
- The product does not claim to prevent screenshots.

See `AGENTS.md` and `docs/ARCHITECTURE.md` for engineering and product constraints.

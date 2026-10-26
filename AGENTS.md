# Velum agent instructions

This file captures the repository's non-negotiable implementation rules. The full system design is in `docs/ARCHITECTURE.md`.

## Product invariants

1. Dark Room message bodies live only in Redis with TTL; only a consented encrypted report snapshot may be persisted.
2. A failed mutual unveil always has a neutral outcome. Never expose a private confirmation.
3. Reveal no identity, photo, score, email, or profile data before mutual unveil.
4. Email must not contain names, photos, scores, or message content.
5. Never claim to prevent screenshots.

## Stack and boundaries

Use TypeScript, pnpm workspaces, Turborepo, Next.js, Fastify + `ws`, pg-boss, PostgreSQL/Drizzle, Redis, S3-compatible private storage, SimpleWebAuthn, Zod, React Email, pino, Vitest, Testcontainers, Playwright, and k6. Domain logic belongs in `packages/core`; apps depend on packages, never the reverse.

## Security and privacy

- Validate every external boundary with Zod.
- Never log message bodies, email addresses, tokens, photo URLs, or answers.
- Store only birth year and age-verification time, never full DOB.
- Encrypt emails, chat, and report evidence; use blind indexes for email lookup.
- Store only token hashes and compare secrets in constant time.
- Keep photos private and strip EXIF before storage.
- Authorize every HTTP route and WebSocket event against the resource participants.
- Public auth/invite/recovery responses must not disclose whether an account or token exists.
- No trackers or third-party analytics SDKs.
- Parse server secrets in `packages/config`; commit placeholder-only `.env.example`.
- State changes go through guarded domain functions and transactional row locks.
- Queue email through `email_outbox`, with idempotency keys and ID-only params.

## Consent and realtime

- Store unveil confirmations privately; broadcast only `unveiled` on mutual consent or a neutral `ended`.
- No typing, read receipts, or presence indicators in the Dark Room.
- Server owns timers; validate identity-leaking content server-side.
- Do not implement voice, native apps, geofencing, payments, push/SMS, ML matching, or screenshot DRM.

## Quality

Use strict TypeScript, kebab-case files, and tests for domain logic and authorization. Migrations are reviewable and reversible or explicitly documented as one-way. Run lint, typecheck, tests, and privacy tests for relevant changes. Never add real user data, secrets, debug message logs, or unrelated refactors.


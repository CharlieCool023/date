# Velum MVP architecture

## Product

Velum is an invite-only dating PWA. Members complete eligibility and consent, photos and manual verification, a questionnaire, and weekly availability. An explainable matching engine schedules anonymous text sessions. Nothing identifying is revealed until both members privately choose to unveil. Email is the only MVP notification channel.

## Services

- `apps/web`: Next.js UI and REST API.
- `apps/realtime`: Fastify WebSocket service for anonymous rooms and post-unveil chat.
- `apps/worker`: pg-boss jobs for matching, email, reminders, and retention.
- `packages/db`: Drizzle schema and migrations.
- `packages/core`: domain rules and state machines.
- `packages/contracts`: Zod inputs, WebSocket events, and error codes.
- `packages/crypto`: envelope encryption, blind indexes, and token hashing.
- `packages/config`: validated server environment.
- `packages/email`: templates, queue and provider adapter.

PostgreSQL stores durable state; Redis stores ephemeral room state and messages with TTL. Private object storage contains photos. Providers are configured through server-side adapters.

## MVP journeys

Invite -> passkey -> recovery codes -> eligibility/consent -> photos/manual verification -> questionnaire -> availability -> stealth mode -> scheduled proposal -> both confirm -> anonymous room -> mutual unveil or neutral end -> private chat and safety tools.

## Domain invariants

- User, invite, and session statuses only change through transactional guarded core functions.
- No DOB is persisted, only birth year and age-verification timestamp.
- Photos, scores, names, email, and answers are not shown to a peer before mutual unveil.
- Live room message bodies stay in Redis and never enter Postgres/logs except a consented encrypted report snapshot.
- The server clock owns room timing. Private unveil choices are never broadcast.
- Email is queued in an outbox with generic content and IDs only.

## Matching

Hard filters require active verified users, compatible eligibility, same zone, no blocks/hidden contacts/prior pairing, compatible must-match answers, overlapping availability, and weekly capacity. Score categories are weighted and versioned; users see `strong`/`good` bands, never percentages. Greedy pairing is the MVP; no pair below the configured good threshold is proposed.

## MVP exclusions

Voice, native applications, payments, push/SMS, geofencing, ML/embeddings, screenshot prevention, and production hosting configuration.


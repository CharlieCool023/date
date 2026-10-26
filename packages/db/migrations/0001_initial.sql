CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city text NOT NULL,
  name text NOT NULL,
  country text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  CONSTRAINT zones_city_name_country_idx UNIQUE (city, name, country)
);
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'onboarding' CHECK (status IN ('onboarding','pending_verification','active','paused','suspended','deleted')),
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('member','moderator','admin')),
  invited_by uuid REFERENCES users(id),
  birth_year smallint,
  age_verified_at timestamptz,
  gender text,
  seeking text[],
  age_min smallint,
  age_max smallint,
  intent text,
  zone_id uuid REFERENCES zones(id),
  timezone text NOT NULL DEFAULT 'Africa/Lagos',
  reputation integer NOT NULL DEFAULT 100,
  invites_remaining smallint NOT NULL DEFAULT 0,
  consent_version text,
  recovery_codes_confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (age_min IS NULL OR (age_min >= 18 AND age_max >= age_min))
);
CREATE TABLE user_contacts (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email_ciphertext bytea NOT NULL,
  email_blind_index bytea NOT NULL UNIQUE,
  verified_at timestamptz NOT NULL
);
CREATE TABLE passkeys (
  credential_id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_key bytea NOT NULL,
  sign_count bigint NOT NULL DEFAULT 0,
  transports text[],
  device_label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);
CREATE TABLE auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE recovery_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash bytea NOT NULL,
  used_at timestamptz
);
CREATE TABLE recovery_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE,
  eligible_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_id uuid REFERENCES users(id),
  token_hash bytea NOT NULL UNIQUE,
  invitee_email_blind_index bytea NOT NULL,
  email_ciphertext bytea NOT NULL,
  zone_id uuid REFERENCES zones(id),
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','opened','redeemed','expired','revoked')),
  expires_at timestamptz NOT NULL,
  redeemed_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX invites_email_idx ON invites (invitee_email_blind_index);
CREATE TABLE auth_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge text NOT NULL,
  purpose text NOT NULL,
  invite_id uuid REFERENCES invites(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE profile_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  storage_key text NOT NULL,
  position smallint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, position)
);
CREATE TABLE verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  selfie_key text,
  decided_by uuid REFERENCES users(id),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE questions (
  id text NOT NULL,
  version integer NOT NULL,
  kind text NOT NULL,
  category text NOT NULL,
  weight numeric(3,2) NOT NULL DEFAULT 1.0,
  options jsonb NOT NULL,
  PRIMARY KEY (id, version)
);
CREATE TABLE answers (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id text NOT NULL,
  question_version integer NOT NULL,
  value jsonb NOT NULL,
  must_match boolean NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, question_id)
);
CREATE TABLE availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_minute smallint NOT NULL CHECK (start_minute >= 0),
  end_minute smallint NOT NULL CHECK (end_minute <= 1440 AND end_minute > start_minute),
  timezone text NOT NULL DEFAULT 'Africa/Lagos'
);
CREATE TABLE dusk_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a uuid NOT NULL REFERENCES users(id),
  user_b uuid NOT NULL REFERENCES users(id),
  score numeric(4,3) NOT NULL,
  band text NOT NULL CHECK (band IN ('strong','good')),
  scoring_version integer NOT NULL,
  starts_at timestamptz NOT NULL,
  join_deadline timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'proposed',
  end_reason text,
  confirmed_a_at timestamptz,
  confirmed_b_at timestamptz,
  joined_a_at timestamptz,
  joined_b_at timestamptz,
  live_started_at timestamptz,
  unveil_a_at timestamptz,
  unveil_b_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (user_a < user_b),
  CHECK (status IN ('proposed','confirmed','lobby','live','ended','unveiled','cancelled','no_show'))
);
CREATE INDEX dusk_sessions_status_start_idx ON dusk_sessions (status, starts_at);
CREATE UNIQUE INDEX dusk_sessions_pair_unique_idx ON dusk_sessions (user_a, user_b);
CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES dusk_sessions(id),
  user_a uuid NOT NULL REFERENCES users(id),
  user_b uuid NOT NULL REFERENCES users(id),
  disappearing_seconds integer,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id),
  CHECK (user_a < user_b),
  CHECK (status IN ('open','closed'))
);
CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users(id),
  body_ciphertext bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);
CREATE TABLE blocks (
  blocker_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
CREATE TABLE hidden_contacts (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_blind_index bytea NOT NULL,
  PRIMARY KEY (user_id, email_blind_index)
);
CREATE TABLE reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES users(id),
  reported_id uuid NOT NULL REFERENCES users(id),
  session_id uuid REFERENCES dusk_sessions(id),
  reason text NOT NULL,
  evidence_ciphertext bytea,
  evidence_expires_at timestamptz,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE reputation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  delta integer NOT NULL,
  session_id uuid,
  report_id uuid REFERENCES reports(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, session_id),
  UNIQUE (report_id, user_id)
);
CREATE TABLE email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL UNIQUE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  template text NOT NULL,
  params jsonb NOT NULL DEFAULT '{}',
  secret_ciphertext bytea,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','failed','suppressed')),
  attempts integer NOT NULL DEFAULT 0,
  send_after timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE TABLE audit_log (
  id bigserial PRIMARY KEY,
  actor_id uuid,
  action text NOT NULL,
  target text,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE passkeys ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE recovery_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE recovery_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE dusk_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE hidden_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE reputation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

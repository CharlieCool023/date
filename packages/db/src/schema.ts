import {
  pgTable, uuid, text, boolean, smallint, integer, bigint, timestamp, jsonb, numeric, customType,
  bigserial, primaryKey, uniqueIndex, index, check
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea"
});

export const zones = pgTable("zones", {
  id: uuid("id").defaultRandom().primaryKey(),
  city: text("city").notNull(),
  name: text("name").notNull(),
  country: text("country").notNull(),
  active: boolean("active").notNull().default(true)
}, (table) => [uniqueIndex("zones_city_name_country_idx").on(table.city, table.name, table.country)]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  status: text("status").notNull().default("onboarding"),
  role: text("role").notNull().default("member"),
  invitedBy: uuid("invited_by"),
  birthYear: smallint("birth_year"),
  ageVerifiedAt: timestamp("age_verified_at", { withTimezone: true }),
  gender: text("gender"),
  seeking: text("seeking").array(),
  ageMin: smallint("age_min"),
  ageMax: smallint("age_max"),
  intent: text("intent"),
  zoneId: uuid("zone_id").references(() => zones.id),
  timezone: text("timezone").notNull().default("Africa/Lagos"),
  reputation: integer("reputation").notNull().default(100),
  invitesRemaining: smallint("invites_remaining").notNull().default(0),
  consentVersion: text("consent_version"),
  recoveryCodesConfirmedAt: timestamp("recovery_codes_confirmed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true })
}, (table) => [
  check("users_role_check", sql`${table.role} in ('member', 'moderator', 'admin')`),
  check("users_status_check", sql`${table.status} in ('onboarding', 'pending_verification', 'active', 'paused', 'suspended', 'deleted')`),
  check("users_age_range_check", sql`${table.ageMin} is null or (${table.ageMin} >= 18 and ${table.ageMax} >= ${table.ageMin})`)
]);

export const userContacts = pgTable("user_contacts", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  emailCiphertext: bytea("email_ciphertext").notNull(),
  emailBlindIndex: bytea("email_blind_index").notNull().unique(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull()
});

export const passkeys = pgTable("passkeys", {
  credentialId: text("credential_id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  publicKey: bytea("public_key").notNull(),
  signCount: bigint("sign_count", { mode: "number" }).notNull().default(0),
  transports: text("transports").array(),
  deviceLabel: text("device_label"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true })
});

export const authSessions = pgTable("auth_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: bytea("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const recoveryCodes = pgTable("recovery_codes", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  codeHash: bytea("code_hash").notNull(),
  usedAt: timestamp("used_at", { withTimezone: true })
});

export const recoveryRequests = pgTable("recovery_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: bytea("token_hash").notNull().unique(),
  eligibleAt: timestamp("eligible_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const invites = pgTable("invites", {
  id: uuid("id").defaultRandom().primaryKey(),
  inviterId: uuid("inviter_id").references(() => users.id),
  tokenHash: bytea("token_hash").notNull().unique(),
  inviteeEmailBlindIndex: bytea("invitee_email_blind_index").notNull(),
  emailCiphertext: bytea("email_ciphertext").notNull(),
  zoneId: uuid("zone_id").references(() => zones.id),
  status: text("status").notNull().default("sent"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  redeemedBy: uuid("redeemed_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  index("invites_email_idx").on(table.inviteeEmailBlindIndex),
  check("invites_status_check", sql`${table.status} in ('sent', 'opened', 'redeemed', 'expired', 'revoked')`)
]);

export const authChallenges = pgTable("auth_challenges", {
  id: uuid("id").defaultRandom().primaryKey(),
  challenge: text("challenge").notNull(),
  purpose: text("purpose").notNull(),
  inviteId: uuid("invite_id").references(() => invites.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const profilePhotos = pgTable("profile_photos", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  storageKey: text("storage_key").notNull(),
  position: smallint("position").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [uniqueIndex("profile_photos_user_position_idx").on(table.userId, table.position)]);

export const verifications = pgTable("verifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull().default("manual"),
  status: text("status").notNull().default("pending"),
  selfieKey: text("selfie_key"),
  decidedBy: uuid("decided_by").references(() => users.id),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const questions = pgTable("questions", {
  id: text("id").notNull(),
  version: integer("version").notNull(),
  kind: text("kind").notNull(),
  category: text("category").notNull(),
  weight: numeric("weight", { precision: 3, scale: 2 }).notNull().default("1"),
  options: jsonb("options").notNull()
}, (table) => [primaryKey({ columns: [table.id, table.version] })]);

export const answers = pgTable("answers", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  questionId: text("question_id").notNull(),
  questionVersion: integer("question_version").notNull(),
  value: jsonb("value").notNull(),
  mustMatch: boolean("must_match").notNull().default(false)
}, (table) => [primaryKey({ columns: [table.userId, table.questionId] })]);

export const availability = pgTable("availability", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  weekday: smallint("weekday").notNull(),
  startMinute: smallint("start_minute").notNull(),
  endMinute: smallint("end_minute").notNull(),
  timezone: text("timezone").notNull().default("Africa/Lagos")
}, (table) => [check("availability_window_check", sql`${table.weekday} between 0 and 6 and ${table.startMinute} >= 0 and ${table.endMinute} <= 1440 and ${table.endMinute} > ${table.startMinute}`)]);

export const duskSessions = pgTable("dusk_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userA: uuid("user_a").notNull().references(() => users.id),
  userB: uuid("user_b").notNull().references(() => users.id),
  score: numeric("score", { precision: 4, scale: 3 }).notNull(),
  band: text("band").notNull(),
  scoringVersion: integer("scoring_version").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  joinDeadline: timestamp("join_deadline", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("proposed"),
  endReason: text("end_reason"),
  confirmedAAt: timestamp("confirmed_a_at", { withTimezone: true }),
  confirmedBAt: timestamp("confirmed_b_at", { withTimezone: true }),
  joinedAAt: timestamp("joined_a_at", { withTimezone: true }),
  joinedBAt: timestamp("joined_b_at", { withTimezone: true }),
  liveStartedAt: timestamp("live_started_at", { withTimezone: true }),
  unveilAAt: timestamp("unveil_a_at", { withTimezone: true }),
  unveilBAt: timestamp("unveil_b_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  check("dusk_sessions_pair_check", sql`${table.userA} < ${table.userB}`),
  check("dusk_sessions_status_check", sql`${table.status} in ('proposed','confirmed','lobby','live','ended','unveiled','cancelled','no_show')`),
  index("dusk_sessions_status_start_idx").on(table.status, table.startsAt),
  uniqueIndex("dusk_sessions_pair_unique_idx").on(table.userA, table.userB)
]);

export const conversations = pgTable("conversations", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: uuid("session_id").notNull().references(() => duskSessions.id),
  userA: uuid("user_a").notNull().references(() => users.id),
  userB: uuid("user_b").notNull().references(() => users.id),
  disappearingSeconds: integer("disappearing_seconds"),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex("conversations_session_unique_idx").on(table.sessionId),
  check("conversations_pair_check", sql`${table.userA} < ${table.userB}`),
  check("conversations_status_check", sql`${table.status} in ('open','closed')`)
]);

export const messages = pgTable("messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  senderId: uuid("sender_id").notNull().references(() => users.id),
  bodyCiphertext: bytea("body_ciphertext").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true })
});

export const blocks = pgTable("blocks", {
  blockerId: uuid("blocker_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  blockedId: uuid("blocked_id").notNull().references(() => users.id, { onDelete: "cascade" })
}, (table) => [
  primaryKey({ columns: [table.blockerId, table.blockedId] }),
  check("blocks_not_self_check", sql`${table.blockerId} <> ${table.blockedId}`)
]);

export const hiddenContacts = pgTable("hidden_contacts", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  emailBlindIndex: bytea("email_blind_index").notNull()
}, (table) => [primaryKey({ columns: [table.userId, table.emailBlindIndex] })]);

export const reports = pgTable("reports", {
  id: uuid("id").defaultRandom().primaryKey(),
  reporterId: uuid("reporter_id").notNull().references(() => users.id),
  reportedId: uuid("reported_id").notNull().references(() => users.id),
  sessionId: uuid("session_id").references(() => duskSessions.id),
  reason: text("reason").notNull(),
  evidenceCiphertext: bytea("evidence_ciphertext"),
  evidenceExpiresAt: timestamp("evidence_expires_at", { withTimezone: true }),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const reputationEvents = pgTable("reputation_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  delta: integer("delta").notNull(),
  sessionId: uuid("session_id"),
  reportId: uuid("report_id").references(() => reports.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex("reputation_events_session_user_unique_idx").on(table.userId, table.sessionId),
  uniqueIndex("reputation_events_report_user_unique_idx").on(table.reportId, table.userId)
]);

export const emailOutbox = pgTable("email_outbox", {
  id: uuid("id").defaultRandom().primaryKey(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  template: text("template").notNull(),
  params: jsonb("params").notNull().default({}),
  secretCiphertext: bytea("secret_ciphertext"),
  status: text("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  sendAfter: timestamp("send_after", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true })
}, (table) => [check("email_outbox_status_check", sql`${table.status} in ('pending', 'sending', 'sent', 'failed', 'suppressed')`)]);

export const auditLog = pgTable("audit_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  actorId: uuid("actor_id"),
  action: text("action").notNull(),
  target: text("target"),
  meta: jsonb("meta"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

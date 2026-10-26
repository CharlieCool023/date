import "dotenv/config";
import PgBoss from "pg-boss";
import { and, eq, inArray, isNotNull, lt, lte, or, gte } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@velum/db";
import { decrypt, parseAesKey } from "@velum/crypto";
import { renderEmail, sendEmail, type EmailTemplate } from "@velum/email";
import { removeImage } from "@velum/storage";
import { cancelUnconfirmedSessions, pairCandidates, type Candidate, type MatchAnswer } from "@velum/core";

const databaseUrl = process.env.DATABASE_DIRECT_URL;
if (!databaseUrl) throw new Error("DATABASE_DIRECT_URL is required");
const boss = new PgBoss({ connectionString: databaseUrl });
const parametersSchema = z.record(z.string(), z.string().uuid());
const templateSchema = z.enum([
  "invite", "welcome", "verification_needed", "session_proposed", "session_cancelled",
  "session_reminder", "session_missed", "unveil_mutual", "new_message", "security_alert",
  "report_received", "account_deleted", "recovery_link"
]);

function encryptionKey(): Buffer {
  const value = process.env.LOCAL_DEV_MASTER_KEY;
  if (!value) throw new Error("LOCAL_DEV_MASTER_KEY is required for this local key provider");
  return parseAesKey(value);
}

async function enqueuePendingEmails() {
  const due = await db.select({ id: schema.emailOutbox.id })
    .from(schema.emailOutbox)
    .where(and(
      or(
        eq(schema.emailOutbox.status, "pending"),
        and(eq(schema.emailOutbox.status, "failed"), lt(schema.emailOutbox.attempts, 5))
      ),
      lte(schema.emailOutbox.sendAfter, new Date())
    ))
    .limit(100);
  for (const item of due) {
    await boss.send("email.send", { outboxId: item.id }, { singletonKey: item.id, singletonSeconds: 300 });
  }
}

async function sendOutboxItem(outboxId: string) {
  const item = await db.transaction(async (tx) => {
    const [row] = await tx.select().from(schema.emailOutbox)
      .where(eq(schema.emailOutbox.id, outboxId))
      .for("update", { skipLocked: true });
    if (!row || row.status === "sent" || row.status === "suppressed" || row.status === "sending") return null;
    await tx.update(schema.emailOutbox).set({ status: "sending" }).where(eq(schema.emailOutbox.id, row.id));
    return row;
  });
  if (!item) return;

  try {
    const provider = process.env.EMAIL_PROVIDER === "postmark" ? "postmark" : "resend";
    const apiKey = process.env.EMAIL_API_KEY;
    const from = process.env.EMAIL_FROM;
    const appUrl = process.env.APP_URL;
    if (!apiKey || !from || !appUrl) throw new Error("Email delivery configuration is incomplete");
    const key = encryptionKey();
    const template = templateSchema.parse(item.template) as EmailTemplate;
    const params = parametersSchema.parse(item.params);
    let recipient: string;
    let inviteToken: string | undefined;
    if (template === "invite") {
      const inviteId = params.inviteId;
      if (!inviteId || !item.secretCiphertext) throw new Error("Invite email payload is incomplete");
      const [invite] = await db.select().from(schema.invites).where(eq(schema.invites.id, inviteId)).limit(1);
      if (!invite || invite.status === "revoked" || invite.status === "expired") {
        await db.update(schema.emailOutbox).set({ status: "suppressed", secretCiphertext: null })
          .where(eq(schema.emailOutbox.id, item.id));
        return;
      }
      recipient = decrypt(invite.emailCiphertext, key);
      inviteToken = decrypt(item.secretCiphertext, key);
    } else if (template === "recovery_link") {
      const recoveryRequestId = params.recoveryRequestId;
      if (!recoveryRequestId || !item.secretCiphertext) throw new Error("Recovery email payload is incomplete");
      const [recoveryRequest] = await db.select().from(schema.recoveryRequests)
        .where(eq(schema.recoveryRequests.id, recoveryRequestId)).limit(1);
      if (!recoveryRequest || recoveryRequest.usedAt || recoveryRequest.expiresAt <= new Date()) {
        await db.update(schema.emailOutbox).set({ status: "suppressed", secretCiphertext: null })
          .where(eq(schema.emailOutbox.id, item.id));
        return;
      }
      const [contact] = await db.select({ emailCiphertext: schema.userContacts.emailCiphertext })
        .from(schema.userContacts).where(eq(schema.userContacts.userId, recoveryRequest.userId)).limit(1);
      if (!contact) {
        await db.update(schema.emailOutbox).set({ status: "suppressed", secretCiphertext: null })
          .where(eq(schema.emailOutbox.id, item.id));
        return;
      }
      recipient = decrypt(contact.emailCiphertext, key);
      inviteToken = decrypt(item.secretCiphertext, key);
    } else {
      if (!item.userId) {
        await db.update(schema.emailOutbox).set({ status: "suppressed" }).where(eq(schema.emailOutbox.id, item.id));
        return;
      }
      const [contact] = await db.select({ emailCiphertext: schema.userContacts.emailCiphertext })
        .from(schema.userContacts).where(eq(schema.userContacts.userId, item.userId)).limit(1);
      if (!contact) {
        await db.update(schema.emailOutbox).set({ status: "suppressed" }).where(eq(schema.emailOutbox.id, item.id));
        return;
      }
      recipient = decrypt(contact.emailCiphertext, key);
    }
    await sendEmail(
      provider,
      apiKey,
      from,
      recipient,
      await renderEmail(template, appUrl, inviteToken),
      item.idempotencyKey
    );
    await db.update(schema.emailOutbox).set({
      status: "sent",
      sentAt: new Date(),
      secretCiphertext: null
    }).where(eq(schema.emailOutbox.id, item.id));
  } catch {
    const attempts = item.attempts + 1;
    const delay = Math.min(60 * 60_000, 30_000 * (2 ** Math.min(attempts, 7)));
    await db.update(schema.emailOutbox).set({
      status: "failed",
      attempts,
      sendAfter: new Date(Date.now() + delay)
    }).where(eq(schema.emailOutbox.id, item.id));
    throw new Error("Email delivery failed");
  }
}

function localTimeParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(values.weekday ?? "");
  return { weekday, minute: Number(values.hour) * 60 + Number(values.minute) };
}

async function scheduleMatching() {
  const activeUsers = await db.select({
    id: schema.users.id,
    zoneId: schema.users.zoneId,
    birthYear: schema.users.birthYear,
    gender: schema.users.gender,
    seeking: schema.users.seeking,
    ageMin: schema.users.ageMin,
    ageMax: schema.users.ageMax,
    reputation: schema.users.reputation,
    timezone: schema.users.timezone
  }).from(schema.users).where(eq(schema.users.status, "active"));
  if (activeUsers.length < 2) return;
  const eligible = new Set<string>();
  const ranges = new Map<string, { gender: string | null; seeking: string[]; ageMin: number | null; ageMax: number | null }>();
  const verifications = await db.select({
    userId: schema.verifications.userId,
    status: schema.verifications.status
  }).from(schema.verifications).where(eq(schema.verifications.status, "approved"));
  const verified = new Set(verifications.map((item) => item.userId));
  const answersRows = await db.select().from(schema.answers);
  const answersByUser = new Map<string, MatchAnswer[]>();
  const questionRows = await db.select().from(schema.questions);
  const questionsById = new Map<string, typeof questionRows[number]>();
  for (const question of questionRows) {
    const existing = questionsById.get(question.id);
    if (!existing || question.version > existing.version) questionsById.set(question.id, question);
  }
  for (const answer of answersRows) {
    const question = questionsById.get(answer.questionId);
    if (!question || question.version !== answer.questionVersion) continue;
    const list = answersByUser.get(answer.userId) ?? [];
    if (question.category === "values" || question.category === "lifestyle"
      || question.category === "intent" || question.category === "tradeoffs") {
      list.push({
        questionId: answer.questionId,
        category: question.category,
        kind: question.kind === "multi" || question.kind === "scale" ? question.kind : "single",
        value: answer.value as string | number | string[],
        weight: Number(question.weight),
        mustMatch: answer.mustMatch
      });
    }
    answersByUser.set(answer.userId, list);
  }
  const availabilityRows = await db.select().from(schema.availability);
  const availabilityByUser = new Map<string, typeof availabilityRows>();
  for (const window of availabilityRows) {
    const list = availabilityByUser.get(window.userId) ?? [];
    list.push(window);
    availabilityByUser.set(window.userId, list);
  }
  const blindContacts = await db.select().from(schema.hiddenContacts);
  const hiddenByUser = new Map<string, Set<string>>();
  for (const entry of blindContacts) {
    const list = hiddenByUser.get(entry.userId) ?? new Set<string>();
    list.add(Buffer.from(entry.emailBlindIndex).toString("hex"));
    hiddenByUser.set(entry.userId, list);
  }
  const contactRows = await db.select({
    userId: schema.userContacts.userId,
    blindIndex: schema.userContacts.emailBlindIndex
  }).from(schema.userContacts);
  const blindByUser = new Map(contactRows.map((contact) => [contact.userId, Buffer.from(contact.blindIndex).toString("hex")]));
  const blocks = await db.select().from(schema.blocks);
  const blockedPairs = new Set(blocks.map((block) =>
    block.blockerId < block.blockedId ? `${block.blockerId}:${block.blockedId}` : `${block.blockedId}:${block.blockerId}`
  ));
  const priorSessions = await db.select({ userA: schema.duskSessions.userA, userB: schema.duskSessions.userB })
    .from(schema.duskSessions);
  const pairedBefore = new Set(priorSessions.map((session) => `${session.userA}:${session.userB}`));
  const current = new Date();
  const weekStart = new Date(current);
  weekStart.setUTCHours(0, 0, 0, 0);
  weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());
  const sessionCounts = await db.select({
    userA: schema.duskSessions.userA,
    userB: schema.duskSessions.userB
  }).from(schema.duskSessions).where(gte(schema.duskSessions.startsAt, weekStart));
  const countByUser = new Map<string, number>();
  for (const row of sessionCounts) {
    countByUser.set(row.userA, (countByUser.get(row.userA) ?? 0) + 1);
    countByUser.set(row.userB, (countByUser.get(row.userB) ?? 0) + 1);
  }
  const missedRounds = new Map<string, number>();
  for (const user of activeUsers) {
    ranges.set(user.id, {
      gender: user.gender,
      seeking: user.seeking ?? [],
      ageMin: user.ageMin,
      ageMax: user.ageMax
    });
  }
  const eligibleUsers = activeUsers.filter((user) => {
    const answers = answersByUser.get(user.id) ?? [];
    const windows = availabilityByUser.get(user.id) ?? [];
    const complete = user.zoneId && user.birthYear && user.gender && user.seeking?.length
      && user.ageMin && user.ageMax && verified.has(user.id)
      && answers.length >= 12 && windows.length > 0
      && (countByUser.get(user.id) ?? 0) < 3 && user.reputation >= 60;
    if (complete) eligible.add(user.id);
    return Boolean(complete);
  });
  const candidateById = new Map<string, Candidate>();
  const maxSlot = new Date(current.getTime() + 7 * 24 * 60 * 60_000);
  const minSlot = new Date(current.getTime() + 4 * 60 * 60_000);
  for (const user of eligibleUsers) {
    const windows = availabilityByUser.get(user.id) ?? [];
    const slots = new Set<string>();
    const slotDuration = 30 * 60_000;
    const startTime = new Date(Math.ceil(minSlot.getTime() / slotDuration) * slotDuration);
    for (let timestamp = startTime.getTime(); timestamp <= maxSlot.getTime(); timestamp += 30 * 60_000) {
      const date = new Date(timestamp);
      const local = localTimeParts(date, user.timezone);
      if (windows.some((window) => window.weekday === local.weekday
        && local.minute >= window.startMinute && local.minute + 30 <= window.endMinute)) {
        slots.add(date.toISOString());
      }
    }
    if (slots.size === 0) continue;
    candidateById.set(user.id, {
      userId: user.id,
      answers: answersByUser.get(user.id) ?? [],
      availabilitySlots: [...slots],
      missedRounds: missedRounds.get(user.id) ?? 0
    });
  }
  const candidateUsers = eligibleUsers.filter((user) => candidateById.has(user.id));
  const zones = new Set(candidateUsers.map((user) => user.zoneId).filter((zone): zone is string => zone !== null));
  for (const zoneId of zones) {
    const members = candidateUsers.filter((user) => user.zoneId === zoneId);
    const compatible: Candidate[] = [];
    for (const user of members) {
      const profile = ranges.get(user.id)!;
      const age = current.getUTCFullYear() - user.birthYear!;
      const candidates = members.filter((peer) => {
        if (peer.id === user.id) return false;
        const other = ranges.get(peer.id)!;
        const pairKey = user.id < peer.id ? `${user.id}:${peer.id}` : `${peer.id}:${user.id}`;
        if (!other.gender || !other.seeking.includes(profile.gender!)
          || !profile.seeking.includes(other.gender)) return false;
        const peerAge = current.getUTCFullYear() - peer.birthYear!;
        if (peerAge < profile.ageMin! || peerAge > profile.ageMax!
          || age < other.ageMin! || age > other.ageMax!) return false;
        if (blockedPairs.has(pairKey) || pairedBefore.has(pairKey)) return false;
        const userBlind = blindByUser.get(user.id);
        const peerBlind = blindByUser.get(peer.id);
        if ((peerBlind && hiddenByUser.get(user.id)?.has(peerBlind))
          || (userBlind && hiddenByUser.get(peer.id)?.has(userBlind))) return false;
        return true;
      });
      if (candidates.length > 0) compatible.push(candidateById.get(user.id)!);
    }
    const pairs = pairCandidates(compatible);
    for (const pair of pairs) {
      const left = activeUsers.find((user) => user.id === pair.userA);
      const right = activeUsers.find((user) => user.id === pair.userB);
      if (!left || !right) continue;
      const startsAt = new Date(Math.min(...candidateById.get(pair.userA)!.availabilitySlots
        .filter((slot) => candidateById.get(pair.userB)!.availabilitySlots.includes(slot))
        .map((slot) => new Date(slot).getTime())));
      if (!Number.isFinite(startsAt.getTime())) continue;
      await db.transaction(async (tx) => {
        const [a] = await tx.select().from(schema.users).where(eq(schema.users.id, pair.userA)).for("update");
        const [b] = await tx.select().from(schema.users).where(eq(schema.users.id, pair.userB)).for("update");
        if (!a || !b || a.status !== "active" || b.status !== "active"
          || (countByUser.get(a.id) ?? 0) >= 3 || (countByUser.get(b.id) ?? 0) >= 3) return;
        const prior = await tx.select({ id: schema.duskSessions.id }).from(schema.duskSessions)
          .where(and(eq(schema.duskSessions.userA, pair.userA), eq(schema.duskSessions.userB, pair.userB)))
          .limit(1);
        if (prior.length > 0) return;
        const [session] = await tx.insert(schema.duskSessions).values({
          userA: pair.userA,
          userB: pair.userB,
          score: pair.score.toFixed(3),
          band: pair.band,
          scoringVersion: 1,
          startsAt,
          joinDeadline: new Date(startsAt.getTime() + 20 * 60_000)
        }).onConflictDoNothing().returning({ id: schema.duskSessions.id });
        if (!session) return;
        for (const userId of [pair.userA, pair.userB]) {
          await tx.insert(schema.emailOutbox).values({
            idempotencyKey: `session_proposed:${session.id}:${userId}`,
            userId,
            template: "session_proposed",
            params: { sessionId: session.id }
          }).onConflictDoNothing();
        }
      });
    }
  }
}

async function cleanupExpiredAuthArtifacts() {
  const now = new Date();
  await db.delete(schema.recoveryRequests).where(lt(schema.recoveryRequests.expiresAt, now));
  await db.delete(schema.authChallenges).where(lt(schema.authChallenges.expiresAt, now));
  await db.delete(schema.authSessions).where(lt(schema.authSessions.expiresAt, now));
}

async function hardDeleteAccounts() {
  const retentionCutoff = new Date(Date.now() - 7 * 24 * 60 * 60_000);
  const pending = await db.select({ id: schema.users.id })
    .from(schema.users)
    .where(and(eq(schema.users.status, "deleted"), lt(schema.users.deletedAt, retentionCutoff)))
    .limit(50);
  for (const { id: userId } of pending) {
    const photos = await db.select({ key: schema.profilePhotos.storageKey })
      .from(schema.profilePhotos).where(eq(schema.profilePhotos.userId, userId));
    const selfies = await db.select({ key: schema.verifications.selfieKey })
      .from(schema.verifications).where(and(
        eq(schema.verifications.userId, userId),
        isNotNull(schema.verifications.selfieKey)
      ));
    await Promise.all([
      ...photos.map(({ key }) => removeImage(key, "photo")),
      ...selfies.flatMap(({ key }) => key ? [removeImage(key, "selfie")] : [])
    ]);

    await db.transaction(async (tx) => {
      const [user] = await tx.select({ id: schema.users.id }).from(schema.users).where(and(
        eq(schema.users.id, userId),
        eq(schema.users.status, "deleted"),
        lt(schema.users.deletedAt, retentionCutoff)
      )).for("update");
      if (!user) return;
      const sessions = await tx.select({ id: schema.duskSessions.id }).from(schema.duskSessions)
        .where(or(eq(schema.duskSessions.userA, userId), eq(schema.duskSessions.userB, userId)));
      const sessionIds = sessions.map((session) => session.id);
      if (sessionIds.length > 0) {
        await tx.delete(schema.reports).where(inArray(schema.reports.sessionId, sessionIds));
        await tx.delete(schema.conversations).where(inArray(schema.conversations.sessionId, sessionIds));
      }
      await tx.delete(schema.reports).where(or(
        eq(schema.reports.reporterId, userId),
        eq(schema.reports.reportedId, userId)
      ));
      await tx.delete(schema.conversations).where(or(
        eq(schema.conversations.userA, userId),
        eq(schema.conversations.userB, userId)
      ));
      await tx.delete(schema.duskSessions).where(or(
        eq(schema.duskSessions.userA, userId),
        eq(schema.duskSessions.userB, userId)
      ));
      await tx.update(schema.invites).set({ inviterId: null }).where(eq(schema.invites.inviterId, userId));
      await tx.update(schema.invites).set({ redeemedBy: null }).where(eq(schema.invites.redeemedBy, userId));
      await tx.update(schema.users).set({ invitedBy: null }).where(eq(schema.users.invitedBy, userId));
      await tx.update(schema.verifications).set({ decidedBy: null }).where(eq(schema.verifications.decidedBy, userId));
      await tx.delete(schema.emailOutbox).where(eq(schema.emailOutbox.userId, userId));
      await tx.delete(schema.users).where(eq(schema.users.id, userId));
    });
  }
}

await boss.start();
for (const queue of ["email.scan", "email.send", "matching.run", "session.confirm_deadline", "auth.cleanup", "account.hard_delete"]) {
  await boss.createQueue(queue);
}
await boss.work("email.scan", async () => enqueuePendingEmails());
await boss.work("email.send", async (jobs) => {
  for (const job of jobs) {
    const parsed = z.object({ outboxId: z.string().uuid() }).safeParse(job.data);
    if (!parsed.success) throw new Error("Invalid email job payload");
    await sendOutboxItem(parsed.data.outboxId);
  }
});
await boss.schedule("email.scan", "* * * * *");
await boss.work("matching.run", async () => scheduleMatching());
await boss.schedule("matching.run", "*/15 * * * *");
await boss.work("session.confirm_deadline", async () => cancelUnconfirmedSessions());
await boss.schedule("session.confirm_deadline", "* * * * *");
await boss.work("auth.cleanup", async () => cleanupExpiredAuthArtifacts());
await boss.schedule("auth.cleanup", "15 3 * * *");
await boss.work("account.hard_delete", async () => hardDeleteAccounts());
await boss.schedule("account.hard_delete", "30 3 * * *");

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    await boss.stop({ graceful: true, timeout: 30_000 });
    process.exit(0);
  });
}

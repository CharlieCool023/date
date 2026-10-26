import { and, eq, gt, lte } from "drizzle-orm";
import { sessionStatusSchema } from "@velum/contracts";
import { db, schema } from "@velum/db";
import {
  cancelUnconfirmedSession, confirmSession, confirmUnveil, declineSession,
  joinSession, publicOutcome, type DuskSession
} from "./sessions";

function toDomain(row: typeof schema.duskSessions.$inferSelect): DuskSession {
  return {
    id: row.id,
    userA: row.userA,
    userB: row.userB,
    status: sessionStatusSchema.parse(row.status),
    startsAt: row.startsAt,
    joinDeadline: row.joinDeadline,
    liveStartedAt: row.liveStartedAt,
    confirmedAAt: row.confirmedAAt,
    confirmedBAt: row.confirmedBAt,
    joinedAAt: row.joinedAAt,
    joinedBAt: row.joinedBAt,
    unveilAAt: row.unveilAAt,
    unveilBAt: row.unveilBAt
  };
}

async function lockedSession(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], sessionId: string) {
  const [row] = await tx.select().from(schema.duskSessions)
    .where(eq(schema.duskSessions.id, sessionId))
    .for("update");
  if (!row) throw new Error("Session not found");
  return row;
}

export async function confirmSessionForUser(sessionId: string, userId: string, now = new Date()) {
  return db.transaction(async (tx) => {
    const row = await lockedSession(tx, sessionId);
    const updated = confirmSession(toDomain(row), userId, now);
    await tx.update(schema.duskSessions).set({
      confirmedAAt: updated.confirmedAAt,
      confirmedBAt: updated.confirmedBAt,
      status: updated.status
    }).where(eq(schema.duskSessions.id, sessionId));
    return publicOutcome(updated);
  });
}

export async function joinSessionForUser(sessionId: string, userId: string, now = new Date()) {
  return db.transaction(async (tx) => {
    const row = await lockedSession(tx, sessionId);
    const updated = joinSession(toDomain(row), userId, now);
    await tx.update(schema.duskSessions).set({
      status: updated.status,
      joinedAAt: updated.joinedAAt,
      joinedBAt: updated.joinedBAt,
      liveStartedAt: updated.liveStartedAt
    }).where(eq(schema.duskSessions.id, sessionId));
    return {
      outcome: publicOutcome(updated),
      liveStartedAt: updated.liveStartedAt
    };
  });
}

export async function declineSessionForUser(sessionId: string, userId: string) {
  return db.transaction(async (tx) => {
    const row = await lockedSession(tx, sessionId);
    const updated = declineSession(toDomain(row), userId);
    await tx.update(schema.duskSessions).set({
      status: updated.status,
      endReason: "declined"
    }).where(eq(schema.duskSessions.id, sessionId));
    const peerId = userId === row.userA ? row.userB : row.userA;
    await tx.insert(schema.emailOutbox).values({
      idempotencyKey: `session_cancelled:${sessionId}:${peerId}`,
      userId: peerId,
      template: "session_cancelled",
      params: { sessionId }
    }).onConflictDoNothing();
    return publicOutcome(updated);
  });
}

export async function cancelUnconfirmedSessions(now = new Date()) {
  const candidates = await db.select({ id: schema.duskSessions.id })
    .from(schema.duskSessions)
    .where(and(
      eq(schema.duskSessions.status, "proposed"),
      lte(schema.duskSessions.startsAt, new Date(now.getTime() + 60 * 60_000)),
      gt(schema.duskSessions.startsAt, now)
    ));
  let cancelled = 0;
  for (const candidate of candidates) {
    await db.transaction(async (tx) => {
      const row = await lockedSession(tx, candidate.id);
      const updated = cancelUnconfirmedSession(toDomain(row), now);
      if (updated.status !== "cancelled") return;
      await tx.update(schema.duskSessions).set({
        status: "cancelled",
        endReason: "not_confirmed"
      }).where(eq(schema.duskSessions.id, row.id));
      const notified = new Set<string>();
      for (const [userId, confirmedAt] of [[row.userA, row.confirmedAAt], [row.userB, row.confirmedBAt]] as const) {
        if (!confirmedAt || notified.has(userId)) continue;
        notified.add(userId);
        await tx.insert(schema.emailOutbox).values({
          idempotencyKey: `session_cancelled:${row.id}:${userId}`,
          userId,
          template: "session_cancelled",
          params: { sessionId: row.id }
        }).onConflictDoNothing();
      }
      cancelled += 1;
    });
  }
  return cancelled;
}

export async function confirmUnveilForUser(sessionId: string, userId: string, now = new Date()) {
  return db.transaction(async (tx) => {
    const row = await lockedSession(tx, sessionId);
    const current = toDomain(row);
    if (current.status === "unveiled" && (userId === current.userA || userId === current.userB)) {
      return "unveiled" as const;
    }
    const updated = confirmUnveil(current, userId, now);
    await tx.update(schema.duskSessions).set({
      unveilAAt: updated.unveilAAt,
      unveilBAt: updated.unveilBAt,
      status: updated.status
    }).where(eq(schema.duskSessions.id, sessionId));
    if (updated.status === "unveiled") {
      await tx.insert(schema.conversations).values({
        sessionId,
        userA: updated.userA,
        userB: updated.userB
      }).onConflictDoNothing();
    }
    return publicOutcome(updated);
  });
}

export async function endSessionNeutral(sessionId: string) {
  return db.transaction(async (tx) => {
    const row = await lockedSession(tx, sessionId);
    if (row.status === "ended" || row.status === "cancelled" || row.status === "no_show") return false;
    if (row.status !== "live" && row.status !== "lobby") return false;
    await tx.update(schema.duskSessions)
      .set({ status: "ended", endReason: "timeout" })
      .where(eq(schema.duskSessions.id, sessionId));
    return true;
  });
}

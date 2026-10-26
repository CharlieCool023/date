import "dotenv/config";
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import websocket from "@fastify/websocket";
import { createClient } from "redis";
import { and, eq, gt } from "drizzle-orm";
import { roomClientEventSchema } from "@velum/contracts";
import { confirmUnveilForUser, containsIdentityLeak, endSessionNeutral, joinSessionForUser } from "@velum/core";
import { encryptForModeration, hashToken } from "@velum/crypto";
import { db, schema } from "@velum/db";
import type { WebSocket } from "ws";

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) throw new Error("REDIS_URL is required");
const redis = createClient({ url: redisUrl });
const subscriber = redis.duplicate();
const instanceId = randomUUID();
const sockets = new Map<string, Set<WebSocket>>();
const sessionTimers = new Map<string, NodeJS.Timeout>();
const aliases = ["Amber", "Slate", "Moss", "Cedar", "Indigo", "Sable", "Cove", "Ash"];

const app = Fastify({
  logger: {
    redact: ["req.headers.cookie", "req.headers.authorization"],
    serializers: { req: (request) => ({ method: request.method, url: "/ws" }) }
  }
});
await Promise.all([redis.connect(), subscriber.connect()]);
await app.register(websocket);

function send(socket: WebSocket, payload: unknown) {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(payload));
}

function broadcastLocal(sessionId: string, payload: unknown) {
  for (const socket of sockets.get(sessionId) ?? []) send(socket, payload);
}

function publish(sessionId: string, payload: Record<string, unknown>) {
  return redis.publish(`session:${sessionId}:events`, JSON.stringify({ ...payload, origin: instanceId }));
}

await subscriber.pSubscribe("session:*:events", (message, channel) => {
  try {
    const payload: unknown = JSON.parse(message);
    if (typeof payload !== "object" || payload === null || !("origin" in payload)) return;
    const event = payload as Record<string, unknown>;
    if (event.origin === instanceId || typeof event.type !== "string") return;
    const sessionId = channel.split(":")[1];
    if (!sessionId) return;
    delete event.origin;
    broadcastLocal(sessionId, event);
  } catch {
    app.log.error("Rejected malformed internal realtime event");
  }
});

function cookieValue(header: string | undefined, name: string): string | null {
  const item = header?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : null;
}

function ensureSessionTimer(sessionId: string, liveStartedAt: Date) {
  if (sessionTimers.has(sessionId)) return;
  const timer = setInterval(() => {
    void (async () => {
      const elapsed = Math.floor((Date.now() - liveStartedAt.getTime()) / 1000);
      const remainingSeconds = Math.max(0, 600 - elapsed);
      if (remainingSeconds === 0) {
        if (await endSessionNeutral(sessionId)) {
          await expireRoomBuffer(sessionId, 900);
          broadcastLocal(sessionId, { type: "ended" });
          await publish(sessionId, { type: "ended" });
        }
        clearInterval(timer);
        sessionTimers.delete(sessionId);
        return;
      }
      const tick = { type: "tick", serverTime: new Date().toISOString(), remainingSeconds };
      broadcastLocal(sessionId, tick);
      await publish(sessionId, tick);
    })().catch(() => app.log.error("Session timer operation failed"));
  }, 1000);
  sessionTimers.set(sessionId, timer);
}

async function expireRoomBuffer(sessionId: string, preferredSeconds: number) {
  const hardExpiryKey = `session:${sessionId}:hard-expiry`;
  const hardExpiry = await redis.get(hardExpiryKey);
  const remainingHardSeconds = hardExpiry ? Number(hardExpiry) - Math.floor(Date.now() / 1000) : preferredSeconds;
  const ttl = Math.max(1, Math.min(preferredSeconds, remainingHardSeconds));
  await Promise.all([
    redis.expire(`session:${sessionId}:msgs`, ttl),
    redis.expire(hardExpiryKey, ttl)
  ]);
}

async function authenticatedUser(cookie: string | undefined): Promise<string | null> {
  const token = cookieValue(cookie, "velum_session");
  if (!token) return null;
  const [session] = await db.select({ userId: schema.authSessions.userId })
    .from(schema.authSessions)
    .where(and(eq(schema.authSessions.tokenHash, hashToken(token)), gt(schema.authSessions.expiresAt, new Date())))
    .limit(1);
  return session?.userId ?? null;
}

async function getAlias(sessionId: string, userId: string): Promise<string> {
  const key = `session:${sessionId}:alias:${userId}`;
  const saved = await redis.get(key);
  if (saved) return saved;
  const alias = aliases[Math.floor(Math.random() * aliases.length)]!;
  await redis.set(key, alias, { EX: 1800, NX: true });
  return (await redis.get(key)) ?? alias;
}

async function checkRateLimit(sessionId: string, userId: string): Promise<boolean> {
  const secondKey = `rate:room:second:${sessionId}:${userId}`;
  const minuteKey = `rate:room:minute:${sessionId}:${userId}`;
  const [perSecond, perMinute] = await Promise.all([
    redis.incr(secondKey),
    redis.incr(minuteKey)
  ]);
  if (perSecond === 1) await redis.expire(secondKey, 1);
  if (perMinute === 1) await redis.expire(minuteKey, 60);
  return perSecond <= 5 && perMinute <= 30;
}

app.get("/health", async () => ({ status: "ok" }));
app.get("/ws", { websocket: true }, (socket, request) => {
  let userId: string | null = null;
  let joinedSession: string | null = null;
  const authPromise = authenticatedUser(request.headers.cookie);

  socket.on("message", async (raw) => {
    try {
      userId ??= await authPromise;
      if (!userId) {
        socket.close(1008, "Authentication required");
        return;
      }
      let decoded: unknown;
      try {
        decoded = JSON.parse(raw.toString());
      } catch {
        send(socket, { type: "error", code: "INVALID_EVENT", message: "That action could not be processed." });
        return;
      }
      const parsed = roomClientEventSchema.safeParse(decoded);
      if (!parsed.success) {
        send(socket, { type: "error", code: "INVALID_EVENT", message: "That action could not be processed." });
        return;
      }
      const event = parsed.data;
      if (event.type === "join") {
        if (joinedSession) return;
        const [session] = await db.select().from(schema.duskSessions)
          .where(eq(schema.duskSessions.id, event.sessionId)).limit(1);
        if (!session || (session.userA !== userId && session.userB !== userId)
          || !["confirmed", "lobby", "live"].includes(session.status)) {
          socket.close(1008, "Session unavailable");
          return;
        }
        if (session.status !== "live") await joinSessionForUser(session.id, userId);
        joinedSession = session.id;
        const alias = await getAlias(session.id, userId);
        const latest = await db.select({
          status: schema.duskSessions.status,
          liveStartedAt: schema.duskSessions.liveStartedAt
        }).from(schema.duskSessions).where(eq(schema.duskSessions.id, session.id)).limit(1);
        const room = latest[0];
        sockets.set(session.id, sockets.get(session.id) ?? new Set());
        sockets.get(session.id)?.add(socket);
        const buffered = await redis.lRange(`session:${session.id}:msgs`, -20, -1);
        for (const item of buffered) send(socket, { type: "message", ...JSON.parse(item) as object });
        send(socket, { type: "state", status: room?.status ?? "lobby", alias });
        if (room?.status === "live" && room.liveStartedAt) {
          ensureSessionTimer(session.id, room.liveStartedAt);
          await expireRoomBuffer(session.id, 1800);
        }
        return;
      }

      if (!joinedSession) {
        send(socket, { type: "error", code: "JOIN_REQUIRED", message: "Join a session before continuing." });
        return;
      }

      if (event.type === "message") {
        const [session] = await db.select({ status: schema.duskSessions.status })
          .from(schema.duskSessions).where(eq(schema.duskSessions.id, joinedSession)).limit(1);
        if (session?.status !== "live") {
          send(socket, { type: "error", code: "SESSION_ENDED", message: "This session has ended." });
          return;
        }
        if (!await checkRateLimit(joinedSession, userId)) {
          send(socket, { type: "error", code: "RATE_LIMITED", message: "Please slow down for a moment." });
          return;
        }
        if (containsIdentityLeak(event.body)) {
          send(socket, { type: "error", code: "IDENTITY_LEAK", message: "Keep identifying details private until you both unveil." });
          return;
        }
        const message = {
          alias: await getAlias(joinedSession, userId),
          body: event.body,
          sentAt: new Date().toISOString()
        };
        const key = `session:${joinedSession}:msgs`;
        const hardExpiryKey = `session:${joinedSession}:hard-expiry`;
        await redis.set(hardExpiryKey, String(Math.floor(Date.now() / 1000) + 1800), { EX: 1800, NX: true });
        await redis.rPush(key, JSON.stringify(message));
        await expireRoomBuffer(joinedSession, 1800);
        broadcastLocal(joinedSession, { type: "message", ...message });
        await publish(joinedSession, { type: "message", ...message });
        return;
      }

      if (event.type === "unveil_confirm") {
        const result = await confirmUnveilForUser(joinedSession, userId);
        if (result === "unveiled") {
          await publish(joinedSession, { type: "unveiled" });
          broadcastLocal(joinedSession, { type: "unveiled" });
        }
        return;
      }

      if (event.type === "leave") {
        if (await endSessionNeutral(joinedSession)) {
          await expireRoomBuffer(joinedSession, 900);
          await publish(joinedSession, { type: "ended" });
          broadcastLocal(joinedSession, { type: "ended" });
        }
        return;
      }

      if (event.type === "report") {
        const [session] = await db.select().from(schema.duskSessions)
          .where(eq(schema.duskSessions.id, joinedSession)).limit(1);
        if (!session || (session.userA !== userId && session.userB !== userId)) {
          send(socket, { type: "error", code: "SESSION_UNAVAILABLE", message: "This action could not be completed." });
          return;
        }
        let evidenceCiphertext: Buffer | null = null;
        if (event.includeEvidence) {
          const publicKey = process.env.MODERATION_PUBLIC_KEY?.replace(/\\n/g, "\n");
          if (!publicKey) {
            send(socket, { type: "error", code: "REPORT_UNAVAILABLE", message: "Evidence storage is not configured. You can submit the report without evidence." });
            return;
          }
          const evidence = await redis.lRange(`session:${joinedSession}:msgs`, -20, -1);
          evidenceCiphertext = encryptForModeration(JSON.stringify(evidence), publicKey);
        }
        const reportedId = session.userA === userId ? session.userB : session.userA;
        await db.transaction(async (tx) => {
          const [report] = await tx.insert(schema.reports).values({
            reporterId: userId!,
            reportedId,
            sessionId: joinedSession!,
            reason: event.reason,
            evidenceCiphertext
          }).returning({ id: schema.reports.id });
          if (report) await tx.insert(schema.emailOutbox).values({
            idempotencyKey: `report_received:${report.id}:${userId}`,
            userId,
            template: "report_received",
            params: { reportId: report.id }
          }).onConflictDoNothing();
        });
        send(socket, { type: "report_received" });
      }
    } catch {
      send(socket, { type: "error", code: "TEMPORARY_FAILURE", message: "That action could not be completed. Please try again." });
      app.log.error("Realtime event processing failed");
    }
  });

  socket.on("close", () => {
    if (joinedSession) {
      const sessionSockets = sockets.get(joinedSession);
      sessionSockets?.delete(socket);
      if (sessionSockets?.size === 0) sockets.delete(joinedSession);
    }
  });
});

for (const session of await db.select({
  id: schema.duskSessions.id,
  liveStartedAt: schema.duskSessions.liveStartedAt
}).from(schema.duskSessions).where(eq(schema.duskSessions.status, "live"))) {
  if (session.liveStartedAt) ensureSessionTimer(session.id, session.liveStartedAt);
}

const origin = process.env.WEBAUTHN_ORIGIN;
if (!origin) throw new Error("WEBAUTHN_ORIGIN is required");
app.addHook("onRequest", async (request, reply) => {
  if (request.url === "/health") return;
  if (request.headers.origin !== origin) {
    reply.code(403).send({ code: "FORBIDDEN", message: "Request not allowed." });
  }
});

const port = Number(process.env.REALTIME_PORT ?? 4001);
await app.listen({ host: "0.0.0.0", port });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    await app.close();
    await Promise.all([redis.quit(), subscriber.quit()]);
    process.exit(0);
  });
}

import { generateToken, hashToken } from "@velum/crypto";
import { redisClient } from "./rate-limit";

const TICKET_TTL_SECONDS = 60;

// The realtime service runs on another origin, so the session cookie never reaches it.
// A ticket is single-use, bound to one member and one session, and only its hash is stored.
export async function issueRoomTicket(userId: string, sessionId: string): Promise<string> {
  const ticket = generateToken();
  const redis = await redisClient();
  await redis.set(`room-ticket:${hashToken(ticket).toString("hex")}`, JSON.stringify({ userId, sessionId }), { EX: TICKET_TTL_SECONDS });
  return ticket;
}

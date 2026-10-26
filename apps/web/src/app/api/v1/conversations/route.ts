import { and, eq, or } from "drizzle-orm";
import { db, schema } from "@velum/db";
import { requireMember } from "@/lib/member";

export async function GET(request: Request) {
  const member = await requireMember(request);
  if ("response" in member) return member.response;
  const conversations = await db.select({
    id: schema.conversations.id,
    sessionId: schema.conversations.sessionId,
    userA: schema.conversations.userA,
    userB: schema.conversations.userB,
    status: schema.conversations.status,
    createdAt: schema.conversations.createdAt
  }).from(schema.conversations).where(and(
    eq(schema.conversations.status, "open"),
    or(eq(schema.conversations.userA, member.userId), eq(schema.conversations.userB, member.userId))
  ));
  return Response.json({
    conversations: conversations.map((conversation) => ({
      id: conversation.id,
      sessionId: conversation.sessionId,
      peerId: conversation.userA === member.userId ? conversation.userB : conversation.userA,
      createdAt: conversation.createdAt
    }))
  });
}

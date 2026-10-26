import { and, desc, eq, isNull, or, gt } from "drizzle-orm";
import { chatMessageSchema } from "@velum/contracts";
import { db, schema } from "@velum/db";
import { decrypt, encrypt } from "@velum/crypto";
import { allowRequest } from "@/lib/rate-limit";
import { getEncryptionKey } from "@/lib/security";
import { requireMember } from "@/lib/member";

export async function GET(request: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const member = await requireMember(request);
  if ("response" in member) return member.response;
  const { conversationId } = await params;
  const [conversation] = await db.select().from(schema.conversations).where(and(
    eq(schema.conversations.id, conversationId),
    eq(schema.conversations.status, "open"),
    or(eq(schema.conversations.userA, member.userId), eq(schema.conversations.userB, member.userId))
  )).limit(1);
  if (!conversation) return Response.json({ code: "NOT_FOUND", message: "Conversation not found." }, { status: 404 });
  const blocks = await db.select({ blockerId: schema.blocks.blockerId }).from(schema.blocks).where(or(
    and(eq(schema.blocks.blockerId, conversation.userA), eq(schema.blocks.blockedId, conversation.userB)),
    and(eq(schema.blocks.blockerId, conversation.userB), eq(schema.blocks.blockedId, conversation.userA))
  )).limit(1);
  if (blocks.length > 0) return Response.json({ code: "NOT_FOUND", message: "Conversation not found." }, { status: 404 });
  const messages = await db.select().from(schema.messages)
    .where(and(
      eq(schema.messages.conversationId, conversationId),
      or(isNull(schema.messages.expiresAt), gt(schema.messages.expiresAt, new Date()))
    ))
    .orderBy(desc(schema.messages.createdAt)).limit(100);
  const encryptionKey = getEncryptionKey();
  return Response.json({
    messages: messages.reverse().map((message) => ({
      id: message.id,
      senderId: message.senderId,
      body: decrypt(message.bodyCiphertext, encryptionKey),
      createdAt: message.createdAt
    }))
  }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const member = await requireMember(request);
  if ("response" in member) return member.response;
  if (!await allowRequest(request, `chat-${member.userId}`, 30, 60)) {
    return Response.json({ code: "RATE_LIMITED", message: "Please slow down for a moment." }, { status: 429 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ code: "INVALID_INPUT", message: "Message is invalid." }, { status: 400 });
  }
  const parsed = chatMessageSchema.safeParse(body);
  if (!parsed.success) return Response.json({ code: "INVALID_INPUT", message: "Message is invalid." }, { status: 400 });
  const { conversationId } = await params;
  const [conversation] = await db.select().from(schema.conversations).where(and(
    eq(schema.conversations.id, conversationId),
    eq(schema.conversations.status, "open"),
    or(eq(schema.conversations.userA, member.userId), eq(schema.conversations.userB, member.userId))
  )).limit(1);
  if (!conversation) return Response.json({ code: "NOT_FOUND", message: "Conversation not found." }, { status: 404 });
  const blocks = await db.select({ blockerId: schema.blocks.blockerId }).from(schema.blocks).where(or(
    and(eq(schema.blocks.blockerId, conversation.userA), eq(schema.blocks.blockedId, conversation.userB)),
    and(eq(schema.blocks.blockerId, conversation.userB), eq(schema.blocks.blockedId, conversation.userA))
  )).limit(1);
  if (blocks.length > 0) return Response.json({ code: "NOT_FOUND", message: "Conversation not found." }, { status: 404 });
  const sentAt = new Date();
  const [message] = await db.insert(schema.messages).values({
    conversationId,
    senderId: member.userId,
    bodyCiphertext: encrypt(parsed.data.body, getEncryptionKey()),
    ...(conversation.disappearingSeconds
      ? { expiresAt: new Date(sentAt.getTime() + conversation.disappearingSeconds * 1000) }
      : {})
  }).returning({ id: schema.messages.id, createdAt: schema.messages.createdAt });
  const peerId = conversation.userA === member.userId ? conversation.userB : conversation.userA;
  const bucket = Math.floor(sentAt.getTime() / (10 * 60_000));
  await db.insert(schema.emailOutbox).values({
    idempotencyKey: `new_message:${conversationId}:${peerId}:${bucket}`,
    userId: peerId,
    template: "new_message",
    params: { conversationId }
  }).onConflictDoNothing();
  return Response.json({ id: message?.id, createdAt: message?.createdAt }, { status: 201 });
}

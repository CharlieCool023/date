import { and, eq, or } from "drizzle-orm";
import { blockSchema } from "@velum/contracts";
import { db, schema } from "@velum/db";
import { requireMember } from "@/lib/member";

export async function POST(request: Request) {
  const member = await requireMember(request);
  if ("response" in member) return member.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ code: "INVALID_INPUT", message: "Block details are invalid." }, { status: 400 });
  }
  const parsed = blockSchema.safeParse(body);
  if (!parsed.success || parsed.data.userId === member.userId) {
    return Response.json({ code: "INVALID_INPUT", message: "Block details are invalid." }, { status: 400 });
  }
  const blockedId = parsed.data.userId;
  const [target] = await db.select({ id: schema.users.id }).from(schema.users)
    .where(eq(schema.users.id, blockedId)).limit(1);
  if (!target) return Response.json({ code: "NOT_FOUND", message: "Member not found." }, { status: 404 });
  await db.transaction(async (tx) => {
    await tx.insert(schema.blocks).values({ blockerId: member.userId, blockedId }).onConflictDoNothing();
    const affected = await tx.select({ id: schema.duskSessions.id, status: schema.duskSessions.status })
      .from(schema.duskSessions).where(and(
        or(
          and(eq(schema.duskSessions.userA, member.userId), eq(schema.duskSessions.userB, blockedId)),
          and(eq(schema.duskSessions.userA, blockedId), eq(schema.duskSessions.userB, member.userId))
        ),
        or(eq(schema.duskSessions.status, "proposed"), eq(schema.duskSessions.status, "confirmed"),
          eq(schema.duskSessions.status, "lobby"), eq(schema.duskSessions.status, "live"))
      ));
    for (const session of affected) {
      await tx.update(schema.duskSessions)
        .set({ status: "ended", endReason: "reported" })
        .where(eq(schema.duskSessions.id, session.id));
    }
    await tx.update(schema.conversations).set({ status: "closed" }).where(and(
      eq(schema.conversations.status, "open"),
      or(
        and(eq(schema.conversations.userA, member.userId), eq(schema.conversations.userB, blockedId)),
        and(eq(schema.conversations.userA, blockedId), eq(schema.conversations.userB, member.userId))
      )
    ));
  });
  return Response.json({ status: "blocked" }, { status: 201 });
}

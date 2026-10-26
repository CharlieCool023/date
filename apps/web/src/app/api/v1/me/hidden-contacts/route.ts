import { and, eq, sql } from "drizzle-orm";
import { hiddenContactSchema } from "@velum/contracts";
import { emailBlindIndex } from "@velum/crypto";
import { db, schema } from "@velum/db";
import { getBlindIndexKey } from "@/lib/security";
import { requireMember } from "@/lib/member";

export async function GET(request: Request) {
  const member = await requireMember(request);
  if ("response" in member) return member.response;
  const [result] = await db.select({ count: sql<number>`count(*)` })
    .from(schema.hiddenContacts).where(eq(schema.hiddenContacts.userId, member.userId));
  return Response.json({ count: Number(result?.count ?? 0) });
}

export async function POST(request: Request) {
  const member = await requireMember(request);
  if ("response" in member) return member.response;
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ code: "INVALID_INPUT", message: "Contact details are invalid." }, { status: 400 });
  }
  const parsed = hiddenContactSchema.safeParse(input);
  if (!parsed.success) return Response.json({ code: "INVALID_INPUT", message: "Contact details are invalid." }, { status: 400 });
  const blindIndex = emailBlindIndex(parsed.data.email, getBlindIndexKey());
  const [self] = await db.select({ blindIndex: schema.userContacts.emailBlindIndex })
    .from(schema.userContacts).where(eq(schema.userContacts.userId, member.userId)).limit(1);
  if (self && self.blindIndex.equals(blindIndex)) {
    return Response.json({ code: "INVALID_CONTACT", message: "You cannot hide your own contact." }, { status: 400 });
  }
  await db.insert(schema.hiddenContacts).values({ userId: member.userId, emailBlindIndex: blindIndex })
    .onConflictDoNothing();
  return Response.json({ status: "hidden" }, { status: 201 });
}

export async function DELETE(request: Request) {
  const member = await requireMember(request);
  if ("response" in member) return member.response;
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ code: "INVALID_INPUT", message: "Contact details are invalid." }, { status: 400 });
  }
  const parsed = hiddenContactSchema.safeParse(input);
  if (!parsed.success) return Response.json({ code: "INVALID_INPUT", message: "Contact details are invalid." }, { status: 400 });
  const blindIndex = emailBlindIndex(parsed.data.email, getBlindIndexKey());
  await db.delete(schema.hiddenContacts).where(and(
    eq(schema.hiddenContacts.userId, member.userId),
    eq(schema.hiddenContacts.emailBlindIndex, blindIndex)
  ));
  return Response.json({ status: "removed" });
}

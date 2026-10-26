import { and, eq, inArray } from "drizzle-orm";
import { eligibilityUpdateSchema } from "@velum/contracts";
import { db, schema } from "@velum/db";
import { logger } from "@/lib/logger";
import { requireMember } from "@/lib/member";

function parseAge(dateString: string, now: Date): { age: number; birthYear: number } {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== dateString) {
    throw new Error("Invalid date");
  }
  let age = now.getUTCFullYear() - date.getUTCFullYear();
  const beforeBirthday = now.getUTCMonth() < date.getUTCMonth()
    || (now.getUTCMonth() === date.getUTCMonth() && now.getUTCDate() < date.getUTCDate());
  if (beforeBirthday) age -= 1;
  return { age, birthYear: date.getUTCFullYear() };
}

export async function PUT(request: Request) {
  const member = await requireMember(request);
  if ("response" in member) return member.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ code: "INVALID_INPUT", message: "Eligibility details are invalid." }, { status: 400 });
  }
  const parsed = eligibilityUpdateSchema.safeParse(body);
  if (!parsed.success) return Response.json({ code: "INVALID_INPUT", message: "Eligibility details are invalid." }, { status: 400 });
  const now = new Date();
  const age = parseAge(parsed.data.birthDate, now);
  if (age.age < 18) return Response.json({ code: "NOT_ELIGIBLE", message: "Velum is only available to adults." }, { status: 422 });
  const zones = await db.select({ id: schema.zones.id }).from(schema.zones)
    .where(and(eq(schema.zones.id, parsed.data.zoneId), eq(schema.zones.active, true))).limit(1);
  if (zones.length === 0) return Response.json({ code: "INVALID_INPUT", message: "Eligibility details are invalid." }, { status: 400 });
  if (!["onboarding", "pending_verification", "active"].includes(member.status)) {
    return Response.json({ code: "INVALID_STATE", message: "Eligibility cannot be changed in this state." }, { status: 409 });
  }
  try {
    await db.update(schema.users).set({
      birthYear: age.birthYear,
      ageVerifiedAt: now,
      gender: parsed.data.gender,
      seeking: parsed.data.seeking,
      ageMin: parsed.data.ageMin,
      ageMax: parsed.data.ageMax,
      intent: parsed.data.intent,
      zoneId: parsed.data.zoneId,
      consentVersion: parsed.data.consentVersion
    }).where(and(
      eq(schema.users.id, member.userId),
      inArray(schema.users.status, ["onboarding", "pending_verification", "active"])
    ));
    return Response.json({ status: "saved" });
  } catch {
    logger.error({ operation: "onboarding.eligibility", userId: member.userId }, "Eligibility could not be saved");
    return Response.json({ code: "TEMPORARY_FAILURE", message: "Eligibility could not be saved." }, { status: 503 });
  }
}

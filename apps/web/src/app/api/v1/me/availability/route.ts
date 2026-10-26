import { eq } from "drizzle-orm";
import { availabilityUpdateSchema } from "@velum/contracts";
import { db, schema } from "@velum/db";
import { requireMember } from "@/lib/member";

function validTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export async function PUT(request: Request) {
  const member = await requireMember(request);
  if ("response" in member) return member.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ code: "INVALID_INPUT", message: "Availability is invalid." }, { status: 400 });
  }
  const parsed = availabilityUpdateSchema.safeParse(body);
  if (!parsed.success || !validTimeZone(parsed.data.timezone)) {
    return Response.json({ code: "INVALID_INPUT", message: "Availability is invalid." }, { status: 400 });
  }
  await db.transaction(async (tx) => {
    await tx.delete(schema.availability).where(eq(schema.availability.userId, member.userId));
    await tx.insert(schema.availability).values(parsed.data.windows.map((window) => ({
      userId: member.userId,
      weekday: window.weekday,
      startMinute: window.startMinute,
      endMinute: window.endMinute,
      timezone: parsed.data.timezone
    })));
    await tx.update(schema.users).set({ timezone: parsed.data.timezone })
      .where(eq(schema.users.id, member.userId));
  });
  return Response.json({ status: "saved", count: parsed.data.windows.length });
}

export async function GET(request: Request) {
  const member = await requireMember(request);
  if ("response" in member) return member.response;
  const windows = await db.select({
    weekday: schema.availability.weekday,
    startMinute: schema.availability.startMinute,
    endMinute: schema.availability.endMinute,
    timezone: schema.availability.timezone
  }).from(schema.availability).where(eq(schema.availability.userId, member.userId));
  return Response.json({ windows });
}

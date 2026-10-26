import { eq } from "drizzle-orm";
import { db, schema } from "@velum/db";
import { requireMember } from "@/lib/member";

export async function POST(request: Request) {
  const member = await requireMember(request);
  if ("response" in member) return member.response;
  if (member.status !== "active" && member.status !== "paused") {
    return Response.json({ code: "INVALID_STATE", message: "This account cannot be paused now." }, { status: 409 });
  }
  const next = member.status === "active" ? "paused" : "active";
  await db.update(schema.users).set({ status: next }).where(eq(schema.users.id, member.userId));
  return Response.json({ status: next });
}

import { eq } from "drizzle-orm";
import { db, schema } from "@velum/db";
import { hashToken } from "@velum/crypto";
import { inviteOpenSchema } from "@velum/contracts";
import { allowRequest } from "@/lib/rate-limit";

const neutral = () => Response.json({ message: "If this invitation is valid, you can continue." }, { status: 202 });

export async function POST(request: Request) {
  let input: unknown;
  try {
    if (!await allowRequest(request, "invite-open", 30, 600)) return neutral();
    input = await request.json();
  } catch {
    return neutral();
  }
  const parsed = inviteOpenSchema.safeParse(input);
  if (!parsed.success) return neutral();
  const tokenHash = hashToken(parsed.data.token);
  const [invite] = await db.select({ id: schema.invites.id, status: schema.invites.status, expiresAt: schema.invites.expiresAt })
    .from(schema.invites)
    .where(eq(schema.invites.tokenHash, tokenHash))
    .limit(1);
  if (!invite || (invite.status !== "sent" && invite.status !== "opened") || invite.expiresAt <= new Date()) return neutral();
  await db.update(schema.invites).set({ status: "opened" }).where(eq(schema.invites.id, invite.id));
  return neutral();
}

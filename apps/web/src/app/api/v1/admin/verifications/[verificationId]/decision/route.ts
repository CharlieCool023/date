import { eq } from "drizzle-orm";
import { verificationDecisionSchema } from "@velum/contracts";
import { decideManualVerification } from "@velum/core";
import { db, schema } from "@velum/db";
import { removeImage } from "@velum/storage";
import { requireAdmin } from "@/lib/admin";
import { logger } from "@/lib/logger";

export async function POST(request: Request, { params }: { params: Promise<{ verificationId: string }> }) {
  const actor = await requireAdmin(request);
  if ("response" in actor) return actor.response;
  const { verificationId } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ code: "INVALID_INPUT", message: "Decision is invalid." }, { status: 400 });
  }
  const parsed = verificationDecisionSchema.safeParse(body);
  if (!parsed.success) return Response.json({ code: "INVALID_INPUT", message: "Decision is invalid." }, { status: 400 });
  const [item] = await db.select().from(schema.verifications)
    .where(eq(schema.verifications.id, verificationId)).limit(1);
  if (!item || item.status !== "pending") return Response.json({ code: "NOT_FOUND", message: "Verification not found." }, { status: 404 });
  try {
    const result = await decideManualVerification(verificationId, actor.userId, parsed.data.status);
    if (!result) return Response.json({ code: "STATE_CHANGED", message: "This verification was already decided." }, { status: 409 });
    if (result.selfieKey) {
      try {
        await removeImage(result.selfieKey, "selfie");
      } catch {
        logger.error({ operation: "admin.verifications.selfie_cleanup", actorId: actor.userId }, "Temporary verification image cleanup failed");
        return Response.json({ code: "TEMPORARY_FAILURE", message: "The decision was saved; temporary image cleanup is pending." }, { status: 503 });
      }
    }
    return Response.json({ status: parsed.data.status });
  } catch {
    logger.error({ operation: "admin.verifications.decision", actorId: actor.userId }, "Verification decision failed");
    return Response.json({ code: "TEMPORARY_FAILURE", message: "The decision could not be saved." }, { status: 503 });
  }
}

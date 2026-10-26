import { and, eq } from "drizzle-orm";
import { requestManualVerification } from "@velum/core";
import { db, schema } from "@velum/db";
import { removeImage, storeImage } from "@velum/storage";
import { logger } from "@/lib/logger";
import { requireMember } from "@/lib/member";

const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  const member = await requireMember(request);
  if ("response" in member) return member.response;
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ code: "INVALID_INPUT", message: "Choose a selfie to submit." }, { status: 400 });
  }
  const file = form.get("selfie");
  if (!(file instanceof File) || !file.type.startsWith("image/") || file.size <= 0 || file.size > MAX_BYTES) {
    return Response.json({ code: "INVALID_INPUT", message: "Choose a valid selfie image." }, { status: 400 });
  }
  const [pending] = await db.select({ id: schema.verifications.id })
    .from(schema.verifications).where(and(
      eq(schema.verifications.userId, member.userId),
      eq(schema.verifications.status, "pending")
    )).limit(1);
  if (pending) return Response.json({ code: "ALREADY_PENDING", message: "Your verification is already being reviewed." }, { status: 409 });
  let key: string | null = null;
  try {
    key = await storeImage(new Uint8Array(await file.arrayBuffer()), member.userId, "selfie");
    await requestManualVerification(member.userId, key);
    return Response.json({ status: "pending" }, { status: 202 });
  } catch (error) {
    if (key) {
      await removeImage(key, "selfie").catch(() => {
        logger.error({ operation: "verification.cleanup", userId: member.userId }, "Unattached verification image cleanup failed");
      });
    }
    if (error instanceof Error && error.name === "InvalidVerificationState") {
      return Response.json({ code: "INVALID_STATE", message: error.message }, { status: 409 });
    }
    logger.error({ operation: "verification.upload", userId: member.userId }, "Manual verification submission failed");
    return Response.json({ code: "TEMPORARY_FAILURE", message: "Verification could not be submitted." }, { status: 503 });
  }
}

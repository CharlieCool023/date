import { confirmSessionForUser } from "@velum/core";
import { InvalidSessionTransition } from "@velum/core";
import { requireMember } from "@/lib/member";

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const member = await requireMember(request);
  if ("response" in member) return member.response;
  const { sessionId } = await params;
  try {
    const outcome = await confirmSessionForUser(sessionId, member.userId);
    return Response.json({ outcome });
  } catch (error) {
    if (error instanceof InvalidSessionTransition) {
      return Response.json({ code: "INVALID_STATE", message: "This session cannot be confirmed." }, { status: 409 });
    }
    return Response.json({ code: "TEMPORARY_FAILURE", message: "The session could not be confirmed." }, { status: 503 });
  }
}

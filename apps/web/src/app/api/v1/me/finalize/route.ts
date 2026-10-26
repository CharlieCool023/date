import { finalizeOnboarding } from "@velum/core";
import { requireMember } from "@/lib/member";

export async function POST(request: Request) {
  const member = await requireMember(request);
  if ("response" in member) return member.response;
  const active = await finalizeOnboarding(member.userId);
  if (!active) {
    return Response.json({
      code: "ONBOARDING_INCOMPLETE",
      message: "Complete your profile, verification, questionnaire, and availability before entering stealth mode."
    }, { status: 409 });
  }
  return Response.json({ status: "active" });
}

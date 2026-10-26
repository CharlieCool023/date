import { eq, inArray } from "drizzle-orm";
import { answersUpdateSchema } from "@velum/contracts";
import { db, schema } from "@velum/db";
import { requireMember } from "@/lib/member";

export async function GET(request: Request) {
  const member = await requireMember(request);
  if ("response" in member) return member.response;
  const allQuestions = await db.select().from(schema.questions);
  const latest = new Map<string, typeof allQuestions[number]>();
  for (const question of allQuestions) {
    const previous = latest.get(question.id);
    if (!previous || question.version > previous.version) latest.set(question.id, question);
  }
  const answers = await db.select({
    questionId: schema.answers.questionId,
    questionVersion: schema.answers.questionVersion,
    value: schema.answers.value,
    mustMatch: schema.answers.mustMatch
  }).from(schema.answers).where(eq(schema.answers.userId, member.userId));
  return Response.json({ questions: [...latest.values()], answers });
}

export async function PUT(request: Request) {
  const member = await requireMember(request);
  if ("response" in member) return member.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ code: "INVALID_INPUT", message: "Answers are invalid." }, { status: 400 });
  }
  const parsed = answersUpdateSchema.safeParse(body);
  if (!parsed.success) return Response.json({ code: "INVALID_INPUT", message: "Answers are invalid." }, { status: 400 });
  if (new Set(parsed.data.answers.map((answer) => answer.questionId)).size !== parsed.data.answers.length
    || parsed.data.answers.filter((answer) => answer.mustMatch).length > 3) {
    return Response.json({ code: "INVALID_INPUT", message: "Answers are invalid." }, { status: 400 });
  }

  const ids = parsed.data.answers.map((answer) => answer.questionId);
  const questions = await db.select().from(schema.questions).where(inArray(schema.questions.id, ids));
  const latest = new Map<string, typeof questions[number]>();
  for (const question of questions) {
    const existing = latest.get(question.id);
    if (!existing || question.version > existing.version) latest.set(question.id, question);
  }
  for (const answer of parsed.data.answers) {
    const question = latest.get(answer.questionId);
    if (!question || question.version !== answer.questionVersion || !validAnswer(question.kind, question.options, answer.value)) {
      return Response.json({ code: "INVALID_INPUT", message: "Answers are invalid." }, { status: 400 });
    }
  }
  await db.transaction(async (tx) => {
    for (const answer of parsed.data.answers) {
      await tx.insert(schema.answers).values({
        userId: member.userId,
        questionId: answer.questionId,
        questionVersion: answer.questionVersion,
        value: answer.value,
        mustMatch: answer.mustMatch
      }).onConflictDoUpdate({
        target: [schema.answers.userId, schema.answers.questionId],
        set: {
          questionVersion: answer.questionVersion,
          value: answer.value,
          mustMatch: answer.mustMatch
        }
      });
    }
  });
  return Response.json({ status: "saved", count: parsed.data.answers.length });
}

function validAnswer(kind: string, options: unknown, value: unknown): boolean {
  if (typeof options !== "object" || options === null || !("choices" in options) || !Array.isArray(options.choices)) return false;
  const choices = options.choices.filter((choice): choice is string => typeof choice === "string");
  if (kind === "single" || kind === "tradeoff") return typeof value === "string" && choices.includes(value);
  if (kind === "multi") return Array.isArray(value) && value.length > 0 && value.every((choice) =>
    typeof choice === "string" && choices.includes(choice)
  );
  if (kind === "scale" && typeof value === "number" && Number.isInteger(value) && "minimum" in options && "maximum" in options) {
    const minimum = options.minimum;
    const maximum = options.maximum;
    return typeof minimum === "number" && typeof maximum === "number" && value >= minimum && value <= maximum;
  }
  return false;
}

export type MatchCategory = "values" | "lifestyle" | "intent" | "tradeoffs" | "availability";
export type AnswerValue = string | number | string[];

export interface MatchAnswer {
  questionId: string;
  category: Exclude<MatchCategory, "availability">;
  kind: "single" | "multi" | "scale";
  value: AnswerValue;
  weight: number;
  mustMatch: boolean;
}

export interface Candidate {
  userId: string;
  answers: MatchAnswer[];
  availabilitySlots: string[];
  missedRounds: number;
}

export interface MatchResult {
  userA: string;
  userB: string;
  score: number;
  band: "strong" | "good";
  contributions: Record<MatchCategory, number>;
}

const categoryWeights: Record<MatchCategory, number> = {
  values: 0.4,
  lifestyle: 0.2,
  intent: 0.2,
  tradeoffs: 0.1,
  availability: 0.1
};

function similarity(left: AnswerValue, right: AnswerValue, kind: MatchAnswer["kind"]): number {
  if (kind === "scale" && typeof left === "number" && typeof right === "number") {
    return Math.max(0, 1 - Math.abs(left - right) / 4);
  }
  if (kind === "multi" && Array.isArray(left) && Array.isArray(right)) {
    const leftSet = new Set(left);
    const rightSet = new Set(right);
    const union = new Set([...leftSet, ...rightSet]).size;
    return union === 0 ? 1 : [...leftSet].filter((value) => rightSet.has(value)).length / union;
  }
  return left === right ? 1 : 0;
}

export function areMustMatchesCompatible(left: Candidate, right: Candidate): boolean {
  const rightById = new Map(right.answers.map((answer) => [answer.questionId, answer]));
  return left.answers.every((answer) => {
    if (!answer.mustMatch) return true;
    const peerAnswer = rightById.get(answer.questionId);
    return peerAnswer !== undefined && similarity(answer.value, peerAnswer.value, answer.kind) === 1;
  }) && right.answers.every((answer) => {
    if (!answer.mustMatch) return true;
    const peerAnswer = left.answers.find((item) => item.questionId === answer.questionId);
    return peerAnswer !== undefined && similarity(answer.value, peerAnswer.value, answer.kind) === 1;
  });
}

export function scorePair(left: Candidate, right: Candidate): MatchResult | null {
  if (left.userId === right.userId || !areMustMatchesCompatible(left, right)) return null;
  const contributions: Record<MatchCategory, number> = {
    values: 0,
    lifestyle: 0,
    intent: 0,
    tradeoffs: 0,
    availability: 0
  };
  const rightById = new Map(right.answers.map((answer) => [answer.questionId, answer]));
  const categoryTotals = new Map<MatchCategory, number>();
  for (const answer of left.answers) {
    const peerAnswer = rightById.get(answer.questionId);
    if (!peerAnswer || answer.category !== peerAnswer.category) continue;
    const weight = Math.min(answer.weight, peerAnswer.weight);
    contributions[answer.category] += similarity(answer.value, peerAnswer.value, answer.kind) * weight;
    categoryTotals.set(answer.category, (categoryTotals.get(answer.category) ?? 0) + weight);
  }
  for (const category of ["values", "lifestyle", "intent", "tradeoffs"] as const) {
    const total = categoryTotals.get(category) ?? 0;
    if (total > 0) contributions[category] /= total;
  }
  const commonSlots = left.availabilitySlots.filter((slot) => right.availabilitySlots.includes(slot)).length;
  const maxSlots = Math.max(left.availabilitySlots.length, right.availabilitySlots.length);
  contributions.availability = maxSlots === 0 ? 0 : commonSlots / maxSlots;
  const scoredCategories = (Object.keys(categoryWeights) as MatchCategory[])
    .filter((category) => category === "availability" || (categoryTotals.get(category) ?? 0) > 0);
  const availableWeight = scoredCategories.reduce((sum, category) => sum + categoryWeights[category], 0);
  const base = scoredCategories.reduce(
    (sum, category) => sum + contributions[category] * categoryWeights[category],
    0
  ) / availableWeight;
  const waitingBoost = Math.min(0.1, Math.max(left.missedRounds, right.missedRounds) * 0.02);
  const score = Math.min(1, base + waitingBoost);
  return {
    userA: left.userId < right.userId ? left.userId : right.userId,
    userB: left.userId < right.userId ? right.userId : left.userId,
    score,
    band: score >= 0.8 ? "strong" : "good",
    contributions
  };
}

export function pairCandidates(candidates: Candidate[], minimumScore = 0.65): MatchResult[] {
  const possible: MatchResult[] = [];
  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      const result = scorePair(candidates[i]!, candidates[j]!);
      if (result && result.score >= minimumScore) possible.push(result);
    }
  }
  possible.sort((a, b) => b.score - a.score);
  const used = new Set<string>();
  return possible.filter((match) => {
    if (used.has(match.userA) || used.has(match.userB)) return false;
    used.add(match.userA);
    used.add(match.userB);
    return true;
  });
}

import { describe, expect, it } from "vitest";
import { containsIdentityLeak } from "./identity-filter.js";
import { areMustMatchesCompatible, pairCandidates, type Candidate } from "./matching.js";
import { confirmUnveil, publicOutcome, type DuskSession } from "./sessions.js";

describe("Dark Room privacy rules", () => {
  it("rejects contact details and social handles", () => {
    expect(containsIdentityLeak("email me at member@example.com")).toBe(true);
    expect(containsIdentityLeak("find me @amber_name")).toBe(true);
    expect(containsIdentityLeak("let's chat about books")).toBe(false);
  });

  it("does not reveal a unilateral unveil choice", () => {
    const liveAt = new Date("2026-01-01T00:00:00.000Z");
    const session: DuskSession = {
      id: "session",
      userA: "a",
      userB: "b",
      status: "live",
      startsAt: liveAt,
      joinDeadline: new Date(liveAt.getTime() + 20 * 60_000),
      liveStartedAt: liveAt,
      confirmedAAt: liveAt,
      confirmedBAt: liveAt,
      joinedAAt: liveAt,
      joinedBAt: liveAt,
      unveilAAt: null,
      unveilBAt: null
    };
    const oneChoice = confirmUnveil(session, "a", new Date(liveAt.getTime() + 7 * 60_000));
    expect(publicOutcome(oneChoice)).toBe("in_progress");
    expect(oneChoice.unveilAAt).not.toBeNull();
    expect(oneChoice.unveilBAt).toBeNull();
    expect(publicOutcome({ ...oneChoice, status: "ended" })).toBe("ended");
  });
});

describe("matching", () => {
  const candidate = (userId: string, value: string, mustMatch = false): Candidate => ({
    userId,
    answers: [{
      questionId: "values-1",
      category: "values",
      kind: "single",
      value,
      weight: 1,
      mustMatch
    }],
    availabilitySlots: ["thu-20"],
    missedRounds: 0
  });

  it("enforces must-match answers and pairs each member at most once", () => {
    const alice = candidate("alice", "family", true);
    const bob = candidate("bob", "family");
    const carol = candidate("carol", "family");
    expect(areMustMatchesCompatible(alice, candidate("dan", "adventure"))).toBe(false);
    const pairs = pairCandidates([alice, bob, carol]);
    expect(pairs).toHaveLength(1);
    expect(new Set(pairs.flatMap(({ userA, userB }) => [userA, userB])).size).toBe(2);
  });
});

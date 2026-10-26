export type SessionStatus =
  | "proposed"
  | "confirmed"
  | "lobby"
  | "live"
  | "ended"
  | "unveiled"
  | "cancelled"
  | "no_show";

export interface DuskSession {
  id: string;
  userA: string;
  userB: string;
  status: SessionStatus;
  startsAt: Date;
  joinDeadline: Date;
  liveStartedAt: Date | null;
  confirmedAAt: Date | null;
  confirmedBAt: Date | null;
  joinedAAt: Date | null;
  joinedBAt: Date | null;
  unveilAAt: Date | null;
  unveilBAt: Date | null;
}

export class InvalidSessionTransition extends Error {
  constructor() {
    super("Session transition is not allowed");
    this.name = "InvalidSessionTransition";
  }
}

export function confirmSession(session: DuskSession, userId: string, now: Date): DuskSession {
  if (session.status !== "proposed") throw new InvalidSessionTransition();
  const next = userId === session.userA
    ? { ...session, confirmedAAt: session.confirmedAAt ?? now }
    : userId === session.userB
      ? { ...session, confirmedBAt: session.confirmedBAt ?? now }
      : null;
  if (!next) throw new InvalidSessionTransition();
  return next.confirmedAAt && next.confirmedBAt ? { ...next, status: "confirmed" } : next;
}

export function joinSession(session: DuskSession, userId: string, now: Date): DuskSession {
  if ((session.status !== "confirmed" && session.status !== "lobby") || now > session.joinDeadline) {
    throw new InvalidSessionTransition();
  }
  const next = userId === session.userA
    ? { ...session, status: "lobby" as const, joinedAAt: session.joinedAAt ?? now }
    : userId === session.userB
      ? { ...session, status: "lobby" as const, joinedBAt: session.joinedBAt ?? now }
      : null;
  if (!next) throw new InvalidSessionTransition();
  return next.joinedAAt && next.joinedBAt
    ? { ...next, status: "live", liveStartedAt: now }
    : next;
}

export function declineSession(session: DuskSession, userId: string): DuskSession {
  if (session.status !== "proposed") throw new InvalidSessionTransition();
  if (userId !== session.userA && userId !== session.userB) throw new InvalidSessionTransition();
  return { ...session, status: "cancelled" };
}

export function cancelUnconfirmedSession(session: DuskSession, now: Date): DuskSession {
  if (session.status !== "proposed" || session.startsAt.getTime() - now.getTime() > 60 * 60_000) {
    throw new InvalidSessionTransition();
  }
  if (!session.confirmedAAt || !session.confirmedBAt) return { ...session, status: "cancelled" };
  return session;
}

export function confirmUnveil(session: DuskSession, userId: string, now: Date): DuskSession {
  if (session.status !== "live" || !session.liveStartedAt) throw new InvalidSessionTransition();
  const availableAt = new Date(session.liveStartedAt.getTime() + 7 * 60_000);
  if (now < availableAt) throw new InvalidSessionTransition();
  const next = userId === session.userA
    ? { ...session, unveilAAt: session.unveilAAt ?? now }
    : userId === session.userB
      ? { ...session, unveilBAt: session.unveilBAt ?? now }
      : null;
  if (!next) throw new InvalidSessionTransition();
  return next.unveilAAt && next.unveilBAt ? { ...next, status: "unveiled" } : next;
}

export function publicOutcome(session: DuskSession): "unveiled" | "ended" | "in_progress" {
  if (session.status === "unveiled") return "unveiled";
  if (session.status === "ended" || session.status === "cancelled" || session.status === "no_show") return "ended";
  return "in_progress";
}

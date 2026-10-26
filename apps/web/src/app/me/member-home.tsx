"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Skeleton } from "@/components/loaders";
import HiddenContacts from "./hidden-contacts";

interface Session {
  id: string;
  startsAt: string;
  status: string;
  band: "strong" | "good";
  confirmed: boolean;
}

interface Status {
  status: string;
  role: string;
  recoveryCodesConfirmed: boolean;
  eligibilityComplete: boolean;
  verification: string | null;
  photoCount: number;
  answerCount: number;
  availabilityCount: number;
}

export default function MemberHome() {
  const [status, setStatus] = useState<Status | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const [statusResponse, sessionResponse] = await Promise.all([
      fetch("/api/v1/me/status", { cache: "no-store" }),
      fetch("/api/v1/sessions/upcoming", { cache: "no-store" })
    ]);
    if (statusResponse.status === 401 || sessionResponse.status === 401) {
      window.location.assign("/signin");
      return;
    }
    const statusData = await statusResponse.json();
    const sessionData = await sessionResponse.json();
    setStatus(statusData as Status);
    setSessions(Array.isArray(sessionData.sessions) ? sessionData.sessions : []);
  }

  useEffect(() => {
    void refresh().catch(() => setMessage("Your member space could not be loaded."));
  }, []);

  async function changePause() {
    setBusy(true);
    try {
      const response = await fetch("/api/v1/me/pause", { method: "POST" });
      if (!response.ok) throw new Error("Availability could not be changed.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Availability could not be changed.");
    } finally {
      setBusy(false);
    }
  }

  if (!status) return <section className="member-home"><Skeleton heading lines={4} label="Opening your private space" /></section>;
  const complete = status.status === "active";
  return (
    <section className="member-home">
      <div className="eyebrow"><span className="signal" aria-hidden="true" /> YOUR PRIVATE SPACE</div>
      <h1>{complete ? <>Good to have<br />you here.</> : <>Your space,<br />your pace.</>}</h1>
      <p className="lede">{status.status === "active"
        ? "You’re in stealth mode. There is no browsing; we’ll let you know when a session is ready."
        : status.status === "pending_verification"
          ? "Your verification is in the review queue. You can return here while we take a look."
          : "Finish your profile to enter stealth mode and become eligible for a thoughtful match."}</p>

      {!complete && (
        <div className="progress-list">
          <div><span>{status.recoveryCodesConfirmed ? "✓" : "01"}</span>Recovery codes</div>
          <div><span>{status.eligibilityComplete ? "✓" : "02"}</span>Eligibility and consent</div>
          <div><span>{status.photoCount >= 2 ? "✓" : "03"}</span>Private photos ({status.photoCount}/2)</div>
          <div><span>{status.verification === "approved" ? "✓" : status.verification === "pending" ? "…" : "04"}</span>Manual verification</div>
          <div><span>{status.answerCount >= 12 ? "✓" : "05"}</span>Questionnaire ({status.answerCount}/12)</div>
          <div><span>{status.availabilityCount > 0 ? "✓" : "06"}</span>Weekly availability</div>
        </div>
      )}
      <div className="member-actions">
        <Link className="button primary" href={complete ? "/conversations" : "/onboarding"}>
          {complete ? "Your conversations" : "Continue your profile"} <span aria-hidden="true">↗</span>
        </Link>
        <Link className="button secondary" href="/invites">Your invitations</Link>
        {status.role === "admin" || status.role === "moderator" ? <Link className="button secondary" href="/admin">Admin</Link> : null}
      </div>
      {sessions.length > 0 && (
        <section className="session-list">
          <h2>Upcoming sessions</h2>
          {sessions.map((session) => (
            <article className="session-item" key={session.id}>
              <div><span className="eyebrow">{session.band.toUpperCase()} MATCH</span>
                <p>{new Date(session.startsAt).toLocaleString()}</p>
                <small>{session.status === "proposed" ? session.confirmed ? "Waiting for the other confirmation" : "Confirmation requested" : "Your private room"}</small>
              </div>
              {session.status === "proposed" && !session.confirmed
                ? <button className="button secondary" type="button" onClick={async () => {
                  const response = await fetch(`/api/v1/sessions/${session.id}/confirm`, { method: "POST" });
                  if (response.ok) await refresh();
                  else setMessage("This session could not be confirmed.");
                }}>Confirm</button>
                : <Link className="button secondary" href={`/s/${session.id}`}>Open</Link>}
            </article>
          ))}
        </section>
      )}
      <section className="member-settings">
        <h2>Your controls</h2>
        <div className="member-actions">
          <button className="button secondary" type="button" onClick={changePause} disabled={busy} aria-busy={busy}>
            {status.status === "active" ? "Pause matching" : "Resume matching"}
          </button>
          <button className="text-button" type="button" onClick={async () => {
            if (!window.confirm("Delete your account? It will be deactivated immediately and personal data hard-deleted within seven days.")) return;
            const response = await fetch("/api/v1/me", { method: "DELETE" });
            if (response.ok) window.location.assign("/");
            else setMessage("The deletion request could not be completed.");
          }}>Delete account</button>
        </div>
      </section>
      <HiddenContacts />
      {message && <p className="notice" role="status">{message}</p>}
    </section>
  );
}

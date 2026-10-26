"use client";

import { useEffect, useState } from "react";

export default function InviteManager() {
  const [email, setEmail] = useState("");
  const [invites, setInvites] = useState<Array<{ id: string; status: string; expiresAt: string; email?: string }>>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const response = await fetch("/api/v1/invites", { cache: "no-store" });
    if (response.status === 401) {
      window.location.assign("/signin");
      return;
    }
    const body = await response.json();
    setInvites(Array.isArray(body.invites) ? body.invites : []);
  }
  useEffect(() => { void load().catch(() => setMessage("Invitations could not be loaded.")); }, []);

  async function send() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/v1/invites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ emails: [email] })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? "Invitation could not be queued.");
      setEmail("");
      setMessage("Your invitation will be sent privately.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Invitation could not be sent.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="invite-send">
        <label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label>
        <button className="button primary" type="button" disabled={busy || !email} aria-busy={busy} onClick={send}>{busy ? "Queueing…" : "Send invitation"}</button>
      </div>
      <p className="note" role="status">{message}</p>
      <div className="admin-table">
        {invites.map((invite) => (
          <div className="admin-row" key={invite.id}>
            <span>{invite.email ?? invite.id.slice(0, 8)}</span>
            <span>{invite.status}</span>
            <span>Expires {new Date(invite.expiresAt).toLocaleDateString()}</span>
          </div>
        ))}
        {invites.length === 0 && <p className="note">No invitations yet.</p>}
      </div>
    </>
  );
}

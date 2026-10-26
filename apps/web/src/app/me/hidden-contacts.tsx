"use client";

import { useEffect, useState } from "react";

export default function HiddenContacts() {
  const [email, setEmail] = useState("");
  const [count, setCount] = useState(0);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const response = await fetch("/api/v1/me/hidden-contacts", { cache: "no-store" });
    if (!response.ok) throw new Error("Hidden contacts could not be loaded.");
    const result = await response.json() as { count: number };
    setCount(result.count);
  }

  useEffect(() => {
    void refresh().catch(() => setMessage("Hidden contacts could not be loaded."));
  }, []);

  async function update(action: "hide" | "remove") {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/v1/me/hidden-contacts", {
        method: action === "hide" ? "POST" : "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email })
      });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message ?? "The hidden-contact list could not be updated.");
      setEmail("");
      await refresh();
      setMessage(action === "hide"
        ? "That contact will not be paired with you."
        : "The contact was removed from your hidden list.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The hidden-contact list could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="member-settings">
      <h2>People you know</h2>
      <p className="note">Hide someone by email to prevent a match if they join. Velum stores a one-way private fingerprint, not the address. Hidden contacts: {count}.</p>
      <label className="hidden-contact-input">Email address<input type="email" autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <div className="member-actions">
        <button className="button secondary" type="button" disabled={busy || !email} aria-busy={busy} onClick={() => void update("hide")}>Hide contact</button>
        <button className="text-button" type="button" disabled={busy || !email} aria-busy={busy} onClick={() => void update("remove")}>Remove contact</button>
      </div>
      {message && <p className="note" role="status">{message}</p>}
    </section>
  );
}

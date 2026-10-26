"use client";

import { startRegistration } from "@simplewebauthn/browser";
import { useEffect, useState } from "react";

interface RegistrationPayload {
  challengeId: string;
  options: Parameters<typeof startRegistration>[0]["optionsJSON"];
}

export default function RegistrationFlow({ params }: { params: Promise<{ token: string }> }) {
  const [token, setToken] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("This invitation is private and bound to its recipient.");

  useEffect(() => {
    let active = true;
    void params.then(({ token: inviteToken }) => {
      window.history.replaceState(null, "", "/invite");
      if (active) setToken(inviteToken);
    });
    return () => { active = false; };
  }, [params]);

  async function register() {
    if (!token) return;
    setBusy(true);
    setMessage("Preparing a secure passkey…");
    try {
      const optionsResponse = await fetch("/api/v1/auth/register/options", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
        cache: "no-store"
      });
      const payload: unknown = await optionsResponse.json();
      if (!optionsResponse.ok || typeof payload !== "object" || payload === null || !("options" in payload) || !("challengeId" in payload)) {
        setMessage("This invitation could not be used. Check the private link and try again.");
        return;
      }
      const registration = payload as RegistrationPayload;
      const response = await startRegistration({ optionsJSON: registration.options });
      const verifyResponse = await fetch("/api/v1/auth/register/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ challengeId: registration.challengeId, token, response }),
        cache: "no-store"
      });
      const result: unknown = await verifyResponse.json();
      if (typeof result === "object" && result !== null && "recoveryCodes" in result && Array.isArray(result.recoveryCodes)) {
        setToken(null);
        setCodes(result.recoveryCodes.filter((code): code is string => typeof code === "string"));
        setMessage("Save each recovery code somewhere private. Each code works once.");
        return;
      }
      setMessage("This invitation could not be used. Check the private link and try again.");
    } catch {
      setMessage("Passkey setup did not complete. You can try again on this device.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmSaved() {
    if (!saved) return;
    setBusy(true);
    try {
      const response = await fetch("/api/v1/auth/recovery/confirm", { method: "POST" });
      if (!response.ok) throw new Error("Recovery confirmation failed");
      window.location.assign("/onboarding");
    } catch {
      setMessage("We could not confirm your recovery codes. Keep this page open and try again.");
      setBusy(false);
    }
  }

  return (
    <section className="invite-card">
      <div className="eyebrow">PRIVATE INVITATION</div>
      <h1>{codes.length > 0 ? <>Keep your account<br />within reach.</> : <>Your next chapter<br />starts quietly.</>}</h1>
      <p className="lede" role="status">{message}</p>
      {codes.length === 0 ? (
        <button className="button primary" type="button" onClick={register} disabled={!token || busy} aria-busy={busy}>
          {busy ? "Preparing…" : "Create a passkey"} <span aria-hidden="true">↗</span>
        </button>
      ) : (
        <>
          <div className="recovery-codes" aria-label="One-time recovery codes">
            {codes.map((code) => <code key={code}>{code}</code>)}
          </div>
          <label className="check-row">
            <input type="checkbox" checked={saved} onChange={(event) => setSaved(event.target.checked)} />
            <span>I saved these codes somewhere private.</span>
          </label>
          <button className="button primary" type="button" onClick={confirmSaved} disabled={!saved || busy} aria-busy={busy}>
            Continue securely <span aria-hidden="true">↗</span>
          </button>
        </>
      )}
      <p className="note">Your invitation is bound to the email address it was sent to. No member details are revealed before mutual consent.</p>
    </section>
  );
}

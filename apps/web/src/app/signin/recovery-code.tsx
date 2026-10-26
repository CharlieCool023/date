"use client";

import { useState } from "react";

export default function RecoveryCodeForm() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function recover() {
    setBusy(true);
    try {
      const response = await fetch("/api/v1/auth/recovery/code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, code })
      });
      if (response.ok && response.status !== 202) {
        window.location.assign("/recovery");
        return;
      }
      setMessage("If your details were valid, sign-in can continue. If they were not, check your recovery email or contact support.");
    } catch {
      setMessage("Recovery is temporarily unavailable. Try again shortly.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="recovery-details">
      <summary>Use a one-time recovery code</summary>
      <label>Email address<input type="email" value={email} autoComplete="email" onChange={(event) => setEmail(event.target.value)} /></label>
      <label>Recovery code<input value={code} autoComplete="one-time-code" onChange={(event) => setCode(event.target.value)} /></label>
      <button className="button secondary" type="button" disabled={busy || !email || !code} aria-busy={busy} onClick={recover}>Continue securely</button>
      <p className="note" role="status">{message}</p>
      <EmailRecoveryForm />
    </details>
  );
}

function EmailRecoveryForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function requestRecovery() {
    setBusy(true);
    try {
      await fetch("/api/v1/auth/recovery/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email })
      });
      setMessage("If an eligible account matches, recovery instructions will be sent after a security delay.");
    } catch {
      setMessage("If an eligible account matches, recovery instructions will be sent after a security delay.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="recovery-email">
      <label>Lost access to your passkey and codes?<input type="email" value={email} autoComplete="email" onChange={(event) => setEmail(event.target.value)} /></label>
      <button className="button secondary" type="button" disabled={busy || !email} aria-busy={busy} onClick={requestRecovery}>Request delayed recovery</button>
      <p className="note" role="status">{message}</p>
    </div>
  );
}

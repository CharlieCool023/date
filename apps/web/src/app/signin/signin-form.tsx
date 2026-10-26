"use client";

import { startAuthentication } from "@simplewebauthn/browser";
import { useState } from "react";

interface AuthenticationPayload {
  challengeId: string;
  options: Parameters<typeof startAuthentication>[0]["optionsJSON"];
}

export default function SignInForm() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function signIn() {
    setBusy(true);
    setMessage("");
    try {
      const optionsResponse = await fetch("/api/v1/auth/login/options", { method: "POST", cache: "no-store" });
      const payload = await optionsResponse.json() as AuthenticationPayload;
      if (!optionsResponse.ok || !payload.options || !payload.challengeId) throw new Error("Sign in is temporarily unavailable.");
      const response = await startAuthentication({ optionsJSON: payload.options });
      const verify = await fetch("/api/v1/auth/login/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ challengeId: payload.challengeId, response }),
        cache: "no-store"
      });
      if (!verify.ok) throw new Error("If your passkey is registered, continue to sign in.");
      window.location.assign("/me");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sign in did not complete.");
      setBusy(false);
    }
  }

  return (
    <>
      <button className="button primary" type="button" onClick={signIn} disabled={busy} aria-busy={busy}>
        {busy ? "Waiting for passkey…" : "Continue with passkey"} <span aria-hidden="true">↗</span>
      </button>
      <p className="note" role="status">{message}</p>
    </>
  );
}

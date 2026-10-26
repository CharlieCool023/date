"use client";

import { startRegistration } from "@simplewebauthn/browser";
import { useState } from "react";

interface RegistrationPayload {
  challengeId: string;
  options: Parameters<typeof startRegistration>[0]["optionsJSON"];
}

export default function RecoveryPasskey({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function recover() {
    setBusy(true);
    setMessage("");
    try {
      const optionsResponse = await fetch("/api/v1/auth/recovery/email/options", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
        cache: "no-store"
      });
      const payload = await optionsResponse.json() as RegistrationPayload;
      if (!optionsResponse.ok || !payload.options || !payload.challengeId) throw new Error("This recovery link is expired or not ready yet.");
      const response = await startRegistration({ optionsJSON: payload.options });
      const verify = await fetch("/api/v1/auth/recovery/email/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, challengeId: payload.challengeId, response }),
        cache: "no-store"
      });
      if (!verify.ok) throw new Error("This recovery link is invalid or expired. Request a new recovery link.");
      window.location.assign("/recovery");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Recovery could not be completed.");
      setBusy(false);
    }
  }
  return (
    <>
      <button className="button primary" type="button" disabled={busy} aria-busy={busy} onClick={recover}>
        {busy ? "Waiting for passkey…" : "Register new passkey"} <span aria-hidden="true">↗</span>
      </button>
      <p className="note" role="status">{message}</p>
    </>
  );
}

"use client";

import { useState } from "react";

export default function RecoveryCodeSetup() {
  const [codes, setCodes] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    try {
      const response = await fetch("/api/v1/auth/recovery/rotate", { method: "POST" });
      const body: unknown = await response.json();
      if (!response.ok || typeof body !== "object" || body === null || !("recoveryCodes" in body) || !Array.isArray(body.recoveryCodes)) {
        throw new Error("Recovery codes could not be created. Sign in again and retry.");
      }
      setCodes(body.recoveryCodes.filter((code): code is string => typeof code === "string"));
      setMessage("Save each code somewhere private. This is the only time the codes are shown.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Recovery codes could not be created.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setBusy(true);
    try {
      const response = await fetch("/api/v1/auth/recovery/confirm", { method: "POST" });
      if (!response.ok) throw new Error("We could not confirm your saved codes.");
      const result = await response.json() as { next?: string };
      window.location.assign(result.next === "/me" ? "/me" : "/onboarding");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Confirmation failed.");
      setBusy(false);
    }
  }

  return (
    <>
      <p className="note" role="status">{message}</p>
      {codes.length === 0 ? (
        <button className="button primary" type="button" disabled={busy} aria-busy={busy} onClick={create}>Create recovery codes</button>
      ) : (
        <>
          <div className="recovery-codes">{codes.map((code) => <code key={code}>{code}</code>)}</div>
          <label className="check-row">
            <input type="checkbox" checked={saved} onChange={(event) => setSaved(event.target.checked)} />
            <span>I saved these codes somewhere private.</span>
          </label>
          <button className="button primary" type="button" disabled={busy || !saved} aria-busy={busy} onClick={confirm}>Confirm and continue</button>
        </>
      )}
    </>
  );
}

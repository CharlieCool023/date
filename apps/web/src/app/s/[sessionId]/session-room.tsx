"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Spinner } from "@/components/loaders";

interface RoomMessage {
  alias: string;
  body: string;
  sentAt: string;
}

interface RoomEvent {
  type: string;
  alias?: string;
  body?: string;
  sentAt?: string;
  remainingSeconds?: number;
  status?: string;
  message?: string;
}

export default function SessionRoom({ sessionId }: { sessionId: string }) {
  const [state, setState] = useState("connecting");
  const [alias, setAlias] = useState("You");
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState("");
  const [reportReason, setReportReason] = useState("harassment");
  const [includeEvidence, setIncludeEvidence] = useState(false);
  const socket = useRef<WebSocket | null>(null);
  const holdTimer = useRef<number | null>(null);
  const held = useRef(false);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_REALTIME_URL;
    if (!url) {
      setState("unavailable");
      setNotice("The private room service is not configured.");
      return;
    }
    const connection = new WebSocket(url);
    socket.current = connection;
    connection.addEventListener("open", () => {
      connection.send(JSON.stringify({ type: "join", sessionId }));
    });
    connection.addEventListener("message", (event: MessageEvent<string>) => {
      try {
        const data: unknown = JSON.parse(event.data);
        if (typeof data !== "object" || data === null || !("type" in data) || typeof data.type !== "string") return;
        const message = data as RoomEvent;
        if (message.type === "state") {
          setState(message.status ?? "lobby");
          if (message.alias) setAlias(message.alias);
        } else if (message.type === "message" && typeof message.body === "string" && typeof message.alias === "string") {
          setMessages((current) => [...current, {
            body: message.body!,
            alias: message.alias!,
            sentAt: message.sentAt ?? new Date().toISOString()
          }].slice(-100));
        } else if (message.type === "tick" && typeof message.remainingSeconds === "number") {
          setRemaining(message.remainingSeconds);
        } else if (message.type === "unveiled") {
          setState("unveiled");
        } else if (message.type === "ended") {
          setState("ended");
        } else if (message.type === "error" && message.message) {
          setNotice(message.message);
        } else if (message.type === "report_received") {
          setNotice("Your report was received.");
        }
      } catch {
        setNotice("The room sent an unreadable update. Reconnect to continue.");
      }
    });
    connection.addEventListener("close", () => {
      setState((current) => ["ended", "unveiled"].includes(current) ? current : "disconnected");
    });
    connection.addEventListener("error", () => setNotice("The room connection was interrupted."));
    return () => {
      if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
      connection.close();
      socket.current = null;
    };
  }, [sessionId]);

  function sendMessage() {
    const body = draft.trim();
    if (!body || socket.current?.readyState !== WebSocket.OPEN) return;
    socket.current.send(JSON.stringify({ type: "message", body }));
    setDraft("");
  }

  function startHold() {
    if (state !== "live" || remaining === null || remaining > 180 || held.current) return;
    held.current = true;
    holdTimer.current = window.setTimeout(() => {
      socket.current?.send(JSON.stringify({ type: "unveil_confirm" }));
      setNotice("Your choice is private until there is a mutual unveil.");
      holdTimer.current = null;
    }, 3000);
  }

  function endHold() {
    held.current = false;
    if (holdTimer.current !== null) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }

  function submitReport() {
    socket.current?.send(JSON.stringify({
      type: "report",
      reason: reportReason,
      includeEvidence
    }));
  }

  const minutes = remaining === null ? "--" : String(Math.floor(remaining / 60)).padStart(2, "0");
  const seconds = remaining === null ? "--" : String(remaining % 60).padStart(2, "0");

  if (state === "unveiled") {
    return (
      <section className="invite-card">
        <div className="eyebrow">MUTUAL UNVEIL</div>
        <h1>You chose<br />to meet.</h1>
        <p className="lede">You both chose to continue. Your private conversation is ready.</p>
        <Link className="button primary" href="/conversations">Open your conversations <span aria-hidden="true">↗</span></Link>
      </section>
    );
  }

  return (
    <section className="room-card">
      <div className="eyebrow"><span className="signal" aria-hidden="true" /> ANONYMOUS SESSION</div>
      <div className="room-heading">
        <div><h1>{state === "ended" ? <>Session<br />ended.</> : <>The Dark<br />Room.</>}</h1>
          <p className="lede">{(state === "connecting" || state === "lobby") && <Spinner />}{state === "live" ? `You are ${alias}. Keep it anonymous until you both unveil.` : state === "ended" ? "Session ended." : state === "lobby" ? "Your room is ready. The session begins when both people arrive." : state === "connecting" ? "Connecting to your private room…" : "Waiting for the private room service."}</p>
        </div>
        <div className="room-timer" aria-label={remaining === null ? "Timer starts when both participants arrive" : `${minutes} minutes ${seconds} seconds remaining`}>
          <span>{minutes}:{seconds}</span><small>REMAINING</small>
        </div>
      </div>
      {notice && <p className="notice" role="status">{notice}</p>}
      <div className="room-messages" aria-live="polite" aria-label="Session messages">
        {messages.map((message, index) => (
          <article className="room-message" key={`${message.sentAt}-${index}`}>
            <span>{message.alias}</span>
            <p>{message.body}</p>
          </article>
        ))}
        {messages.length === 0 && state === "live" && <p className="room-empty">No messages yet. Begin whenever you are ready.</p>}
      </div>
      {state === "live" && (
        <>
          <div className="room-compose">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={2000}
              aria-label="Write an anonymous message"
              placeholder="Write something thoughtful…"
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                  event.preventDefault();
                  sendMessage();
                }
              }}
            />
            <button className="button secondary" type="button" onClick={sendMessage} disabled={!draft.trim()}>Send</button>
          </div>
          <p className="note">Keep phone numbers, email addresses, links, and handles private. Your messages are ephemeral.</p>
          {remaining !== null && remaining <= 180 && remaining > 0 && (
            <button
              className="button unveil-button"
              type="button"
              onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); startHold(); }}
              onPointerUp={endHold}
              onPointerCancel={endHold}
              onKeyDown={(event) => {
                if (event.code === "Space") {
                  event.preventDefault();
                  startHold();
                }
              }}
              onKeyUp={(event) => {
                if (event.code === "Space") {
                  event.preventDefault();
                  endHold();
                }
              }}
              onBlur={endHold}
            >
              Press and hold for 3 seconds to unveil
            </button>
          )}
          <div className="report-controls">
            <label>Report a safety concern
              <select value={reportReason} onChange={(event) => setReportReason(event.target.value)}>
                <option value="harassment">Harassment</option>
                <option value="sexual_content">Sexual content</option>
                <option value="identity_leak">Identifying information</option>
                <option value="underage">Underage concern</option>
                <option value="threats">Threats</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="check-row"><input type="checkbox" checked={includeEvidence} onChange={(event) => setIncludeEvidence(event.target.checked)} /><span>Include an encrypted snapshot of the last messages for moderators.</span></label>
            <button className="button secondary" type="button" onClick={submitReport}>Submit report</button>
            <button className="text-button" type="button" onClick={() => socket.current?.send(JSON.stringify({ type: "leave" }))}>Leave session</button>
          </div>
        </>
      )}
      {state === "ended" && <Link className="button secondary" href="/me">Return to your quiet space</Link>}
      {state === "disconnected" && <button className="button secondary" type="button" onClick={() => window.location.reload()}>Reconnect</button>}
    </section>
  );
}

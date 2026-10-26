"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

interface Message {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
}

export default function ConversationChat({ conversationId }: { conversationId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/v1/conversations/${conversationId}/messages`, { cache: "no-store" });
    if (response.status === 401) {
      window.location.assign("/signin");
      return;
    }
    if (!response.ok) throw new Error("This conversation is not available.");
    const result = await response.json() as { messages: Message[] };
    setMessages(result.messages);
  }, [conversationId]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        await refresh();
        if (active) setNotice("");
      } catch {
        if (active) setNotice("This conversation is unavailable or has ended.");
      }
    };
    void load();
    const timer = window.setInterval(() => { void load(); }, 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [refresh]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim() || busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/v1/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body })
      });
      if (!response.ok) throw new Error("Message could not be sent.");
      setBody("");
      await refresh();
      setNotice("");
    } catch {
      setNotice("Message could not be sent. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="chat-messages" aria-live="polite">
        {messages.map((message) => (
          <article className="chat-message" key={message.id}>
            <p>{message.body}</p><small>{new Date(message.createdAt).toLocaleString()}</small>
          </article>
        ))}
        {!messages.length && !notice && <p className="note">Start with a thoughtful hello.</p>}
      </div>
      <form className="chat-compose" onSubmit={send}>
        <label>Message<textarea maxLength={4000} value={body} onChange={(event) => setBody(event.target.value)} required /></label>
        <button className="button primary" disabled={busy || !body.trim()} aria-busy={busy}>{busy ? "Sending…" : "Send message"}</button>
      </form>
      {notice && <p className="note" role="status">{notice}</p>}
    </>
  );
}

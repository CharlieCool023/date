"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Skeleton } from "@/components/loaders";

interface Conversation {
  id: string;
  sessionId: string;
  createdAt: string;
}

export default function ConversationList() {
  const [items, setItems] = useState<Conversation[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void fetch("/api/v1/conversations", { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) {
          window.location.assign("/signin");
          return null;
        }
        if (!response.ok) throw new Error("Conversations are temporarily unavailable.");
        return await response.json() as { conversations: Conversation[] };
      })
      .then((body) => {
        if (!active || !body) return;
        setLoaded(true);
        setItems(body.conversations);
        setMessage(body.conversations.length ? "" : "No mutual reveals yet. We’ll let you know when one is ready.");
      })
      .catch(() => {
        if (!active) return;
        setLoaded(true);
        setMessage("Conversations are temporarily unavailable.");
      });
    return () => { active = false; };
  }, []);

  return (
    <div className="conversation-list">
      {!loaded && <Skeleton lines={3} label="Gathering your conversations" />}
      {items.map((conversation) => (
        <article className="session-item" key={conversation.id}>
          <div><span className="eyebrow">PRIVATE CONVERSATION</span><p>Started {new Date(conversation.createdAt).toLocaleDateString()}</p></div>
          <Link className="button secondary" href={`/conversations/${conversation.id}`}>Open</Link>
        </article>
      ))}
      {message && <p className="note" role="status">{message}</p>}
    </div>
  );
}

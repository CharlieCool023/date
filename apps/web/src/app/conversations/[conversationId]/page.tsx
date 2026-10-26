import Link from "next/link";
import ConversationChat from "./conversation-chat";

export default async function ConversationPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params;
  return (
    <main className="shell compact">
      <header className="topbar"><Link className="wordmark" href="/conversations">VELUM</Link></header>
      <section className="invite-card">
        <div className="eyebrow">PRIVATE CONVERSATION</div>
        <h1>Keep getting<br />to know them.</h1>
        <p className="lede">Messages are encrypted at rest and visible only to this conversation.</p>
        <ConversationChat conversationId={conversationId} />
      </section>
      <footer><span>VELUM</span><span>Private by design. Human by choice.</span></footer>
    </main>
  );
}

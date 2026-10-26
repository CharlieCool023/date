import Link from "next/link";
import ConversationList from "./conversation-list";

export default function ConversationsPage() {
  return (
    <main className="shell">
      <header className="topbar"><Link className="wordmark" href="/me">VELUM</Link><Link className="topnote" href="/me">YOUR SPACE</Link></header>
      <section className="member-home">
        <div className="eyebrow">MUTUAL UNVEIL</div>
        <h1>Conversations.</h1>
        <p className="lede">Only connections you both chose to reveal appear here.</p>
        <ConversationList />
      </section>
      <footer><span>VELUM</span><span>Private by design. Human by choice.</span></footer>
    </main>
  );
}

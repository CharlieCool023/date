import Link from "next/link";
import SessionRoom from "./session-room";

export default async function SessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return (
    <main className="shell compact">
      <header className="topbar"><Link className="wordmark" href="/me">VELUM</Link></header>
      <SessionRoom sessionId={sessionId} />
      <footer><span>VELUM</span><span>Private by design. Human by choice.</span></footer>
    </main>
  );
}

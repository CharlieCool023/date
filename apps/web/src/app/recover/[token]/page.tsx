import Link from "next/link";
import RecoveryPasskey from "./recovery-passkey";

export default async function RecoveryLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <main className="shell compact">
      <header className="topbar"><Link className="wordmark" href="/">VELUM</Link></header>
      <section className="invite-card">
        <div className="eyebrow">SECURE ACCOUNT RECOVERY</div>
        <h1>Register a<br />new passkey.</h1>
        <p className="lede">This private recovery link is single-use and expires. Add a passkey on a device you trust.</p>
        <RecoveryPasskey token={token} />
      </section>
      <footer><span>VELUM</span><span>Private by design. Human by choice.</span></footer>
    </main>
  );
}

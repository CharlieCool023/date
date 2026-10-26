import Link from "next/link";
import RecoveryCodeSetup from "./recovery-setup";

export default function RecoveryPage() {
  return (
    <main className="shell compact">
      <header className="topbar"><Link className="wordmark" href="/">VELUM</Link></header>
      <section className="invite-card">
        <div className="eyebrow">ACCOUNT RECOVERY</div>
        <h1>Keep a way<br />back in.</h1>
        <p className="lede">Save ten one-time recovery codes. Each code can be used once if you lose access to a passkey.</p>
        <RecoveryCodeSetup />
      </section>
      <footer><span>VELUM</span><span>Private by design. Human by choice.</span></footer>
    </main>
  );
}


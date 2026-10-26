import Link from "next/link";

export default function InvitePage() {
  return (
    <main className="shell compact">
      <header className="topbar"><Link className="wordmark" href="/">VELUM</Link></header>
      <section className="invite-card">
        <div className="eyebrow">PRIVATE INVITATION</div>
        <h1>This invitation<br />is for one person.</h1>
        <p className="lede">Open the private link sent to your email to continue. Your invitation is bound to that address.</p>
        <p className="note">If you already have a link, open it on this device. Unused invitations expire after seven days.</p>
        <Link className="button secondary" href="/">Back to Velum</Link>
      </section>
      <footer><span>VELUM</span><span>Private by design. Human by choice.</span></footer>
    </main>
  );
}


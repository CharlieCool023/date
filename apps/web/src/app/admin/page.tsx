import Link from "next/link";
import AdminDashboard from "./admin-dashboard";

export default function AdminPage() {
  return (
    <main className="shell">
      <header className="topbar"><Link className="wordmark" href="/me">VELUM</Link><Link className="topnote" href="/me">YOUR SPACE</Link></header>
      <section className="member-home">
        <div className="eyebrow">TRUST & SAFETY</div>
        <h1>Review queue.</h1>
        <p className="lede">Handle sensitive member material only for a specific review decision. Access is audited.</p>
        <AdminDashboard />
      </section>
      <footer><span>VELUM</span><span>Private by design. Human by choice.</span></footer>
    </main>
  );
}

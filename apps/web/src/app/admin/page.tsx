import Link from "next/link";
import MemberNav from "@/components/member-nav";
import AdminDashboard from "./admin-dashboard";

export default function AdminPage() {
  return (
    <main className="shell">
      <header className="topbar"><Link className="wordmark" href="/me">VELUM</Link><MemberNav admin /></header>
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

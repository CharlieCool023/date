import Link from "next/link";
import MemberNav from "@/components/member-nav";
import Team from "./team";

export default function TeamPage() {
  return <main className="shell">
    <header className="topbar"><Link className="wordmark" href="/me">VELUM</Link><MemberNav admin /></header>
    <section className="member-home">
      <div className="eyebrow">TRUST & SAFETY</div>
      <h1>Team access.</h1>
      <p className="lede">Manage who can review sensitive member material.</p>
      <Team />
    </section>
    <footer><span>VELUM</span><span>Private by design. Human by choice.</span></footer>
  </main>;
}

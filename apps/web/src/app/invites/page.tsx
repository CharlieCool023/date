import Link from "next/link";
import MemberNav from "@/components/member-nav";
import InviteManager from "./invite-manager";

export default function InvitesPage() {
  return (
    <main className="shell compact">
      <header className="topbar"><Link className="wordmark" href="/me">VELUM</Link><MemberNav /></header>
      <section className="invite-card">
        <div className="eyebrow">YOUR INVITATIONS</div>
        <h1>Invite with<br />intention.</h1>
        <p className="lede">Invitations are private, bound to an email address, and expire after seven days.</p>
        <InviteManager />
      </section>
      <footer><span>VELUM</span><span>Private by design. Human by choice.</span></footer>
    </main>
  );
}

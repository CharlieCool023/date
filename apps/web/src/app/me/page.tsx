import Link from "next/link";
import MemberHome from "./member-home";

export default function MemberPage() {
  return (
    <main className="shell">
      <header className="topbar"><Link className="wordmark" href="/">VELUM</Link><Link className="topnote" href="/signin">SIGN OUT</Link></header>
      <MemberHome />
      <footer><span>VELUM</span><span>Private by design. Human by choice.</span></footer>
    </main>
  );
}


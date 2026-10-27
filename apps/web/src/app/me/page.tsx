import Link from "next/link";
import MemberNav from "@/components/member-nav";
import MemberHome from "./member-home";

export default function MemberPage() {
  return (
    <main className="shell">
      <header className="topbar"><Link className="wordmark" href="/">VELUM</Link><MemberNav /></header>
      <MemberHome />
      <footer><span>VELUM</span><span>Private by design. Human by choice.</span></footer>
    </main>
  );
}

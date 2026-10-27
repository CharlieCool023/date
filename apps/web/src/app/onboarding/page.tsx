import Link from "next/link";
import MemberNav from "@/components/member-nav";
import OnboardingForm from "./onboarding-form";

export default function OnboardingPage() {
  return (
    <main className="shell compact">
      <header className="topbar"><Link className="wordmark" href="/me">VELUM</Link><MemberNav /></header>
      <section className="invite-card onboarding-card">
        <div className="eyebrow">YOUR PRIVATE SPACE</div>
        <h1>Build a profile<br />that feels like you.</h1>
        <p className="lede">A few thoughtful steps, then we’ll find a conversation worth your time.</p>
        <OnboardingForm />
      </section>
      <footer><span>VELUM</span><span>Private by design. Human by choice.</span></footer>
    </main>
  );
}

import Link from "next/link";
import SignInForm from "./signin-form";
import RecoveryCodeForm from "./recovery-code";

export default function SignInPage() {
  return (
    <main className="shell compact">
      <header className="topbar"><Link className="wordmark" href="/">VELUM</Link></header>
      <section className="invite-card">
        <div className="eyebrow">MEMBER SIGN IN</div>
        <h1>Welcome<br />back.</h1>
        <p className="lede">Use a passkey you previously registered. Velum never asks for a password.</p>
        <SignInForm />
        <RecoveryCodeForm />
      </section>
      <footer><span>VELUM</span><span>Private by design. Human by choice.</span></footer>
    </main>
  );
}

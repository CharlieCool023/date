import Link from "next/link";

export default function HomePage() {
  return (
    <main className="shell">
      <header className="topbar">
        <Link className="wordmark" href="/">VELUM</Link>
        <span className="topnote">A quieter way to meet</span>
        <Link className="home-signin" href="/signin">Already a member? Sign in</Link>
      </header>
      <section className="hero">
        <div className="eyebrow"><span className="signal" aria-hidden="true" /> INVITATION ONLY</div>
        <h1>Meet the mind<br />before the image.</h1>
        <p className="lede">A private space for intentional connection. Begin with a conversation; choose together what comes next.</p>
        <div className="actions">
          <Link className="button primary" href="/invite">Open an invitation <span aria-hidden="true">↗</span></Link>
        </div>
        <div className="promise">
          <div><span className="promise-mark" aria-hidden="true" /><span>Anonymous first</span></div>
          <div><span className="promise-mark" aria-hidden="true" /><span>Reveal only by mutual choice</span></div>
          <div><span className="promise-mark" aria-hidden="true" /><span>No browsing or swiping</span></div>
        </div>
      </section>
      <section className="how-it-works" aria-labelledby="how-heading">
        <h2 id="how-heading">A little more intention.<br />A little less pressure.</h2>
        <div className="steps">
          <article className="step-card">
            <span className="step-number">01 / BEGIN</span>
            <h3>Come by invitation</h3>
            <p>Set your boundaries and share what matters to you. Your answers stay private.</p>
          </article>
          <article className="step-card">
            <span className="step-number">02 / CONNECT</span>
            <h3>Talk before you see</h3>
            <p>Meet one thoughtful match in an anonymous room, without profile photos or personal details.</p>
          </article>
          <article className="step-card">
            <span className="step-number">03 / CHOOSE</span>
            <h3>Decide together</h3>
            <p>Only a mutual choice reveals your profiles. If either person declines, the session ends neutrally.</p>
          </article>
        </div>
      </section>
      <aside className="privacy-note">
        <strong>A note on privacy:</strong> Dark Room messages are temporary, but no app can stop someone from capturing their screen. Keep identifying details private until you both choose to share.
      </aside>
      <footer><span>VELUM</span><span>Private by design. Human by choice.</span></footer>
    </main>
  );
}

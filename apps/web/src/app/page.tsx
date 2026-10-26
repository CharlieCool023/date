import Link from "next/link";

export default function HomePage() {
  return (
    <main className="shell">
      <header className="topbar">
        <Link className="wordmark" href="/">VELUM</Link>
        <span className="topnote">A quieter way to meet</span>
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
      <footer><span>VELUM</span><span>Private by design. Human by choice.</span></footer>
    </main>
  );
}


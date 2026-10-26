import RegistrationFlow from "./registration-flow";

export default async function InvitationTokenPage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <main className="shell compact">
      <header className="topbar"><a className="wordmark" href="/">VELUM</a></header>
      <RegistrationFlow params={params} />
      <footer><span>VELUM</span><span>Private by design. Human by choice.</span></footer>
    </main>
  );
}


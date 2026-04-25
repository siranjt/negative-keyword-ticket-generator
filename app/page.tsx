import ZocaLogo from "@/components/ZocaLogo";
import Dashboard from "@/components/Dashboard";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Sticky Nav */}
      <nav className="sticky top-0 z-50 flex h-14 items-center gap-3.5 border-b border-zoca-border bg-zoca-bg-nav px-6 backdrop-blur-md">
        <ZocaLogo />
        <div className="h-6 w-px bg-zoca-border-3" />
        <div>
          <div className="font-[var(--font-montserrat)] text-sm font-extrabold tracking-wide">
            Negative Keyword Alerts
          </div>
          <div className="text-[10px] font-medium text-zoca-text-muted">
            Retention risk monitoring
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="px-6 pb-8 pt-12 text-center">
        <h1
          className="zoca-gradient-text mx-auto mb-3 font-[var(--font-montserrat)] text-[3.5rem] font-black leading-none"
          style={{ letterSpacing: "-0.03em" }}
        >
          <span className="sparkle-word">Keyword Alerts</span>
        </h1>
        <p className="mx-auto mb-4 max-w-xl text-[15px] text-zoca-text-muted">
          Real-time detection of customer dissatisfaction signals from negative keyword monitoring.
          Select alerts and create Linear tickets in one click.
        </p>
        <div className="flex items-center justify-center gap-6 text-xs text-zoca-text-soft">
          <span>✱ Last 24 hours</span>
          <span>✱ Live Metabase data</span>
          <span>✱ One-click ticket creation</span>
        </div>
      </section>

      {/* Dashboard */}
      <main className="mx-auto w-full max-w-[1600px] flex-1 px-6 pb-20">
        <Dashboard />
      </main>

      {/* Footer */}
      <footer className="border-t border-zoca-border py-8 text-center">
        <ZocaLogo className="mx-auto" />
        <p className="mt-2 text-[11px] text-zoca-text-soft">
          Negative Keyword Alerts Dashboard &middot; Powered by Metabase + Linear
        </p>
      </footer>
    </div>
  );
}

import ZocaLogo from "@/components/ZocaLogo";
import Dashboard from "@/components/Dashboard";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* ── Sticky Nav ── */}
      <nav className="sticky top-0 z-50 flex h-14 items-center justify-between border-b border-zoca-border bg-zoca-bg-nav px-6 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <ZocaLogo />
          <span className="text-sm text-zoca-text-muted">·</span>
          <span className="text-sm font-medium text-zoca-text-muted">Negative Keyword Alerts</span>
        </div>
        <div className="flex items-center gap-1 text-sm text-zoca-text-muted">
          <span>Live book · Metabase + Linear</span>
          <span className="mx-2 text-zoca-text-soft">·</span>
          <span>Refresh on demand</span>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="px-6 pb-6 pt-14 text-center">
        {/* Status pill */}
        <div className="mb-8 flex justify-center">
          <div className="inline-flex items-center gap-2 rounded-zoca-pill border border-zoca-border-2 bg-zoca-bg-2/60 px-5 py-2 text-sm text-zoca-text-muted backdrop-blur-sm">
            <span className="pulse-dot inline-block h-2 w-2 rounded-full bg-zoca-ok" />
            Retention risk review · refresh on demand
          </div>
        </div>
        {/* Title */}
        <h1
          className="relative mx-auto mb-5 font-[var(--font-gothic)] text-[4.75rem] font-black leading-[0.95] tracking-[-0.03em]"
        >
          <span className="text-white">Keyword </span>
          <span className="zoca-gradient-text">Alerts</span>
          <span className="absolute -right-2 -top-2 text-3xl text-zoca-pink-2">✦</span>
        </h1>
        {/* Description */}
        <p className="mx-auto mb-5 max-w-2xl text-base leading-relaxed text-zoca-text-muted">
          Which customers are upset, where dissatisfaction was flagged, and which
          accounts need AM attention — surfaced from negative keyword monitoring
          across chat, email, and SMS.
        </p>
        {/* Quick facts */}
        <div className="flex items-center justify-center gap-6 text-sm text-zoca-text-muted">
          <span>✱ Last 24 hours</span>
          <span>✱ Live Metabase data</span>
          <span>✱ One-click ticket creation</span>
        </div>
      </section>

      {/* ── Dashboard ── */}
      <main className="mx-auto w-full max-w-[1440px] flex-1 px-6 pb-20">
        <Dashboard />
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-zoca-border py-8 text-center">
        <ZocaLogo className="mx-auto" />
        <p className="mt-2 text-xs text-zoca-text-soft">
          Negative Keyword Alerts · Powered by Metabase + Linear
        </p>
      </footer>
    </div>
  );
}

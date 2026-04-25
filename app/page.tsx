import ZocaLogo from "@/components/ZocaLogo";
import Dashboard from "@/components/Dashboard";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* ── Sticky Nav ── */}
      <nav className="sticky top-0 z-50 flex h-14 items-center justify-between border-b border-[rgba(200,202,254,0.10)] bg-[rgba(10,4,34,0.7)] px-6 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <ZocaLogo />
          <span className="text-sm text-[#c8cafe]">·</span>
          <span className="text-sm font-medium text-[#c8cafe]">Negative Keyword Alert</span>
        </div>
        <div className="flex items-center gap-1 text-sm text-[#c8cafe]">
          <span>Live book · Metabase + Linear</span>
          <span className="mx-2 text-[rgba(243,237,253,0.55)]">·</span>
          <span>Refresh on demand</span>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="px-6 pb-6 pt-12 text-center">
        <div className="mb-7 flex justify-center">
          <div className="inline-flex items-center gap-2 rounded-[9999px] border border-[rgba(200,202,254,0.18)] bg-[#1f0843]/60 px-5 py-2.5 text-sm text-[#c8cafe] backdrop-blur-sm">
            <span className="pulse-dot inline-block h-2 w-2 rounded-full bg-[#4ade80]" />
            Retention risk review · refresh on demand
          </div>
        </div>
        <h1 className="relative mx-auto mb-5 inline-block font-[var(--font-display)] font-black" style={{ fontSize: "4.75rem", letterSpacing: "-0.04em", lineHeight: "0.92" }}>
          <span className="text-white">Negative Keyword </span>
          <span style={{ background: "linear-gradient(135deg, #ff86e1 0%, #ffa8cd 30%, #e5ccff 70%, #c8cafe 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Alert</span>
          <span className="absolute" style={{ right: "-16px", top: "-10px", fontSize: "24px", color: "#ff86e1", WebkitTextFillColor: "#ff86e1" }}>✦</span>
        </h1>
        <p className="mx-auto mb-5 max-w-2xl text-base leading-relaxed text-[#c8cafe]">
          Which customers are upset, where dissatisfaction was flagged, and which
          accounts need AM attention — surfaced from negative keyword monitoring
          across chat, email, and SMS.
        </p>
        <div className="flex items-center justify-center gap-6 text-sm text-[#c8cafe]">
          <span>✱ Last 7 days</span>
          <span>✱ Live Metabase data</span>
          <span>✱ One-click ticket creation</span>
        </div>
      </section>

      {/* ── Dashboard ── */}
      <main className="mx-auto w-full max-w-[1440px] flex-1 px-6 pb-20">
        <Dashboard />
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-[rgba(200,202,254,0.10)] py-8 text-center">
        <ZocaLogo className="mx-auto" />
        <p className="mt-2 text-xs text-[rgba(243,237,253,0.55)]">
          Negative Keyword Alert · Powered by Metabase + Linear
        </p>
      </footer>
    </div>
  );
}

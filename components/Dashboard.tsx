"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend,
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend);
if (typeof window !== "undefined") {
  ChartJS.defaults.color = "#c8cafe";
  ChartJS.defaults.borderColor = "rgba(200,202,254,0.12)";
  ChartJS.defaults.font.family = "Inter, system-ui, sans-serif";
}

const Doughnut = dynamic(() => import("react-chartjs-2").then((m) => m.Doughnut), { ssr: false });
const Bar = dynamic(() => import("react-chartjs-2").then((m) => m.Bar), { ssr: false });

interface Alert {
  entity_id: string; message_body: string; subject: string;
  message_date: string; message_time: string; sender: string;
  source: string; business_name: string; am_name: string;
  category: string; analysis: string;
}
interface TicketResult { business: string; ticketId: string; url: string; skipped: boolean; error?: string; }

function cls(...p: (string | false | null | undefined)[]) { return p.filter(Boolean).join(" "); }

const CAT_COLORS: Record<string, string> = {
  Cancellation: "#ff4fa8", Billing: "#a855f7", "Lead quality": "#fbbf24",
  Technical: "#60a5fa", Disappointed: "#fb923c", Flagged: "#7868f4",
};
const SRC_COLORS: Record<string, string> = {
  "App Chat": "#ffa8cd", Email: "#7868f4", SMS: "#ff86e1", Phone: "#60a5fa",
};

function fmtDate(d: string) {
  try { return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" }); } catch { return d; }
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <button onClick={onClear} className="inline-flex items-center gap-1.5 rounded-[9999px] border border-[rgba(200,202,254,0.18)] bg-[#24125c]/50 px-3 py-1 text-[10.5px] font-bold text-[#c8cafe] transition hover:border-[#ff4fa8] hover:text-white">
      {label} <span className="text-[#ff4fa8]">✕</span>
    </button>
  );
}

function StatCard({ label, value, sub, color, delay }: { label: string; value: string | number; sub?: string; color?: string; delay: number }) {
  return (
    <div className="zoca-fade-in zoca-gradient-border zoca-glow-hover rounded-[2rem] bg-[#1f0843]/55 px-5 py-4 backdrop-blur-sm" style={{ "--fade-delay": `${delay}s` } as React.CSSProperties}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[rgba(243,237,253,0.55)]">{label}</div>
      <div className="num-hero mt-1.5 text-[26px]" style={{ color: color || "#fff" }}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-[#c8cafe]">{sub}</div>}
    </div>
  );
}

function ChartCard({ title, children, delay }: { title: string; children: React.ReactNode; delay: number }) {
  return (
    <div className="zoca-fade-in zoca-gradient-border rounded-[2rem] bg-[#1f0843]/55 p-5 backdrop-blur-sm" style={{ "--fade-delay": `${delay}s` } as React.CSSProperties}>
      <h3 className="mb-4 text-sm font-bold text-white">{title}</h3>
      {children}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const clickOpts: any = {
  onHover: (event: any, chartElement: any[]) => {
    const target = event?.native?.target as HTMLElement | undefined;
    if (target) target.style.cursor = chartElement.length ? "pointer" : "default";
  },
};

export default function Dashboard() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchedAt, setFetchedAt] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());  // kept for bulk ops if needed later
  const [ticketCreating, setTicketCreating] = useState<Set<string>>(new Set());
  const [ticketCreated, setTicketCreated] = useState<Map<string, string>>(new Map()); // key → ticket ID
  const [filterAM, setFilterAM] = useState("");
  const [filterSource, setFilterSource] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [filterCat, setFilterCat] = useState("");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);
  const [detailAlert, setDetailAlert] = useState<Alert | null>(null);
  const [tab, setTab] = useState<"overview" | "alerts">("overview");

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/alerts");
      const data = await res.json();
      setAlerts(data.alerts || []);
      setFetchedAt(data.fetchedAt || "");
      setSelected(new Set());
    } catch { showToast("Failed to fetch", "err"); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  function showToast(msg: string, type: string) {
    setToast({ msg, type }); setTimeout(() => setToast(null), 5000);
  }

  const aKey = (a: Alert, i: number) => `${a.entity_id}::${i}`;

  /* ── Derived filter options (from ALL alerts, not filtered) ── */
  const ams = useMemo(() => Array.from(new Set(alerts.map((a) => a.am_name))).sort(), [alerts]);
  const sources = useMemo(() => Array.from(new Set(alerts.map((a) => a.source))).sort(), [alerts]);
  const dates = useMemo(() => Array.from(new Set(alerts.map((a) => a.message_date))).sort().reverse(), [alerts]);
  const categories = useMemo(() => Array.from(new Set(alerts.map((a) => a.category))).sort(), [alerts]);

  /* ── Filtered set ── */
  const filtered = useMemo(() => alerts.filter((a) => {
    if (filterAM && a.am_name !== filterAM) return false;
    if (filterSource && a.source !== filterSource) return false;
    if (filterDate && a.message_date !== filterDate) return false;
    if (filterCat && a.category !== filterCat) return false;
    if (search) { const q = search.toLowerCase(); if (!a.business_name.toLowerCase().includes(q) && !a.message_body.toLowerCase().includes(q) && !a.sender.toLowerCase().includes(q)) return false; }
    return true;
  }), [alerts, filterAM, filterSource, filterDate, filterCat, search]);

  /* ── View aggregates (recompute on every filter change) ── */
  const uniqueBiz = useMemo(() => new Set(filtered.map((a) => a.business_name)).size, [filtered]);
  const catCounts = useMemo(() => { const m: Record<string, number> = {}; filtered.forEach((a) => { m[a.category] = (m[a.category] || 0) + 1; }); return m; }, [filtered]);
  const sourceCounts = useMemo(() => { const m: Record<string, number> = {}; filtered.forEach((a) => { m[a.source] = (m[a.source] || 0) + 1; }); return m; }, [filtered]);
  const amCounts = useMemo(() => { const m: Record<string, number> = {}; filtered.forEach((a) => { m[a.am_name] = (m[a.am_name] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 10); }, [filtered]);
  const dailyCounts = useMemo(() => { const m: Record<string, number> = {}; filtered.forEach((a) => { m[a.message_date] = (m[a.message_date] || 0) + 1; }); return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0])); }, [filtered]);

  function toggleRow(key: string) { setSelected((p) => { const n = new Set(p); n.has(key) ? n.delete(key) : n.add(key); return n; }); }
  function toggleAll() { if (selected.size === filtered.length) setSelected(new Set()); else setSelected(new Set(filtered.map((a) => aKey(a, alerts.indexOf(a))))); }
  function resetFilters() { setFilterAM(""); setFilterSource(""); setFilterDate(""); setFilterCat(""); setSearch(""); }

  async function handleCreateTickets() {
    const items = alerts.map((a, i) => ({ ...a, _k: aKey(a, i) })).filter((a) => selected.has(a._k));
    if (!items.length) return;
    setCreating(true);
    try {
      const res = await fetch("/api/create-tickets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ alerts: items.map((a) => ({ entity_id: a.entity_id, business_name: a.business_name, am_name: a.am_name, message_body: a.message_body, source: a.source, message_date: a.message_date, message_time: a.message_time, risk_category: a.category })) }) });
      const data = await res.json();
      if (data.results) {
        const c = data.results.filter((r: TicketResult) => !r.skipped && !r.error).length;
        const s = data.results.filter((r: TicketResult) => r.skipped).length;
        const e = data.results.filter((r: TicketResult) => r.error).length;
        showToast(`${c} created${s ? `, ${s} skipped` : ""}${e ? `, ${e} failed` : ""}`, e ? "err" : "ok");
        setSelected(new Set());
      }
    } catch { showToast("Failed to create tickets", "err"); }
    setCreating(false);
  }

  async function createSingleTicket(a: Alert, key: string) {
    setTicketCreating((p) => new Set(p).add(key));
    try {
      const res = await fetch("/api/create-tickets", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alerts: [{ entity_id: a.entity_id, business_name: a.business_name, am_name: a.am_name, message_body: a.message_body, source: a.source, message_date: a.message_date, message_time: a.message_time, risk_category: a.category }] }),
      });
      const data = await res.json();
      if (data.results?.[0]) {
        const r = data.results[0] as TicketResult;
        if (r.skipped) {
          showToast(`${a.business_name}: skipped — open ticket already exists`, "err");
        } else if (r.error) {
          showToast(`${a.business_name}: ${r.error}`, "err");
        } else {
          setTicketCreated((p) => new Map(p).set(key, r.ticketId));
          showToast(`${r.ticketId} created for ${a.business_name}`, "ok");
        }
      }
    } catch { showToast(`Failed to create ticket for ${a.business_name}`, "err"); }
    setTicketCreating((p) => { const n = new Set(p); n.delete(key); return n; });
  }

  const hasFilters = !!(filterAM || filterSource || filterDate || filterCat || search);
  const inpCls = "h-9 w-full rounded-[9999px] border border-[rgba(200,202,254,0.18)] bg-[#24125c]/50 px-4 text-xs text-white outline-none placeholder:text-[rgba(243,237,253,0.55)] focus:border-[#7868f4]";

  return (
    <>
      {/* ═══ FILTER ROW ═══ */}
      <div className="zoca-fade-in mb-4 rounded-[1.25rem] border border-[rgba(200,202,254,0.18)] bg-[#1f0843]/55 p-3 backdrop-blur-sm" style={{ "--fade-delay": "0.05s" } as React.CSSProperties}>
        <div className="grid grid-cols-1 items-center gap-3 lg:grid-cols-12">
          <input className={cls(inpCls, "lg:col-span-3")} placeholder="Search biz name, sender, message..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className={cls(inpCls, "lg:col-span-2")} value={filterCat} onChange={(e) => setFilterCat(e.target.value)}><option value="">All categories</option>{categories.map((c) => <option key={c} value={c}>{c}</option>)}</select>
          <select className={cls(inpCls, "lg:col-span-2")} value={filterAM} onChange={(e) => setFilterAM(e.target.value)}><option value="">All AMs</option>{ams.map((a) => <option key={a} value={a}>{a}</option>)}</select>
          <select className={cls(inpCls, "lg:col-span-2")} value={filterSource} onChange={(e) => setFilterSource(e.target.value)}><option value="">All sources</option>{sources.map((s) => <option key={s} value={s}>{s}</option>)}</select>
          <select className={cls(inpCls, "lg:col-span-1")} value={filterDate} onChange={(e) => setFilterDate(e.target.value)}><option value="">All days</option>{dates.map((d) => <option key={d} value={d}>{d}</option>)}</select>
          <button onClick={fetchAlerts} disabled={loading} className="flex h-9 items-center justify-center gap-1.5 rounded-[9999px] border border-[#ffa8cd] bg-[#ffa8cd] px-4 text-xs font-bold text-[#0b051d] shadow-[0_4px_14px_rgba(255,168,205,.28)] transition hover:bg-[#f695be] disabled:opacity-50 lg:col-span-2">
            {loading ? <><span className="refresh-spinning inline-block">↻</span> Loading...</> : "↻ Refresh live data"}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[rgba(200,202,254,0.10)] pt-3">
          <span className="text-xs uppercase tracking-wider text-[rgba(243,237,253,0.55)]">
            Showing <span className="font-bold text-[#4ade80]">{filtered.length}</span> / {alerts.length}
            {fetchedAt && <> · last refresh <span className="font-bold text-white">{new Date(fetchedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span> · {new Date(fetchedAt).toISOString().slice(0, 10)}</>}
          </span>
          <div className="flex gap-2">
            <button onClick={() => {/* CSV export */}} className="flex h-8 items-center gap-1.5 rounded-[9999px] border border-[rgba(200,202,254,0.18)] bg-[#24125c]/50 px-4 text-xs font-semibold text-[#c8cafe] transition hover:border-[rgba(200,202,254,0.28)] hover:text-white">↓ CSV</button>
            <button onClick={fetchAlerts} disabled={loading} className="flex h-8 items-center gap-1.5 rounded-[9999px] border border-[#ffa8cd] px-4 text-xs font-bold text-[#ffa8cd] transition hover:bg-[#ffa8cd]/10">↻ Refresh live data</button>
          </div>
        </div>
      </div>

      {/* ═══ FILTER CHIPS ═══ */}
      {hasFilters && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {filterAM && <FilterChip label={`AM: ${filterAM}`} onClear={() => setFilterAM("")} />}
          {filterSource && <FilterChip label={`source: ${filterSource}`} onClear={() => setFilterSource("")} />}
          {filterCat && <FilterChip label={`category: ${filterCat}`} onClear={() => setFilterCat("")} />}
          {filterDate && <FilterChip label={`date: ${filterDate}`} onClear={() => setFilterDate("")} />}
          {search && <FilterChip label={`search: ${search}`} onClear={() => setSearch("")} />}
          <button onClick={resetFilters} className="text-xs font-semibold text-[#ff4fa8] underline hover:text-[#ffa8cd]">reset all</button>
        </div>
      )}

      {/* ═══ TABS ═══ */}
      <div className="mb-5 flex flex-wrap gap-2">
        {([["overview", "Overview"], ["alerts", `All alerts (${filtered.length})`]] as const).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} className={cls(
            "rounded-[9999px] border px-5 py-2 text-sm font-medium transition",
            tab === t ? "border-[#ffa8cd] bg-[rgba(255,168,205,0.10)] text-white" : "border-[rgba(200,202,254,0.18)] bg-[#1f0843]/40 text-[#c8cafe] hover:border-[rgba(200,202,254,0.28)] hover:text-white"
          )}>{label}</button>
        ))}
      </div>

      {loading ? (
        <div className="zoca-gradient-border rounded-[2rem] bg-[#1f0843]/55 py-20 text-center backdrop-blur-sm">
          <span className="refresh-spinning mr-2 inline-block text-xl text-[#7868f4]">↻</span>
          <span className="text-[#c8cafe]">Loading alerts from Metabase...</span>
        </div>
      ) : tab === "overview" ? (
        <>
          {/* ═══ STAT CARDS ═══ */}
          <div className="mb-5 grid grid-cols-2 gap-3.5 lg:grid-cols-6">
            <StatCard label="Total alerts" value={filtered.length} sub={`${uniqueBiz} unique businesses`} delay={0.1} />
            <StatCard label="Cancellation" value={catCounts["Cancellation"] || 0} color="#ff4fa8" sub={`${filtered.length ? (((catCounts["Cancellation"] || 0) / filtered.length) * 100).toFixed(1) : 0}% of total`} delay={0.12} />
            <StatCard label="Billing issues" value={catCounts["Billing"] || 0} color="#a855f7" sub="Refund / charge disputes" delay={0.14} />
            <StatCard label="Lead quality" value={catCounts["Lead quality"] || 0} color="#fbbf24" sub="No bookings / spam leads" delay={0.16} />
            <StatCard label="Technical" value={catCounts["Technical"] || 0} color="#60a5fa" sub="Platform / service issues" delay={0.18} />
            <StatCard label="Tickets created" value={ticketCreated.size} color={ticketCreated.size > 0 ? "#4ade80" : undefined} sub={ticketCreated.size > 0 ? "This session" : "Click Create in table"} delay={0.2} />
          </div>

          {/* ═══ CHARTS ROW 1 ═══ */}
          <div className="mb-5 grid grid-cols-1 gap-3.5 lg:grid-cols-2">
            <ChartCard title="Risk category mix" delay={0.22}>
              <div style={{ height: 220 }}>
                <Doughnut
                  data={{ labels: Object.keys(catCounts), datasets: [{ data: Object.values(catCounts), backgroundColor: Object.keys(catCounts).map((k) => CAT_COLORS[k] || "#7868f4"), borderWidth: 0, hoverOffset: 6 }] }}
                  options={{ responsive: true, maintainAspectRatio: false, cutout: "55%",
                    plugins: { legend: { position: "bottom", labels: { padding: 14, usePointStyle: true, pointStyle: "circle", font: { size: 11 } } } },
                    onClick: (_, elems) => { if (elems[0]) { const cat = Object.keys(catCounts)[elems[0].index]; setFilterCat(cat); setTab("alerts"); } },
                    ...clickOpts,
                  }}
                />
              </div>
            </ChartCard>
            <ChartCard title="Alerts by source" delay={0.26}>
              <div style={{ height: 220 }}>
                <Bar
                  data={{ labels: Object.keys(sourceCounts), datasets: [{ data: Object.values(sourceCounts), backgroundColor: Object.keys(sourceCounts).map((k) => SRC_COLORS[k] || "#7868f4"), borderRadius: 8, borderSkipped: false }] }}
                  options={{ responsive: true, maintainAspectRatio: false, indexAxis: "y" as const,
                    plugins: { legend: { display: false } },
                    scales: { x: { grid: { color: "rgba(200,202,254,0.06)" } }, y: { grid: { display: false } } },
                    onClick: (_, elems) => { if (elems[0]) { setFilterSource(Object.keys(sourceCounts)[elems[0].index]); setTab("alerts"); } },
                    ...clickOpts,
                  }}
                />
              </div>
            </ChartCard>
          </div>

          {/* ═══ CHARTS ROW 2 ═══ */}
          <div className="mb-5 grid grid-cols-1 gap-3.5 lg:grid-cols-2">
            <ChartCard title="Daily alert volume · 7 days" delay={0.3}>
              <div style={{ height: 220 }}>
                <Bar
                  data={{ labels: dailyCounts.map(([d]) => fmtDate(d)), datasets: [{ data: dailyCounts.map(([, c]) => c), backgroundColor: "rgba(255,168,205,0.55)", hoverBackgroundColor: "#ffa8cd", borderRadius: 8, borderSkipped: false }] }}
                  options={{ responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: { x: { grid: { display: false } }, y: { grid: { color: "rgba(200,202,254,0.06)" }, beginAtZero: true } },
                    onClick: (_, elems) => { if (elems[0]) { setFilterDate(dailyCounts[elems[0].index][0]); setTab("alerts"); } },
                    ...clickOpts,
                  }}
                />
              </div>
            </ChartCard>
            <ChartCard title="AM exposure · top 10" delay={0.34}>
              <div style={{ height: 220 }}>
                <Bar
                  data={{ labels: amCounts.map(([n]) => n.split(" ")[0]), datasets: [{ data: amCounts.map(([, c]) => c), backgroundColor: "#7868f4", hoverBackgroundColor: "#a855f7", borderRadius: 8, borderSkipped: false }] }}
                  options={{ responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: { x: { grid: { display: false } }, y: { grid: { color: "rgba(200,202,254,0.06)" }, beginAtZero: true } },
                    onClick: (_, elems) => { if (elems[0]) { setFilterAM(amCounts[elems[0].index][0]); setTab("alerts"); } },
                    ...clickOpts,
                  }}
                />
              </div>
            </ChartCard>
          </div>
        </>
      ) : null}

      {/* ═══ TABLE ═══ */}
      {(tab === "alerts" || (tab === "overview" && !loading && filtered.length > 0)) && (
        <div className={cls("zoca-fade-in zoca-gradient-border overflow-hidden rounded-[2rem]", tab === "overview" && "mt-2")} style={{ "--fade-delay": tab === "alerts" ? "0.08s" : "0.4s" } as React.CSSProperties}>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-gradient-to-b from-[#1f0843] to-[#13063a]">
                  {["Date", "Time", "Source", "Entity ID", "Business Name", "AM Name", "Category", "Subject", "Message", "Analysis", "Ticket"].map((h) => (
                    <th key={h} className="whitespace-nowrap border-b border-[rgba(200,202,254,0.18)] px-2 py-3 text-left text-[9.5px] font-bold uppercase tracking-[0.05em] text-[#c8cafe]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((a, idx) => {
                  const key = aKey(a, alerts.indexOf(a));
                  const cc = CAT_COLORS[a.category] || "#7868f4";
                  const isCreating = ticketCreating.has(key);
                  const createdId = ticketCreated.get(key);
                  return (
                    <tr key={key + idx} className="border-b border-[rgba(200,202,254,0.10)] transition hover:bg-[rgba(120,104,244,.06)]">
                      <td className="whitespace-nowrap px-2 py-2 text-[#c8cafe]">{fmtDate(a.message_date)}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-[rgba(243,237,253,0.55)]">{a.message_time}</td>
                      <td className="px-2 py-2"><span className="inline-block rounded-[9999px] border border-[rgba(200,202,254,0.18)] bg-[#24125c]/50 px-2 py-0.5 text-[10px] font-bold text-[#c8cafe]">{a.source}</span></td>
                      <td className="max-w-[80px] truncate px-2 py-2 font-mono text-[10px] text-[rgba(243,237,253,0.55)]">{a.entity_id.slice(0, 8)}...</td>
                      <td className="px-2 py-2"><button onClick={() => setDetailAlert(a)} className="block max-w-[140px] truncate text-left font-bold text-white hover:text-[#ffa8cd]">{a.business_name}</button></td>
                      <td className="max-w-[90px] truncate px-2 py-2 text-[#c8cafe]">{a.am_name}</td>
                      <td className="px-2 py-2"><span className="inline-block rounded-[9999px] px-2 py-0.5 text-[9px] font-bold uppercase" style={{ background: `${cc}22`, color: cc, border: `1px solid ${cc}55` }}>{a.category}</span></td>
                      <td className="max-w-[120px] truncate px-2 py-2 text-[#c8cafe]">{a.subject || "—"}</td>
                      <td className="max-w-[180px] px-2 py-2"><div className="line-clamp-2 text-[11px] leading-relaxed text-[#c8cafe]">{a.message_body}</div></td>
                      <td className="max-w-[200px] px-2 py-2"><div className="line-clamp-2 text-[11px] leading-relaxed text-[#ffa8cd]/80">{a.analysis}</div></td>
                      <td className="px-2 py-2 text-center">
                        {createdId ? (
                          <a href={`https://linear.app/zoca/issue/${createdId}`} target="_blank" rel="noopener noreferrer" className="inline-block rounded-[9999px] bg-[rgba(74,222,128,0.14)] px-3 py-1 text-[10px] font-bold text-[#4ade80] border border-[rgba(74,222,128,0.35)] hover:bg-[rgba(74,222,128,0.22)] transition">
                            {createdId} ↗
                          </a>
                        ) : (
                          <button
                            onClick={() => createSingleTicket(a, key)}
                            disabled={isCreating}
                            className="inline-flex items-center gap-1 rounded-[9999px] border border-[#ffa8cd] bg-[#ffa8cd]/10 px-3 py-1 text-[10px] font-bold text-[#ffa8cd] transition hover:bg-[#ffa8cd] hover:text-[#0b051d] disabled:opacity-50"
                          >
                            {isCreating ? <><span className="refresh-spinning inline-block text-[10px]">↻</span></> : "Create"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="zoca-gradient-border rounded-[2rem] bg-[#1f0843]/55 py-20 text-center backdrop-blur-sm text-[#c8cafe]">
          {alerts.length === 0 ? "No alerts found in the last 7 days" : "No alerts match your filters"}
        </div>
      )}

      {/* ═══ DETAIL MODAL ═══ */}
      {detailAlert && (
        <div className="modal-overlay" onClick={() => setDetailAlert(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="font-[var(--font-display)] text-xl font-extrabold">{detailAlert.business_name}</h2>
                <p className="mt-1 text-sm text-[#c8cafe]">AM: {detailAlert.am_name} · {detailAlert.source} · {detailAlert.message_date} {detailAlert.message_time}</p>
              </div>
              <button onClick={() => setDetailAlert(null)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-[rgba(200,202,254,0.18)] text-sm text-[#c8cafe] hover:border-[#f87171] hover:bg-[rgba(248,113,113,.15)] hover:text-white">✕</button>
            </div>
            <div className="mb-4 grid grid-cols-3 gap-3">
              {[["Category", (() => { const cc = CAT_COLORS[detailAlert.category] || "#7868f4"; return <span className="mt-1 inline-block rounded-[9999px] px-3 py-1 text-xs font-bold" style={{ background: `${cc}22`, color: cc }}>{detailAlert.category}</span>; })()],
               ["Entity ID", <span key="eid" className="mt-1 block font-mono text-[11px] text-[#c8cafe]">{detailAlert.entity_id}</span>],
               ["Sender", <span key="snd" className="mt-1 block text-[11px] text-[#c8cafe]">{detailAlert.sender}</span>],
              ].map(([label, content], i) => (
                <div key={i} className="rounded-xl border border-[rgba(200,202,254,0.10)] bg-[#0b051d]/60 p-3">
                  <div className="text-[10px] font-bold uppercase text-[rgba(243,237,253,0.55)]">{label as string}</div>
                  {content}
                </div>
              ))}
            </div>
            {detailAlert.subject && (
              <div className="mb-4 rounded-xl border border-[rgba(200,202,254,0.10)] bg-[#0b051d]/60 p-4">
                <div className="mb-1 text-[10px] font-bold uppercase text-[rgba(243,237,253,0.55)]">Subject</div>
                <p className="text-sm text-white">{detailAlert.subject}</p>
              </div>
            )}
            <div className="mb-4 rounded-xl border border-[rgba(200,202,254,0.10)] bg-[#0b051d]/60 p-4">
              <div className="mb-1 text-[10px] font-bold uppercase text-[rgba(243,237,253,0.55)]">Full message</div>
              <p className="text-sm leading-relaxed text-[#c8cafe]">{detailAlert.message_body}</p>
            </div>
            <div className="rounded-xl border border-[rgba(255,168,205,0.2)] bg-[rgba(255,168,205,0.06)] p-4">
              <div className="mb-1 text-[10px] font-bold uppercase text-[#ffa8cd]">AI analysis</div>
              <p className="text-sm leading-relaxed text-white">{detailAlert.analysis}</p>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={cls("fixed bottom-6 right-6 z-50 rounded-[1.25rem] px-5 py-3.5 text-sm font-semibold shadow-lg backdrop-blur-md zoca-fade-in", toast.type === "ok" ? "toast-ok" : "toast-err")}>
          {toast.msg}
        </div>
      )}
    </>
  );
}

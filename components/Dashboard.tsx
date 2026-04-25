"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, ArcElement,
  Tooltip, Legend,
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend);
if (typeof window !== "undefined") {
  ChartJS.defaults.color = "#c8cafe";
  ChartJS.defaults.borderColor = "rgba(200, 202, 254, 0.12)";
  ChartJS.defaults.font.family = "Inter, system-ui, sans-serif";
}

const Doughnut = dynamic(() => import("react-chartjs-2").then((m) => m.Doughnut), { ssr: false });
const Bar = dynamic(() => import("react-chartjs-2").then((m) => m.Bar), { ssr: false });

/* ── Types ── */
interface Alert {
  entity_id: string; message_body: string; subject: string;
  message_date: string; message_time: string; sender: string;
  source: string; business_name: string; am_name: string;
  category: string; analysis: string;
}
interface TicketResult { business: string; ticketId: string; url: string; skipped: boolean; error?: string; }

/* ── Helpers ── */
function cls(...p: (string | false | null | undefined)[]) { return p.filter(Boolean).join(" "); }

const CAT_COLORS: Record<string, string> = {
  Cancellation: "#ff4fa8", Billing: "#a855f7", "Lead quality": "#fbbf24",
  Technical: "#60a5fa", Disappointed: "#fb923c", Flagged: "#7868f4",
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

function HealthStat({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="zoca-gradient-border zoca-glow-hover rounded-[2rem] bg-[#1f0843]/55 px-5 py-4 backdrop-blur-sm">
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[rgba(243,237,253,0.55)]">{label}</div>
      <div className="num-hero mt-1 text-2xl" style={{ color: color || "#fff" }}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-[#c8cafe]">{sub}</div>}
    </div>
  );
}

/* ── Main ── */
export default function Dashboard() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchedAt, setFetchedAt] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
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
    } catch { showToast("Failed to fetch alerts", "err"); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  function showToast(msg: string, type: string) {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 5000);
  }

  const alertKey = (a: Alert, i: number) => `${a.entity_id}::${i}`;

  const filtered = useMemo(() => alerts.filter((a) => {
    if (filterAM && a.am_name !== filterAM) return false;
    if (filterSource && a.source !== filterSource) return false;
    if (filterDate && a.message_date !== filterDate) return false;
    if (filterCat && a.category !== filterCat) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!a.business_name.toLowerCase().includes(q) && !a.message_body.toLowerCase().includes(q) && !a.sender.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [alerts, filterAM, filterSource, filterDate, filterCat, search]);

  const ams = useMemo(() => Array.from(new Set(alerts.map((a) => a.am_name))).sort(), [alerts]);
  const sources = useMemo(() => Array.from(new Set(alerts.map((a) => a.source))).sort(), [alerts]);
  const dates = useMemo(() => Array.from(new Set(alerts.map((a) => a.message_date))).sort().reverse(), [alerts]);
  const categories = useMemo(() => Array.from(new Set(alerts.map((a) => a.category))).sort(), [alerts]);
  const uniqueBiz = useMemo(() => new Set(alerts.map((a) => a.business_name)).size, [alerts]);

  // Chart data
  const catCounts = useMemo(() => {
    const m: Record<string, number> = {};
    filtered.forEach((a) => { m[a.category] = (m[a.category] || 0) + 1; });
    return m;
  }, [filtered]);

  const sourceCounts = useMemo(() => {
    const m: Record<string, number> = {};
    filtered.forEach((a) => { m[a.source] = (m[a.source] || 0) + 1; });
    return m;
  }, [filtered]);

  const amCounts = useMemo(() => {
    const m: Record<string, number> = {};
    filtered.forEach((a) => { m[a.am_name] = (m[a.am_name] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [filtered]);

  const dailyCounts = useMemo(() => {
    const m: Record<string, number> = {};
    filtered.forEach((a) => { m[a.message_date] = (m[a.message_date] || 0) + 1; });
    return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  function toggleRow(key: string) {
    setSelected((p) => { const n = new Set(p); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }
  function toggleAll() {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((a) => alertKey(a, alerts.indexOf(a)))));
  }

  async function handleCreateTickets() {
    const items = alerts.map((a, i) => ({ ...a, _key: alertKey(a, i) })).filter((a) => selected.has(a._key));
    if (!items.length) return;
    setCreating(true);
    try {
      const res = await fetch("/api/create-tickets", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alerts: items.map((a) => ({ entity_id: a.entity_id, business_name: a.business_name, am_name: a.am_name, message_body: a.message_body, source: a.source, message_date: a.message_date, message_time: a.message_time, risk_category: a.category })) }),
      });
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

  const hasFilters = !!(filterAM || filterSource || filterDate || filterCat || search);
  const inputCls = "h-9 w-full rounded-[9999px] border border-[rgba(200,202,254,0.18)] bg-[#24125c]/50 px-4 text-xs text-white outline-none placeholder:text-[rgba(243,237,253,0.55)] focus:border-[#7868f4]";

  return (
    <>
      {/* ══ Filter row ══ */}
      <div className="zoca-fade-in mb-4 rounded-[1.25rem] border border-[rgba(200,202,254,0.18)] bg-[#1f0843]/55 p-3 backdrop-blur-sm" style={{ "--fade-delay": "0.1s" } as React.CSSProperties}>
        <div className="grid grid-cols-1 items-center gap-3 lg:grid-cols-12">
          <input className={cls(inputCls, "lg:col-span-3")} placeholder="Search biz name, sender, message..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className={cls(inputCls, "lg:col-span-2")} value={filterAM} onChange={(e) => setFilterAM(e.target.value)}>
            <option value="">All AMs</option>
            {ams.map((am) => <option key={am} value={am}>{am}</option>)}
          </select>
          <select className={cls(inputCls, "lg:col-span-2")} value={filterSource} onChange={(e) => setFilterSource(e.target.value)}>
            <option value="">All sources</option>
            {sources.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className={cls(inputCls, "lg:col-span-2")} value={filterCat} onChange={(e) => setFilterCat(e.target.value)}>
            <option value="">All categories</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className={cls(inputCls, "lg:col-span-1")} value={filterDate} onChange={(e) => setFilterDate(e.target.value)}>
            <option value="">All days</option>
            {dates.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <button onClick={selected.size > 0 ? handleCreateTickets : fetchAlerts} disabled={creating || loading} className="flex h-9 items-center justify-center gap-1.5 rounded-[9999px] bg-[#ffa8cd] px-4 text-xs font-bold text-[#0b051d] shadow-[0_4px_14px_rgba(255,168,205,.28)] transition hover:bg-[#f695be] disabled:opacity-50 lg:col-span-2">
            {creating ? <><span className="refresh-spinning inline-block">↻</span> Creating...</> : selected.size > 0 ? `Create tickets (${selected.size})` : loading ? <><span className="refresh-spinning inline-block">↻</span> Loading...</> : "↻ Refresh live data"}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[rgba(200,202,254,0.10)] pt-3">
          <span className="text-xs uppercase tracking-wider text-[rgba(243,237,253,0.55)]">
            Showing <span className="font-bold text-[#4ade80]">{filtered.length}</span> / {alerts.length}
            {fetchedAt && <> · refreshed {new Date(fetchedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })} · {new Date(fetchedAt).toISOString().slice(0, 10)}</>}
          </span>
          <span className="text-xs text-[rgba(243,237,253,0.55)]">7-day window</span>
        </div>
      </div>

      {/* ══ Filter chips ══ */}
      {hasFilters && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {filterAM && <FilterChip label={`AM: ${filterAM}`} onClear={() => setFilterAM("")} />}
          {filterSource && <FilterChip label={`source: ${filterSource}`} onClear={() => setFilterSource("")} />}
          {filterCat && <FilterChip label={`category: ${filterCat}`} onClear={() => setFilterCat("")} />}
          {filterDate && <FilterChip label={`date: ${filterDate}`} onClear={() => setFilterDate("")} />}
          {search && <FilterChip label={`search: ${search}`} onClear={() => setSearch("")} />}
          <button onClick={() => { setFilterAM(""); setFilterSource(""); setFilterDate(""); setFilterCat(""); setSearch(""); }} className="text-xs font-semibold text-[#ff4fa8] underline transition hover:text-[#ffa8cd]">reset all</button>
        </div>
      )}

      {/* ══ Tabs ══ */}
      <div className="mb-4 flex flex-wrap gap-2">
        {(["overview", "alerts"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cls(
            "rounded-[9999px] border px-4 py-1.5 text-sm font-medium transition",
            tab === t ? "border-[#ffa8cd] bg-[rgba(255,168,205,0.1)] text-white" : "border-[rgba(200,202,254,0.18)] bg-[#1f0843]/40 text-[#c8cafe] hover:border-[rgba(200,202,254,0.28)] hover:text-white"
          )}>
            {t === "overview" ? "Overview" : `All alerts (${filtered.length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="zoca-gradient-border rounded-[2rem] bg-[#1f0843]/55 py-20 text-center backdrop-blur-sm">
          <span className="refresh-spinning mr-2 inline-block text-xl text-[#7868f4]">↻</span>
          <span className="text-[#c8cafe]">Loading alerts from Metabase...</span>
        </div>
      ) : tab === "overview" ? (
        <>
          {/* ══ Data Health strip ══ */}
          <div className="mb-5 grid grid-cols-2 gap-3.5 lg:grid-cols-6">
            <HealthStat label="Total alerts" value={filtered.length} sub={`${uniqueBiz} unique businesses`} />
            <HealthStat label="Cancellation" value={catCounts["Cancellation"] || 0} color="#ff4fa8" sub={`${filtered.length > 0 ? (((catCounts["Cancellation"] || 0) / filtered.length) * 100).toFixed(1) : 0}% of total`} />
            <HealthStat label="Billing issues" value={catCounts["Billing"] || 0} color="#a855f7" sub="Refund / charge disputes" />
            <HealthStat label="Lead quality" value={catCounts["Lead quality"] || 0} color="#fbbf24" sub="No bookings / spam leads" />
            <HealthStat label="Technical" value={catCounts["Technical"] || 0} color="#60a5fa" sub="Platform / service issues" />
            <HealthStat label="Selected" value={selected.size} color={selected.size > 0 ? "#fbbf24" : undefined} sub={selected.size > 0 ? "Ready to create tickets" : "Select from table"} />
          </div>

          {/* ══ Charts row ══ */}
          <div className="mb-5 grid grid-cols-1 gap-3.5 lg:grid-cols-2">
            {/* Category donut */}
            <div className="zoca-gradient-border zoca-fade-in rounded-[2rem] bg-[#1f0843]/55 p-5 backdrop-blur-sm" style={{ "--fade-delay": "0.2s" } as React.CSSProperties}>
              <h3 className="mb-3 text-sm font-bold text-white">Risk category mix</h3>
              <div style={{ height: 220 }}>
                <Doughnut
                  data={{
                    labels: Object.keys(catCounts),
                    datasets: [{ data: Object.values(catCounts), backgroundColor: Object.keys(catCounts).map((k) => CAT_COLORS[k] || "#7868f4"), borderWidth: 0 }],
                  }}
                  options={{
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { position: "bottom", labels: { padding: 12, usePointStyle: true, pointStyle: "circle" } } },
                    onClick: (_, elems) => {
                      if (elems[0]) {
                        const idx = elems[0].index;
                        setFilterCat(Object.keys(catCounts)[idx]);
                        setTab("alerts");
                      }
                    },
                    onHover: (event, chartElement) => {
                      const target = event.native?.target as HTMLElement | undefined;
                      if (target) target.style.cursor = chartElement[0] ? "pointer" : "default";
                    },
                  }}
                />
              </div>
            </div>

            {/* Source breakdown bar */}
            <div className="zoca-gradient-border zoca-fade-in rounded-[2rem] bg-[#1f0843]/55 p-5 backdrop-blur-sm" style={{ "--fade-delay": "0.25s" } as React.CSSProperties}>
              <h3 className="mb-3 text-sm font-bold text-white">Alerts by source</h3>
              <div style={{ height: 220 }}>
                <Bar
                  data={{
                    labels: Object.keys(sourceCounts),
                    datasets: [{ data: Object.values(sourceCounts), backgroundColor: ["#ffa8cd", "#7868f4", "#ff86e1", "#60a5fa"], borderRadius: 8, borderSkipped: false }],
                  }}
                  options={{
                    responsive: true, maintainAspectRatio: false, indexAxis: "y" as const,
                    plugins: { legend: { display: false } },
                    scales: { x: { grid: { color: "rgba(200,202,254,0.06)" } }, y: { grid: { display: false } } },
                    onClick: (_, elems) => {
                      if (elems[0]) { setFilterSource(Object.keys(sourceCounts)[elems[0].index]); setTab("alerts"); }
                    },
                    onHover: (event, chartElement) => {
                      const target = event.native?.target as HTMLElement | undefined;
                      if (target) target.style.cursor = chartElement[0] ? "pointer" : "default";
                    },
                  }}
                />
              </div>
            </div>
          </div>

          <div className="mb-5 grid grid-cols-1 gap-3.5 lg:grid-cols-2">
            {/* Daily trend */}
            <div className="zoca-gradient-border zoca-fade-in rounded-[2rem] bg-[#1f0843]/55 p-5 backdrop-blur-sm" style={{ "--fade-delay": "0.3s" } as React.CSSProperties}>
              <h3 className="mb-3 text-sm font-bold text-white">Daily alert volume · 7 days</h3>
              <div style={{ height: 220 }}>
                <Bar
                  data={{
                    labels: dailyCounts.map(([d]) => fmtDate(d)),
                    datasets: [{ data: dailyCounts.map(([, c]) => c), backgroundColor: "rgba(255,168,205,0.6)", borderRadius: 8, borderSkipped: false }],
                  }}
                  options={{
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: { x: { grid: { display: false } }, y: { grid: { color: "rgba(200,202,254,0.06)" }, beginAtZero: true } },
                  }}
                />
              </div>
            </div>

            {/* AM exposure */}
            <div className="zoca-gradient-border zoca-fade-in rounded-[2rem] bg-[#1f0843]/55 p-5 backdrop-blur-sm" style={{ "--fade-delay": "0.35s" } as React.CSSProperties}>
              <h3 className="mb-3 text-sm font-bold text-white">AM exposure · top 10</h3>
              <div style={{ height: 220 }}>
                <Bar
                  data={{
                    labels: amCounts.map(([n]) => n.split(" ")[0]),
                    datasets: [{ data: amCounts.map(([, c]) => c), backgroundColor: "#7868f4", borderRadius: 8, borderSkipped: false }],
                  }}
                  options={{
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: { x: { grid: { display: false } }, y: { grid: { color: "rgba(200,202,254,0.06)" }, beginAtZero: true } },
                    onClick: (_, elems) => {
                      if (elems[0]) { setFilterAM(amCounts[elems[0].index][0]); setTab("alerts"); }
                    },
                    onHover: (event, chartElement) => {
                      const target = event.native?.target as HTMLElement | undefined;
                      if (target) target.style.cursor = chartElement[0] ? "pointer" : "default";
                    },
                  }}
                />
              </div>
            </div>
          </div>
        </>
      ) : null}

      {/* ══ Alerts Table (shown in "alerts" tab or below overview) ══ */}
      {(tab === "alerts" || (tab === "overview" && !loading)) && filtered.length > 0 && (
        <div className="zoca-fade-in zoca-gradient-border overflow-hidden rounded-[2rem]" style={{ "--fade-delay": tab === "alerts" ? "0.1s" : "0.4s" } as React.CSSProperties}>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-gradient-to-b from-[#1f0843] to-[#13063a]">
                  <th className="w-10 border-b border-[rgba(200,202,254,0.18)] p-3 text-center">
                    <input type="checkbox" className="h-4 w-4 accent-[#7868f4]" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleAll} />
                  </th>
                  {["Date", "Time", "Source", "Sender", "Entity ID", "Business Name", "AM Name", "Category", "Subject", "Message", "Analysis"].map((h) => (
                    <th key={h} className="border-b border-[rgba(200,202,254,0.18)] px-2 py-3 text-left text-[9.5px] font-bold uppercase tracking-[0.05em] text-[#c8cafe] whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((a, idx) => {
                  const key = alertKey(a, alerts.indexOf(a));
                  const isSel = selected.has(key);
                  const catColor = CAT_COLORS[a.category] || "#7868f4";
                  return (
                    <tr key={key + idx} onClick={() => toggleRow(key)} className={cls("cursor-pointer border-b border-[rgba(200,202,254,0.10)] transition", isSel ? "bg-[rgba(255,168,205,.08)]" : "hover:bg-[rgba(120,104,244,.06)]")}>
                      <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" className="h-4 w-4 accent-[#7868f4]" checked={isSel} onChange={() => toggleRow(key)} />
                      </td>
                      <td className="px-2 py-2 text-[#c8cafe] whitespace-nowrap">{fmtDate(a.message_date)}</td>
                      <td className="px-2 py-2 text-[rgba(243,237,253,0.55)] whitespace-nowrap">{a.message_time}</td>
                      <td className="px-2 py-2">
                        <span className="inline-block rounded-[9999px] border border-[rgba(200,202,254,0.18)] bg-[#24125c]/50 px-2 py-0.5 text-[10px] font-bold text-[#c8cafe]">{a.source}</span>
                      </td>
                      <td className="px-2 py-2 text-[#c8cafe] max-w-[100px] truncate">{a.sender}</td>
                      <td className="px-2 py-2 font-mono text-[10px] text-[rgba(243,237,253,0.55)] max-w-[80px] truncate">{a.entity_id.slice(0, 8)}...</td>
                      <td className="px-2 py-2">
                        <button onClick={(e) => { e.stopPropagation(); setDetailAlert(a); }} className="text-left font-bold text-white hover:text-[#ffa8cd] max-w-[140px] truncate block">{a.business_name}</button>
                      </td>
                      <td className="px-2 py-2 text-[#c8cafe] max-w-[90px] truncate">{a.am_name}</td>
                      <td className="px-2 py-2">
                        <span className="inline-block rounded-[9999px] px-2 py-0.5 text-[9px] font-bold uppercase" style={{ background: `${catColor}22`, color: catColor, border: `1px solid ${catColor}55` }}>{a.category}</span>
                      </td>
                      <td className="px-2 py-2 text-[#c8cafe] max-w-[120px] truncate">{a.subject || "—"}</td>
                      <td className="px-2 py-2 max-w-[180px]">
                        <div className="line-clamp-2 text-[11px] leading-relaxed text-[#c8cafe]">{a.message_body}</div>
                      </td>
                      <td className="px-2 py-2 max-w-[200px]">
                        <div className="line-clamp-2 text-[11px] leading-relaxed text-[#ffa8cd]/80">{a.analysis}</div>
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
        <div className="zoca-gradient-border rounded-[2rem] bg-[#1f0843]/55 py-20 text-center backdrop-blur-sm">
          <span className="text-[#c8cafe]">{alerts.length === 0 ? "No alerts found in the last 7 days" : "No alerts match your filters"}</span>
        </div>
      )}

      {/* ══ Detail modal ══ */}
      {detailAlert && (
        <div className="modal-overlay" onClick={() => setDetailAlert(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="font-[var(--font-display)] text-xl font-extrabold">{detailAlert.business_name}</h2>
                <p className="mt-1 text-sm text-[#c8cafe]">AM: {detailAlert.am_name} · {detailAlert.source} · {detailAlert.message_date} {detailAlert.message_time}</p>
              </div>
              <button onClick={() => setDetailAlert(null)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-[rgba(200,202,254,0.18)] text-sm text-[#c8cafe] transition hover:border-[#f87171] hover:bg-[rgba(248,113,113,.15)] hover:text-white">✕</button>
            </div>
            <div className="mb-4 grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-[rgba(200,202,254,0.10)] bg-[#0b051d]/60 p-3">
                <div className="text-[10px] font-bold uppercase text-[rgba(243,237,253,0.55)]">Category</div>
                <span className="mt-1 inline-block rounded-[9999px] px-3 py-1 text-xs font-bold" style={{ background: `${CAT_COLORS[detailAlert.category] || "#7868f4"}22`, color: CAT_COLORS[detailAlert.category] || "#7868f4" }}>{detailAlert.category}</span>
              </div>
              <div className="rounded-xl border border-[rgba(200,202,254,0.10)] bg-[#0b051d]/60 p-3">
                <div className="text-[10px] font-bold uppercase text-[rgba(243,237,253,0.55)]">Entity ID</div>
                <div className="mt-1 font-mono text-[11px] text-[#c8cafe]">{detailAlert.entity_id}</div>
              </div>
              <div className="rounded-xl border border-[rgba(200,202,254,0.10)] bg-[#0b051d]/60 p-3">
                <div className="text-[10px] font-bold uppercase text-[rgba(243,237,253,0.55)]">Sender</div>
                <div className="mt-1 text-[11px] text-[#c8cafe]">{detailAlert.sender}</div>
              </div>
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

      {/* ══ Toast ══ */}
      {toast && (
        <div className={cls("fixed bottom-6 right-6 z-50 rounded-[1.25rem] px-5 py-3.5 text-sm font-semibold shadow-lg backdrop-blur-md zoca-fade-in", toast.type === "ok" ? "toast-ok" : toast.type === "err" ? "toast-err" : "toast-info")}>
          {toast.msg}
        </div>
      )}
    </>
  );
}

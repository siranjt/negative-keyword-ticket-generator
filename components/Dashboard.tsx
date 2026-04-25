"use client";

import { useState, useEffect, useMemo, useCallback } from "react";

interface Alert {
  entity_id: string;
  message_body: string;
  subject?: string;
  message_date: string;
  message_time: string;
  sender: string;
  source: string;
  business_name: string;
  am_name: string;
}

interface TicketResult {
  business: string;
  ticketId: string;
  url: string;
  skipped: boolean;
  error?: string;
}

const RISK_MAP: { pattern: RegExp; cls: string; label: string }[] = [
  { pattern: /cancel|cancell|remove.*zoca|stop.*service|end.*subscription/i, cls: "bg-[rgba(248,113,113,.14)] text-[#fca5a5] border-[rgba(248,113,113,.35)]", label: "Cancellation" },
  { pattern: /refund|charge|money|payment|billing|invoice|took.*money/i, cls: "bg-[rgba(168,85,247,.16)] text-[#d8b4fe] border-[rgba(168,85,247,.4)]", label: "Billing" },
  { pattern: /lead|booking|spam|call.*quality|no.*result|roi/i, cls: "bg-[rgba(251,191,36,.14)] text-[#fcd34d] border-[rgba(251,191,36,.35)]", label: "Lead quality" },
  { pattern: /not.*work|bug|broken|issue|error|can.*see|not.*fix/i, cls: "bg-[rgba(96,165,250,.14)] text-[#93c5fd] border-[rgba(96,165,250,.38)]", label: "Technical" },
  { pattern: /disappoint|upset|unhappy|frustrated|terrible|worst|unacceptable/i, cls: "bg-[rgba(251,146,60,.16)] text-[#fdba74] border-[rgba(251,146,60,.4)]", label: "Disappointed" },
];

function classifyRisk(msg: string, subject?: string) {
  const text = `${subject || ""} ${msg}`.toLowerCase();
  for (const r of RISK_MAP) {
    if (r.pattern.test(text)) return r;
  }
  return { cls: "bg-zoca-bg-3/50 text-zoca-text-muted border-zoca-border-2", label: "Flagged" };
}

function srcBadge(source: string) {
  if (source === "App Chat") return "bg-[rgba(120,104,244,.16)] text-[#8a9bff] border-[rgba(120,104,244,.4)]";
  if (source === "Email") return "bg-[rgba(255,168,205,.12)] text-zoca-pink-1 border-[rgba(255,168,205,.35)]";
  return "bg-[rgba(200,202,254,.1)] text-zoca-text-muted border-zoca-border-2";
}

function fmtDate(d: string) {
  try { return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" }); } catch { return d; }
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <button onClick={onClear} className="inline-flex items-center gap-1.5 rounded-zoca-pill border border-zoca-border-2 bg-zoca-bg-3/50 px-3 py-1 text-[10.5px] font-bold text-zoca-text-muted transition hover:border-zoca-pink-1 hover:text-white">
      {label} <span className="text-zoca-pink-text">✕</span>
    </button>
  );
}

export default function Dashboard() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchedAt, setFetchedAt] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filterAM, setFilterAM] = useState("");
  const [filterSource, setFilterSource] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" | "info" } | null>(null);

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

  function showToast(msg: string, type: "ok" | "err" | "info") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 5000);
  }

  const alertKey = (a: Alert, i: number) => `${a.entity_id}::${i}`;

  const filtered = useMemo(() => alerts.filter((a) => {
    if (filterAM && a.am_name !== filterAM) return false;
    if (filterSource && a.source !== filterSource) return false;
    if (filterDate && a.message_date !== filterDate) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!a.business_name.toLowerCase().includes(q) && !a.message_body.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [alerts, filterAM, filterSource, filterDate, search]);

  const ams = useMemo(() => Array.from(new Set(alerts.map((a) => a.am_name))).sort(), [alerts]);
  const sources = useMemo(() => Array.from(new Set(alerts.map((a) => a.source))).sort(), [alerts]);
  const dates = useMemo(() => Array.from(new Set(alerts.map((a) => a.message_date))).sort().reverse(), [alerts]);
  const uniqueBiz = useMemo(() => new Set(alerts.map((a) => a.business_name)).size, [alerts]);
  const cancelCount = useMemo(() => alerts.filter((a) => RISK_MAP[0].pattern.test(`${a.subject || ""} ${a.message_body}`)).length, [alerts]);

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
        body: JSON.stringify({ alerts: items.map((a) => ({ entity_id: a.entity_id, business_name: a.business_name, am_name: a.am_name, message_body: a.message_body, source: a.source, message_date: a.message_date, message_time: a.message_time, risk_category: classifyRisk(a.message_body, a.subject).label })) }),
      });
      const data = await res.json();
      if (data.results) {
        const created = data.results.filter((r: TicketResult) => !r.skipped && !r.error).length;
        const skipped = data.results.filter((r: TicketResult) => r.skipped).length;
        const errors = data.results.filter((r: TicketResult) => r.error).length;
        showToast(`${created} created${skipped ? `, ${skipped} skipped` : ""}${errors ? `, ${errors} failed` : ""}`, errors ? "err" : "ok");
        setSelected(new Set());
      }
    } catch { showToast("Failed to create tickets", "err"); }
    setCreating(false);
  }

  const hasFilters = !!(filterAM || filterSource || filterDate || search);

  return (
    <>
      {/* KPI Cards */}
      <div className="mb-5 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        {([
          { label: "Total alerts", value: alerts.length, color: "" },
          { label: "Businesses", value: uniqueBiz, color: "" },
          { label: "Cancellation intent", value: cancelCount, color: cancelCount > 0 ? "text-zoca-bad" : "text-zoca-ok" },
          { label: "Selected", value: selected.size, color: selected.size > 0 ? "text-zoca-warn" : "" },
        ] as const).map((kpi, i) => (
          <div key={i} className="zoca-fade-in zoca-glow-hover rounded-zoca-2xl border border-zoca-border bg-zoca-bg-2/55 p-4 backdrop-blur-sm" style={{ "--fade-delay": `${i * 0.08}s` } as React.CSSProperties}>
            <div className="text-[10.5px] font-semibold uppercase tracking-wider text-zoca-text-soft">{kpi.label}</div>
            <div className={`num-hero mt-1.5 text-[26px] ${kpi.color}`}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* Filter Row */}
      <div className="zoca-fade-in mb-4 rounded-zoca-xl border border-zoca-border-2 bg-zoca-bg-2/55 p-3 backdrop-blur-sm" style={{ "--fade-delay": "0.3s" } as React.CSSProperties}>
        <div className="grid grid-cols-1 items-center gap-3 lg:grid-cols-12">
          <input
            className="rounded-zoca-pill border border-zoca-border-2 bg-zoca-bg-3/50 px-3.5 py-2 text-xs text-white outline-none placeholder:text-zoca-text-soft focus:border-zoca-purple lg:col-span-3"
            placeholder="Search business, message..."
            value={search} onChange={(e) => setSearch(e.target.value)}
          />
          <select className="rounded-zoca-pill border border-zoca-border-2 bg-zoca-bg-3/50 px-3.5 py-2 text-xs text-white outline-none focus:border-zoca-purple lg:col-span-3" value={filterAM} onChange={(e) => setFilterAM(e.target.value)}>
            <option value="">All AMs</option>
            {ams.map((am) => <option key={am} value={am}>{am}</option>)}
          </select>
          <select className="rounded-zoca-pill border border-zoca-border-2 bg-zoca-bg-3/50 px-3.5 py-2 text-xs text-white outline-none focus:border-zoca-purple lg:col-span-2" value={filterSource} onChange={(e) => setFilterSource(e.target.value)}>
            <option value="">All sources</option>
            {sources.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="rounded-zoca-pill border border-zoca-border-2 bg-zoca-bg-3/50 px-3.5 py-2 text-xs text-white outline-none focus:border-zoca-purple lg:col-span-2" value={filterDate} onChange={(e) => setFilterDate(e.target.value)}>
            <option value="">All dates</option>
            {dates.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <button onClick={fetchAlerts} disabled={loading} className="flex items-center justify-center gap-1.5 rounded-zoca-pill border border-zoca-border-2 bg-zoca-bg-3/50 px-3.5 py-2 text-xs font-semibold text-white transition hover:border-zoca-purple lg:col-span-2">
            <span className={loading ? "refresh-spinning inline-block" : "inline-block"}>↻</span> Refresh
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-zoca-border pt-3 text-xs">
          <span className="text-zoca-text-soft">
            Showing <b className="text-white">{filtered.length}</b> / {alerts.length}
            {fetchedAt && <> · last refresh {new Date(fetchedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</>}
          </span>
          <div className="flex gap-2">
            <button onClick={toggleAll} className="rounded-zoca-pill border border-zoca-border-2 bg-zoca-bg-3/50 px-3 py-1.5 text-[11px] font-semibold text-zoca-text-muted transition hover:border-zoca-border-3 hover:text-white">
              {selected.size === filtered.length && filtered.length > 0 ? "Deselect all" : "Select all"}
            </button>
            <button onClick={handleCreateTickets} disabled={!selected.size || creating} className="rounded-zoca-pill bg-zoca-pink-1 px-4 py-1.5 text-[11px] font-bold text-[#0a0422] shadow-[0_4px_14px_rgba(255,168,205,.28)] transition hover:bg-zoca-pink-hover disabled:opacity-50">
              {creating ? <><span className="refresh-spinning mr-1 inline-block">↻</span>Creating...</> : `Create tickets (${selected.size})`}
            </button>
          </div>
        </div>
      </div>

      {/* Active filter chips */}
      {hasFilters && (
        <div className="mb-3.5 flex flex-wrap gap-1.5">
          {filterAM && <FilterChip label={`AM: ${filterAM}`} onClear={() => setFilterAM("")} />}
          {filterSource && <FilterChip label={`Source: ${filterSource}`} onClear={() => setFilterSource("")} />}
          {filterDate && <FilterChip label={`Date: ${filterDate}`} onClear={() => setFilterDate("")} />}
          {search && <FilterChip label={`Search: ${search}`} onClear={() => setSearch("")} />}
          <button onClick={() => { setFilterAM(""); setFilterSource(""); setFilterDate(""); setSearch(""); }} className="rounded-zoca-pill border border-[rgba(255,168,205,.35)] bg-[rgba(255,168,205,.12)] px-3 py-1 text-[10.5px] font-bold text-zoca-pink-1 transition hover:bg-[rgba(255,168,205,.2)]">
            Reset all
          </button>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="py-16 text-center text-zoca-text-muted">
          <span className="refresh-spinning mr-2 inline-block text-lg">↻</span>Loading alerts...
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-zoca-2xl border border-zoca-border bg-zoca-bg-2/55 py-16 text-center text-zoca-text-muted backdrop-blur-sm">
          {alerts.length === 0 ? "No alerts found in the last 24 hours" : "No alerts match your filters"}
        </div>
      ) : (
        <div className="zoca-fade-in overflow-hidden rounded-zoca-xl border border-zoca-border" style={{ "--fade-delay": "0.4s" } as React.CSSProperties}>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className="sticky top-0 z-10 w-10 border-b border-zoca-border-2 bg-gradient-to-b from-zoca-bg-2 to-zoca-bg-1 p-3 text-center"><input type="checkbox" className="h-4 w-4 accent-zoca-purple" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleAll} /></th>
                <th className="sticky top-0 z-10 w-[24%] border-b border-zoca-border-2 bg-gradient-to-b from-zoca-bg-2 to-zoca-bg-1 px-3 py-3 text-left text-[10.5px] font-bold uppercase tracking-wider text-zoca-text-muted">Business</th>
                <th className="sticky top-0 z-10 w-[13%] border-b border-zoca-border-2 bg-gradient-to-b from-zoca-bg-2 to-zoca-bg-1 px-3 py-3 text-left text-[10.5px] font-bold uppercase tracking-wider text-zoca-text-muted">AM</th>
                <th className="sticky top-0 z-10 w-[9%] border-b border-zoca-border-2 bg-gradient-to-b from-zoca-bg-2 to-zoca-bg-1 px-3 py-3 text-left text-[10.5px] font-bold uppercase tracking-wider text-zoca-text-muted">Source</th>
                <th className="sticky top-0 z-10 w-[12%] border-b border-zoca-border-2 bg-gradient-to-b from-zoca-bg-2 to-zoca-bg-1 px-3 py-3 text-left text-[10.5px] font-bold uppercase tracking-wider text-zoca-text-muted">Date</th>
                <th className="sticky top-0 z-10 border-b border-zoca-border-2 bg-gradient-to-b from-zoca-bg-2 to-zoca-bg-1 px-3 py-3 text-left text-[10.5px] font-bold uppercase tracking-wider text-zoca-text-muted">Signal</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((alert, idx) => {
                const key = alertKey(alert, alerts.indexOf(alert));
                const risk = classifyRisk(alert.message_body, alert.subject);
                const isSel = selected.has(key);
                return (
                  <tr key={key + idx} onClick={() => toggleRow(key)} className={`cursor-pointer border-b border-zoca-border transition ${isSel ? "bg-[rgba(255,168,205,.09)]" : "hover:bg-[rgba(120,104,244,.07)]"}`}>
                    <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}><input type="checkbox" className="h-4 w-4 accent-zoca-purple" checked={isSel} onChange={() => toggleRow(key)} /></td>
                    <td className="px-3 py-2.5">
                      <span className="text-[12.5px] font-bold text-white">{alert.business_name}</span><br />
                      <span className={`mt-1 inline-block rounded-zoca-pill border px-2.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide ${risk.cls}`}>{risk.label}</span>
                    </td>
                    <td className="px-3 py-2.5 text-zoca-text-muted">{alert.am_name}</td>
                    <td className="px-3 py-2.5"><span className={`inline-block rounded-zoca-pill border px-2.5 py-0.5 text-[10.5px] font-bold tracking-wide ${srcBadge(alert.source)}`}>{alert.source}</span></td>
                    <td className="px-3 py-2.5">
                      {fmtDate(alert.message_date)}<br />
                      <span className="text-[10px] text-zoca-text-soft">{alert.message_time}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="line-clamp-2 text-[11.5px] leading-relaxed text-zoca-text-muted">{alert.message_body}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 rounded-zoca-xl px-5 py-3.5 text-[13px] font-semibold shadow-lg backdrop-blur-md zoca-fade-in ${
          toast.type === "ok" ? "border border-[rgba(74,222,128,.4)] bg-[rgba(74,222,128,.18)] text-[#c8f7d4]" :
          toast.type === "err" ? "border border-[rgba(248,113,113,.4)] bg-[rgba(248,113,113,.18)] text-[#ffd5dc]" :
          "border border-[rgba(120,104,244,.4)] bg-[rgba(120,104,244,.18)] text-[#cfd8ff]"
        }`}>
          {toast.msg}
        </div>
      )}
    </>
  );
}

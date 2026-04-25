"use client";

import { useState, useEffect, useMemo, useCallback } from "react";

/* ── Types ── */
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
interface TicketResult { business: string; ticketId: string; url: string; skipped: boolean; error?: string; }

/* ── Helpers ── */
function cls(...p: (string | false | null | undefined)[]) { return p.filter(Boolean).join(" "); }

const RISK_MAP: { pattern: RegExp; color: string; label: string }[] = [
  { pattern: /cancel|cancell|remove.*zoca|stop.*service|end.*subscription/i, color: "#ff4fa8", label: "Cancellation" },
  { pattern: /refund|charge|money|payment|billing|invoice|took.*money/i,     color: "#a855f7", label: "Billing" },
  { pattern: /lead|booking|spam|call.*quality|no.*result|roi/i,              color: "#fbbf24", label: "Lead quality" },
  { pattern: /not.*work|bug|broken|issue|error|can.*see|not.*fix/i,          color: "#60a5fa", label: "Technical" },
  { pattern: /disappoint|upset|unhappy|frustrated|terrible|worst|unacceptable/i, color: "#fb923c", label: "Disappointed" },
];

function classifyRisk(msg: string, subject?: string) {
  const text = `${subject || ""} ${msg}`.toLowerCase();
  for (const r of RISK_MAP) if (r.pattern.test(text)) return r;
  return { color: "#7868f4", label: "Flagged" };
}

function fmtDate(d: string) {
  try { return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" }); } catch { return d; }
}

/* ── Sub-components (match reference) ── */
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cls("zoca-gradient-border rounded-[2rem] bg-[#1a0b4a]/55 p-5 backdrop-blur-sm", className)}>
      {children}
    </div>
  );
}

function HealthStat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="zoca-gradient-border zoca-glow-hover rounded-[2rem] bg-[#1a0b4a]/55 px-5 py-4 backdrop-blur-sm">
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[rgba(243,237,253,0.55)]">{label}</div>
      <div className="num-hero mt-1 text-2xl text-white">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-[#c8cafe]">{sub}</div>}
    </div>
  );
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <button onClick={onClear} className="inline-flex items-center gap-1.5 rounded-[9999px] border border-[rgba(200,202,254,0.18)] bg-[#24125c]/50 px-3 py-1 text-[10.5px] font-bold text-[#c8cafe] transition hover:border-[#ff4fa8] hover:text-white">
      {label} <span className="text-[#ff4fa8]">✕</span>
    </button>
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
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);
  const [detailAlert, setDetailAlert] = useState<Alert | null>(null);

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
  const sourceBreakdown = useMemo(() => {
    const m: Record<string, number> = {};
    alerts.forEach((a) => { m[a.source] = (m[a.source] || 0) + 1; });
    return m;
  }, [alerts]);

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
        const c = data.results.filter((r: TicketResult) => !r.skipped && !r.error).length;
        const s = data.results.filter((r: TicketResult) => r.skipped).length;
        const e = data.results.filter((r: TicketResult) => r.error).length;
        showToast(`${c} created${s ? `, ${s} skipped` : ""}${e ? `, ${e} failed` : ""}`, e ? "err" : "ok");
        setSelected(new Set());
      }
    } catch { showToast("Failed to create tickets", "err"); }
    setCreating(false);
  }

  const hasFilters = !!(filterAM || filterSource || filterDate || search);

  /* ── Input class (match reference: pill, dark bg, 36px) ── */
  const inputCls = "h-9 w-full rounded-[9999px] border border-[rgba(200,202,254,0.18)] bg-[#24125c]/50 px-4 text-xs text-white outline-none placeholder:text-[rgba(243,237,253,0.55)] focus:border-[#7868f4] appearance-none";

  return (
    <>
      {/* ══════ Filter row (12-col grid) ══════ */}
      <div className="zoca-fade-in mb-4 rounded-[1.25rem] border border-[rgba(200,202,254,0.18)] bg-[#1a0b4a]/55 p-3 backdrop-blur-sm" style={{ "--fade-delay": "0.1s" } as React.CSSProperties}>
        <div className="grid grid-cols-1 items-center gap-3 lg:grid-cols-12">
          <input className={cls(inputCls, "lg:col-span-3")} placeholder="Search biz name, AM, message..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className={cls(inputCls, "lg:col-span-3")} value={filterAM} onChange={(e) => setFilterAM(e.target.value)}>
            <option value="">All AMs</option>
            {ams.map((am) => <option key={am} value={am}>{am}</option>)}
          </select>
          <select className={cls(inputCls, "lg:col-span-2")} value={filterSource} onChange={(e) => setFilterSource(e.target.value)}>
            <option value="">All sources</option>
            {sources.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className={cls(inputCls, "lg:col-span-2")} value={filterDate} onChange={(e) => setFilterDate(e.target.value)}>
            <option value="">All dates</option>
            {dates.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <div className="flex gap-2 lg:col-span-2">
            <button onClick={toggleAll} className="h-9 flex-1 rounded-[9999px] border border-[rgba(200,202,254,0.18)] bg-[#24125c]/50 px-3 text-xs font-semibold text-[#c8cafe] transition hover:border-[rgba(200,202,254,0.28)] hover:text-white">
              {selected.size === filtered.length && filtered.length > 0 ? "Deselect" : "Select all"}
            </button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[rgba(200,202,254,0.10)] pt-3">
          <span className="text-xs uppercase tracking-wider text-[rgba(243,237,253,0.55)]">
            Showing <span className="font-bold text-[#4ade80]">{filtered.length}</span> / {alerts.length}
            {fetchedAt && <> · last refresh {new Date(fetchedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} · {new Date(fetchedAt).toISOString().slice(0, 10)}</>}
          </span>
          <div className="flex gap-2">
            <button onClick={fetchAlerts} disabled={loading} className="flex h-9 items-center gap-1.5 rounded-[9999px] border border-[rgba(200,202,254,0.18)] bg-[#24125c]/50 px-4 text-xs font-semibold text-[#c8cafe] transition hover:border-[rgba(200,202,254,0.28)] hover:text-white">
              ↓ CSV
            </button>
            <button
              onClick={selected.size > 0 ? handleCreateTickets : fetchAlerts}
              disabled={creating || loading}
              className="flex h-9 items-center gap-1.5 rounded-[9999px] bg-[#ffa8cd] px-5 text-xs font-bold text-[#0a0422] shadow-[0_4px_14px_rgba(255,168,205,.28)] transition hover:bg-[#f695be] disabled:opacity-50"
            >
              {creating ? <><span className="refresh-spinning inline-block">↻</span> Creating...</> :
               selected.size > 0 ? `Create tickets (${selected.size})` :
               loading ? <><span className="refresh-spinning inline-block">↻</span> Refreshing...</> :
               "↻ Refresh live data"}
            </button>
          </div>
        </div>
      </div>

      {/* ══════ Active filter chips ══════ */}
      {hasFilters && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {filterAM && <FilterChip label={`AM: ${filterAM}`} onClear={() => setFilterAM("")} />}
          {filterSource && <FilterChip label={`source: ${filterSource}`} onClear={() => setFilterSource("")} />}
          {filterDate && <FilterChip label={`date: ${filterDate}`} onClear={() => setFilterDate("")} />}
          {search && <FilterChip label={`search: ${search}`} onClear={() => setSearch("")} />}
          <button onClick={() => { setFilterAM(""); setFilterSource(""); setFilterDate(""); setSearch(""); }} className="text-xs font-semibold text-[#ff4fa8] underline transition hover:text-[#ffa8cd]">reset all</button>
        </div>
      )}

      {/* ══════ Data Health strip ══════ */}
      <div className="mb-5 grid grid-cols-2 gap-3.5 lg:grid-cols-6">
        <HealthStat label="Total alerts" value={alerts.length} sub={`${uniqueBiz} businesses`} />
        <HealthStat label="Cancellation intent" value={cancelCount} sub={cancelCount > 0 ? `${((cancelCount / Math.max(alerts.length, 1)) * 100).toFixed(1)}% of alerts` : "None detected"} />
        <HealthStat label="Sources" value={Object.keys(sourceBreakdown).length} sub={Object.entries(sourceBreakdown).map(([k, v]) => `${v} ${k.toLowerCase()}`).join(" · ")} />
        <HealthStat label="Selected" value={selected.size} sub={selected.size > 0 ? "Ready to create tickets" : "Select rows below"} />
        <HealthStat label="Date range" value={dates.length > 0 ? dates[dates.length - 1]?.slice(5) + " → " + dates[0]?.slice(5) : "—"} sub="Last 24h window" />
        <HealthStat label="AMs involved" value={ams.length} sub={ams.slice(0, 3).join(", ") + (ams.length > 3 ? ` +${ams.length - 3}` : "")} />
      </div>

      {/* ══════ Risk breakdown cards ══════ */}
      {alerts.length > 0 && (
        <div className="mb-5 grid grid-cols-2 gap-3.5 lg:grid-cols-5">
          {RISK_MAP.map((r, i) => {
            const count = alerts.filter((a) => r.pattern.test(`${a.subject || ""} ${a.message_body}`)).length;
            return (
              <div key={i} className="zoca-fade-in zoca-gradient-border zoca-glow-hover rounded-[2rem] bg-[#1a0b4a]/55 p-5 backdrop-blur-sm" style={{ "--fade-delay": `${i * 0.06}s` } as React.CSSProperties}>
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: r.color }} />
                  <span className="text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: r.color }}>{r.label}</span>
                </div>
                <div className="num-hero mt-2 text-4xl text-white">{count}</div>
                <div className="mt-1 text-[11px] text-[#c8cafe]">{alerts.length > 0 ? ((count / alerts.length) * 100).toFixed(1) : 0}% of alerts</div>
              </div>
            );
          })}
        </div>
      )}

      {/* ══════ Alerts table ══════ */}
      {loading ? (
        <Card className="py-20 text-center">
          <span className="refresh-spinning mr-2 inline-block text-xl text-[#7868f4]">↻</span>
          <span className="text-[#c8cafe]">Loading alerts from Metabase...</span>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="py-20 text-center text-[#c8cafe]">
          {alerts.length === 0 ? "No alerts found in the last 24 hours" : "No alerts match your filters"}
        </Card>
      ) : (
        <div className="zoca-fade-in zoca-gradient-border overflow-hidden rounded-[2rem]" style={{ "--fade-delay": "0.35s" } as React.CSSProperties}>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-gradient-to-b from-[#1a0b4a] to-[#13063a]">
                  <th className="w-10 border-b border-[rgba(200,202,254,0.18)] p-3 text-center">
                    <input type="checkbox" className="h-4 w-4 accent-[#7868f4]" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleAll} />
                  </th>
                  {["Business", "AM", "Source", "Date", "Signal"].map((h) => (
                    <th key={h} className="border-b border-[rgba(200,202,254,0.18)] px-3 py-3 text-left text-[10.5px] font-bold uppercase tracking-[0.05em] text-[#c8cafe]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((alert, idx) => {
                  const key = alertKey(alert, alerts.indexOf(alert));
                  const risk = classifyRisk(alert.message_body, alert.subject);
                  const isSel = selected.has(key);
                  return (
                    <tr
                      key={key + idx}
                      onClick={() => toggleRow(key)}
                      className={cls(
                        "cursor-pointer border-b border-[rgba(200,202,254,0.10)] transition",
                        isSel ? "bg-[rgba(255,168,205,.08)]" : "hover:bg-[rgba(120,104,244,.06)]"
                      )}
                    >
                      <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" className="h-4 w-4 accent-[#7868f4]" checked={isSel} onChange={() => toggleRow(key)} />
                      </td>
                      <td className="px-3 py-3">
                        <button onClick={(e) => { e.stopPropagation(); setDetailAlert(alert); }} className="text-left font-bold text-white hover:text-[#ffa8cd]">
                          {alert.business_name}
                        </button>
                        <div className="mt-1">
                          <span className="inline-block rounded-[9999px] px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wide" style={{ background: `${risk.color}22`, color: risk.color, border: `1px solid ${risk.color}55` }}>
                            {risk.label}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-[#c8cafe]">{alert.am_name}</td>
                      <td className="px-3 py-3">
                        <span className="inline-block rounded-[9999px] border border-[rgba(200,202,254,0.18)] bg-[#24125c]/50 px-2.5 py-0.5 text-[10px] font-bold text-[#c8cafe]">
                          {alert.source}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-[#c8cafe]">
                        {fmtDate(alert.message_date)}
                        <div className="text-[10px] text-[rgba(243,237,253,0.55)]">{alert.message_time}</div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="line-clamp-2 text-[11.5px] leading-relaxed text-[#c8cafe]">{alert.message_body}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════ Detail modal ══════ */}
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
            <div className="mb-4 rounded-xl border border-[rgba(200,202,254,0.10)] bg-[#0a0422]/60 p-4">
              <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-[rgba(243,237,253,0.55)]">Risk classification</div>
              <span className="inline-block rounded-[9999px] px-3 py-1 text-xs font-bold" style={{ background: `${classifyRisk(detailAlert.message_body, detailAlert.subject).color}22`, color: classifyRisk(detailAlert.message_body, detailAlert.subject).color }}>
                {classifyRisk(detailAlert.message_body, detailAlert.subject).label}
              </span>
            </div>
            <div className="rounded-xl border border-[rgba(200,202,254,0.10)] bg-[#0a0422]/60 p-4">
              <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-[rgba(243,237,253,0.55)]">Full message</div>
              <p className="text-sm leading-relaxed text-[#c8cafe]">{detailAlert.message_body}</p>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl border border-[rgba(200,202,254,0.10)] bg-[#0a0422]/60 p-3">
                <div className="text-[10px] font-bold uppercase text-[rgba(243,237,253,0.55)]">Entity ID</div>
                <div className="mt-1 font-mono text-[11px] text-[#c8cafe]">{detailAlert.entity_id}</div>
              </div>
              <div className="rounded-xl border border-[rgba(200,202,254,0.10)] bg-[#0a0422]/60 p-3">
                <div className="text-[10px] font-bold uppercase text-[rgba(243,237,253,0.55)]">Sender</div>
                <div className="mt-1 text-[#c8cafe]">{detailAlert.sender}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════ Toast ══════ */}
      {toast && (
        <div className={cls(
          "fixed bottom-6 right-6 z-50 rounded-[1.25rem] px-5 py-3.5 text-sm font-semibold shadow-lg backdrop-blur-md zoca-fade-in",
          toast.type === "ok" ? "toast-ok" : toast.type === "err" ? "toast-err" : "toast-info"
        )}>
          {toast.msg}
        </div>
      )}
    </>
  );
}

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

const RISK_KEYWORDS: Record<string, { pattern: RegExp; cls: string; label: string }> = {
  cancel: { pattern: /cancel|cancell|remove.*zoca|stop.*service|end.*subscription/i, cls: "r-cancel", label: "Cancellation" },
  billing: { pattern: /refund|charge|money|payment|billing|invoice|took.*money/i, cls: "r-billing", label: "Billing" },
  leads: { pattern: /lead|booking|spam|call.*quality|no.*result|roi/i, cls: "r-leads", label: "Lead quality" },
  tech: { pattern: /not.*work|bug|broken|issue|error|can.*see|not.*fix/i, cls: "r-tech", label: "Technical" },
  service: { pattern: /disappoint|upset|unhappy|frustrated|terrible|worst|unacceptable/i, cls: "r-service", label: "Disappointed" },
};

function classifyRisk(msg: string, subject?: string): { cls: string; label: string } {
  const text = `${subject || ""} ${msg}`.toLowerCase();
  for (const [, v] of Object.entries(RISK_KEYWORDS)) {
    if (v.pattern.test(text)) return { cls: v.cls, label: v.label };
  }
  return { cls: "r-general", label: "Flagged" };
}

function srcBadgeClass(source: string): string {
  if (source === "App Chat") return "b-chat";
  if (source === "Email") return "b-email";
  return "b-sms";
}

function formatDate(d: string): string {
  try {
    const dt = new Date(d);
    return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return d;
  }
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
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/alerts");
      const data = await res.json();
      setAlerts(data.alerts || []);
      setFetchedAt(data.fetchedAt || "");
      setSelected(new Set());
    } catch {
      showToast("Failed to fetch alerts", "err");
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  function showToast(msg: string, type: string) {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 5000);
  }

  const alertKey = (a: Alert, i: number) => `${a.entity_id}::${i}`;

  const filtered = useMemo(() => {
    return alerts.filter((a) => {
      if (filterAM && a.am_name !== filterAM) return false;
      if (filterSource && a.source !== filterSource) return false;
      if (filterDate && a.message_date !== filterDate) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!a.business_name.toLowerCase().includes(q) && !a.message_body.toLowerCase().includes(q) && !(a.sender || "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [alerts, filterAM, filterSource, filterDate, search]);

  const ams = useMemo(() => [...new Set(alerts.map((a) => a.am_name))].sort(), [alerts]);
  const sources = useMemo(() => [...new Set(alerts.map((a) => a.source))].sort(), [alerts]);
  const dates = useMemo(() => [...new Set(alerts.map((a) => a.message_date))].sort().reverse(), [alerts]);
  const uniqueBusinesses = useMemo(() => new Set(alerts.map((a) => a.business_name)).size, [alerts]);
  const cancelCount = useMemo(
    () => alerts.filter((a) => RISK_KEYWORDS.cancel.pattern.test(`${a.subject || ""} ${a.message_body}`)).length,
    [alerts]
  );

  function toggleRow(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      const keys = new Set(filtered.map((a, i) => alertKey(a, alerts.indexOf(a))));
      setSelected(keys);
    }
  }

  async function handleCreateTickets() {
    const selectedAlerts = alerts
      .map((a, i) => ({ ...a, key: alertKey(a, i) }))
      .filter((a) => selected.has(a.key))
      .map((a) => ({
        entity_id: a.entity_id,
        business_name: a.business_name,
        am_name: a.am_name,
        message_body: a.message_body,
        source: a.source,
        message_date: a.message_date,
        message_time: a.message_time,
        risk_category: classifyRisk(a.message_body, a.subject).label,
      }));
    if (selectedAlerts.length === 0) return;
    setCreating(true);
    try {
      const res = await fetch("/api/create-tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alerts: selectedAlerts }),
      });
      const data = await res.json();
      if (data.results) {
        const created = data.results.filter((r: TicketResult) => !r.skipped && !r.error);
        const skipped = data.results.filter((r: TicketResult) => r.skipped);
        const errors = data.results.filter((r: TicketResult) => r.error);
        let msg = `${created.length} ticket(s) created`;
        if (skipped.length) msg += `, ${skipped.length} skipped (duplicate)`;
        if (errors.length) msg += `, ${errors.length} failed`;
        showToast(msg, errors.length ? "err" : "ok");
        setSelected(new Set());
      }
    } catch {
      showToast("Failed to create tickets", "err");
    }
    setCreating(false);
  }

  return (
    <>
      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 14, marginBottom: 20 }}>
        {[
          { label: "Total alerts", value: alerts.length, color: "" },
          { label: "Businesses", value: uniqueBusinesses, color: "" },
          { label: "Cancellation intent", value: cancelCount, color: cancelCount > 0 ? "var(--color-zoca-bad)" : "var(--color-zoca-ok)" },
          { label: "Selected", value: selected.size, color: selected.size > 0 ? "var(--color-zoca-warn)" : "" },
        ].map((kpi, i) => (
          <div key={i} className="zoca-card-sm zoca-glow-hover zoca-fade-in" style={{ "--fade-delay": `${i * 0.08}s` } as React.CSSProperties}>
            <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.8px", color: "var(--color-zoca-text-soft)", fontWeight: 600 }}>
              {kpi.label}
            </div>
            <div className="num-hero" style={{ fontSize: 26, marginTop: 6, color: kpi.color || "var(--color-zoca-text-primary)" }}>
              {kpi.value}
            </div>
          </div>
        ))}
      </div>

      {/* Filter Row */}
      <div className="zoca-card zoca-fade-in" style={{ "--fade-delay": "0.3s", padding: 12, marginBottom: 18 } as React.CSSProperties}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 10, alignItems: "center" }}>
          <input
            className="zoca-input"
            style={{ gridColumn: "span 3" }}
            placeholder="Search business, message..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className="zoca-input" style={{ gridColumn: "span 3" }} value={filterAM} onChange={(e) => setFilterAM(e.target.value)}>
            <option value="">All AMs</option>
            {ams.map((am) => <option key={am} value={am}>{am}</option>)}
          </select>
          <select className="zoca-input" style={{ gridColumn: "span 2" }} value={filterSource} onChange={(e) => setFilterSource(e.target.value)}>
            <option value="">All sources</option>
            {sources.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="zoca-input" style={{ gridColumn: "span 2" }} value={filterDate} onChange={(e) => setFilterDate(e.target.value)}>
            <option value="">All dates</option>
            {dates.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <div style={{ gridColumn: "span 2", display: "flex", gap: 6 }}>
            <button className="btn-zoca-outline" onClick={fetchAlerts} disabled={loading} style={{ flex: 1 }}>
              {loading ? <span className="refresh-spinning" style={{ display: "inline-block" }}>&#8635;</span> : "&#8635;"} Refresh
            </button>
          </div>
        </div>
        <div style={{
          marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--color-zoca-border)",
          display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12,
        }}>
          <span style={{ color: "var(--color-zoca-text-soft)" }}>
            Showing <b style={{ color: "var(--color-zoca-text-primary)" }}>{filtered.length}</b> / {alerts.length}
            {fetchedAt && <> &middot; last refresh {new Date(fetchedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</>}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn-zoca-outline" onClick={toggleAll} style={{ fontSize: 11 }}>
              {selected.size === filtered.length && filtered.length > 0 ? "Deselect all" : "Select all"}
            </button>
            <button
              className="btn-zoca-pink"
              disabled={selected.size === 0 || creating}
              onClick={handleCreateTickets}
            >
              {creating ? (
                <><span className="refresh-spinning" style={{ display: "inline-block", marginRight: 6 }}>&#8635;</span>Creating...</>
              ) : (
                `Create tickets (${selected.size})`
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Active filter chips */}
      {(filterAM || filterSource || filterDate || search) && (
        <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
          {filterAM && (
            <span className="zoca-badge" style={{ cursor: "pointer" }} onClick={() => setFilterAM("")}>
              AM: {filterAM} ✕
            </span>
          )}
          {filterSource && (
            <span className="zoca-badge" style={{ cursor: "pointer" }} onClick={() => setFilterSource("")}>
              Source: {filterSource} ✕
            </span>
          )}
          {filterDate && (
            <span className="zoca-badge" style={{ cursor: "pointer" }} onClick={() => setFilterDate("")}>
              Date: {filterDate} ✕
            </span>
          )}
          {search && (
            <span className="zoca-badge" style={{ cursor: "pointer" }} onClick={() => setSearch("")}>
              Search: {search} ✕
            </span>
          )}
          <span
            className="zoca-badge"
            style={{ cursor: "pointer", background: "rgba(255,168,205,.12)", color: "var(--color-zoca-pink-1)", borderColor: "rgba(255,168,205,.35)" }}
            onClick={() => { setFilterAM(""); setFilterSource(""); setFilterDate(""); setSearch(""); }}
          >
            Reset all
          </span>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--color-zoca-text-muted)" }}>
          <span className="refresh-spinning" style={{ display: "inline-block", fontSize: 20, marginRight: 10 }}>&#8635;</span>
          Loading alerts...
        </div>
      ) : filtered.length === 0 ? (
        <div className="zoca-card" style={{ textAlign: "center", padding: 60, color: "var(--color-zoca-text-muted)" }}>
          {alerts.length === 0 ? "No alerts found in the last 24 hours" : "No alerts match your filters"}
        </div>
      ) : (
        <div className="zoca-tbl-wrap zoca-fade-in" style={{ "--fade-delay": "0.4s" } as React.CSSProperties}>
          <table className="zoca-tbl">
            <thead>
              <tr>
                <th style={{ width: 40, textAlign: "center" }}>
                  <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleAll} />
                </th>
                <th style={{ width: "24%" }}>Business</th>
                <th style={{ width: "13%" }}>AM</th>
                <th style={{ width: "9%" }}>Source</th>
                <th style={{ width: "12%" }}>Date</th>
                <th>Signal</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((alert, idx) => {
                const key = alertKey(alert, alerts.indexOf(alert));
                const risk = classifyRisk(alert.message_body, alert.subject);
                const isSelected = selected.has(key);
                return (
                  <tr key={key + idx} className={isSelected ? "selected" : ""} onClick={() => toggleRow(key)} style={{ cursor: "pointer" }}>
                    <td style={{ textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggleRow(key)} />
                    </td>
                    <td>
                      <span style={{ fontWeight: 700, color: "#fff", fontSize: 12.5 }}>{alert.business_name}</span>
                      <br />
                      <span className={`risk-pill ${risk.cls}`}>{risk.label}</span>
                    </td>
                    <td style={{ color: "var(--color-zoca-text-muted)", fontSize: 12 }}>{alert.am_name}</td>
                    <td><span className={`zoca-badge ${srcBadgeClass(alert.source)}`}>{alert.source}</span></td>
                    <td>
                      {formatDate(alert.message_date)}
                      <br />
                      <span style={{ fontSize: 10, color: "var(--color-zoca-text-soft)" }}>{alert.message_time}</span>
                    </td>
                    <td>
                      <div className="msg-text" style={{
                        display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const,
                        overflow: "hidden", lineHeight: 1.45, fontSize: 11.5, color: "var(--color-zoca-text-muted)",
                      }}>
                        {alert.message_body}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Toast */}
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}
    </>
  );
}

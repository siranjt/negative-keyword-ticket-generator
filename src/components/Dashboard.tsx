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

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

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
        if (
          !a.business_name.toLowerCase().includes(q) &&
          !a.message_body.toLowerCase().includes(q) &&
          !(a.sender || "").toLowerCase().includes(q)
        )
          return false;
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
      if (next.has(key)) next.delete(key);
      else next.add(key);
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
    <div className="wrap">
      {/* Header */}
      <header className="topbar">
        <div className="brand">
          <div className="title">
            Negative Keyword Alerts
            <span>Retention risk monitoring</span>
          </div>
        </div>
        <div className="top-meta">
          <span className="pill">
            <span className="dot" /> Live
          </span>
          <span className="pill">
            Last <b>24h</b>
          </span>
          {fetchedAt && (
            <span className="pill">
              Updated{" "}
              <b>
                {new Date(fetchedAt).toLocaleTimeString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </b>
            </span>
          )}
          <button className="btn pink" onClick={fetchAlerts} disabled={loading}>
            {loading ? (
              <>
                <span className="spinner" /> Refreshing...
              </>
            ) : (
              "Refresh data"
            )}
          </button>
        </div>
      </header>

      {/* KPI Cards */}
      <div className="kpis">
        <div className="kpi">
          <div className="lbl">Total alerts</div>
          <div className="val">{alerts.length}</div>
        </div>
        <div className="kpi">
          <div className="lbl">Businesses</div>
          <div className="val">{uniqueBusinesses}</div>
        </div>
        <div className="kpi">
          <div className="lbl">Cancellation intent</div>
          <div className={`val ${cancelCount > 0 ? "bad" : "ok"}`}>{cancelCount}</div>
        </div>
        <div className="kpi">
          <div className="lbl">Selected</div>
          <div className={`val ${selected.size > 0 ? "warn" : ""}`}>{selected.size}</div>
        </div>
      </div>

      {/* Actions */}
      <div className="actions-bar">
        <button
          className="btn primary"
          disabled={selected.size === 0 || creating}
          onClick={handleCreateTickets}
        >
          {creating ? (
            <>
              <span className="spinner" /> Creating...
            </>
          ) : (
            `Create tickets (${selected.size})`
          )}
        </button>
        <span className="sel-count">{selected.size} selected</span>
        <button className="link-btn" onClick={toggleAll}>
          {selected.size === filtered.length && filtered.length > 0 ? "Deselect all" : "Select all"}
        </button>
      </div>

      {/* Filters */}
      <div className="controls">
        <select value={filterAM} onChange={(e) => setFilterAM(e.target.value)}>
          <option value="">All AMs</option>
          {ams.map((am) => (
            <option key={am} value={am}>
              {am}
            </option>
          ))}
        </select>
        <select value={filterSource} onChange={(e) => setFilterSource(e.target.value)}>
          <option value="">All sources</option>
          {sources.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select value={filterDate} onChange={(e) => setFilterDate(e.target.value)}>
          <option value="">All dates</option>
          {dates.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Search business, message, sender..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--ink-dim)" }}>
          <span className="spinner" /> Loading alerts...
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--ink-dim)" }}>
          {alerts.length === 0
            ? "No alerts found in the last 24 hours"
            : "No alerts match your filters"}
        </div>
      ) : (
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 40, textAlign: "center" }}>
                  <input
                    type="checkbox"
                    checked={selected.size === filtered.length && filtered.length > 0}
                    onChange={toggleAll}
                  />
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
                  <tr
                    key={key + idx}
                    className={isSelected ? "selected" : ""}
                    onClick={() => toggleRow(key)}
                    style={{ cursor: "pointer" }}
                  >
                    <td style={{ textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleRow(key)}
                      />
                    </td>
                    <td>
                      <span className="biz-name">{alert.business_name}</span>
                      <br />
                      <span className={`risk-pill ${risk.cls}`}>{risk.label}</span>
                    </td>
                    <td style={{ color: "var(--ink-dim)", fontSize: 12 }}>{alert.am_name}</td>
                    <td>
                      <span className={`badge ${srcBadgeClass(alert.source)}`}>
                        {alert.source}
                      </span>
                    </td>
                    <td>
                      {formatDate(alert.message_date)}
                      <br />
                      <span style={{ fontSize: 10, color: "var(--ink-dimmer)" }}>
                        {alert.message_time}
                      </span>
                    </td>
                    <td>
                      <div className="msg-text">{alert.message_body}</div>
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
    </div>
  );
}

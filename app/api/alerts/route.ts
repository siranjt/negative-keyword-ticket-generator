import { NextResponse } from "next/server";
import Papa from "papaparse";

const CSV_URLS = [
  "https://metabase.zoca.ai/public/question/215cdd2c-a6a8-474a-ac16-f934f2dd0e1e.csv",
  "https://metabase.zoca.ai/public/question/40a7ee86-3998-48ae-b977-8369b108fa58.csv",
];

const MASTER_AM_URL =
  "https://metabase.zoca.ai/public/question/87763e8c-8084-442e-891a-df1b11e81b47.csv";

interface RawRow {
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

const RISK_MAP: { pattern: RegExp; label: string }[] = [
  { pattern: /cancel|cancell|remove.*zoca|stop.*service|end.*subscription/i, label: "Cancellation" },
  { pattern: /refund|charge|money|payment|billing|invoice|took.*money/i, label: "Billing" },
  { pattern: /lead|booking|spam|call.*quality|no.*result|roi/i, label: "Lead quality" },
  { pattern: /not.*work|bug|broken|issue|error|can.*see|not.*fix/i, label: "Technical" },
  { pattern: /disappoint|upset|unhappy|frustrated|terrible|worst|unacceptable/i, label: "Disappointed" },
];

function classifyRisk(msg: string, subject?: string): string {
  const text = `${subject || ""} ${msg}`.toLowerCase();
  for (const r of RISK_MAP) if (r.pattern.test(text)) return r.label;
  return "Flagged";
}

function analyze(msg: string, subject?: string, sender?: string, source?: string): string {
  const raw = (msg || "").trim();
  if (!raw) return "Empty message — no content to analyze.";
  const text = raw.replace(/\s+/g, " ");
  const lower = text.toLowerCase();
  const subj = (subject || "").toLowerCase();
  const parts: string[] = [];

  // ── Detect specific intents ──
  const wantsCancel = /cancel|cancell|end.*(?:account|subscription|service)|stop.*(?:service|subscription)|terminate/i.test(lower + " " + subj);
  const wantsRefund = /refund|money\s*back|took.*money|charge.*back|return.*money|give.*back/i.test(lower);
  const wantsRemoval = /remove.*zoca|remove.*(?:my|the)\s*(?:name|listing|account|profile)|take.*(?:down|off)/i.test(lower);
  const isUrgent = /immediately|asap|right now|urgent|today|right away/i.test(lower);
  const threatenBank = /call.*bank|dispute.*charge|chargeback|bank.*dispute/i.test(lower);
  const threatenLeave = /thinking.*(?:cancel|leav)|might.*(?:cancel|leav)|considering.*(?:cancel|switch)/i.test(lower);
  const noResults = /no.*(?:booking|lead|result|client|customer)|zero.*(?:booking|lead)|haven'?t.*(?:got|received|seen).*(?:anyone|anybody|lead|booking)/i.test(lower);
  const spamIssue = /spam|unknown.*call|unqualified|junk.*lead|fake.*lead/i.test(lower);
  const notWorking = /not.*work|doesn'?t.*work|broken|can'?t.*(?:see|access|use|log|open)|error|glitch|bug/i.test(lower);
  const priceIssue = /too.*(?:much|expensive)|overcharg|price|cost|afford/i.test(lower);
  const wrongSetup = /wrong|incorrect|still.*(?:saying|showing)|not.*(?:updated|changed|fixed|removed)/i.test(lower);
  const isStopSMS = /^stop$/i.test(raw.trim()) || (lower.includes("stop") && raw.trim().length < 15);
  const wantsListRemoval = /remove.*(?:from|off).*list|unsubscribe|opt.*out/i.test(lower);
  const isDisappointed = /disappoint|upset|frustrated|unhappy|angry|terrible|worst|unacceptable|ridiculous/i.test(lower);
  const missedPayment = /took.*(?:money|payment)|charged.*(?:again|already)|still.*(?:charging|taking|billing)|didn'?t.*(?:authorize|approve)/i.test(lower);
  const duplicateCharge = /double.*charge|charged.*twice|two.*charge|duplicate.*payment/i.test(lower);
  const meetingIssue = /meeting.*(?:didn'?t|not).*(?:work|connect|join)|link.*(?:didn'?t|not).*work|couldn'?t.*(?:join|connect|click)/i.test(lower);
  const websiteIssue = /website|web.*(?:site|page)|domain|landing.*page/i.test(lower + " " + subj);

  // ── Extract $ amounts if present ──
  const dollarMatch = text.match(/\$[\d,.]+/);
  const amountStr = dollarMatch ? ` (${dollarMatch[0]})` : "";

  // ── Build contextual analysis ──

  if (isStopSMS) {
    parts.push("Customer sent an SMS opt-out signal.");
    parts.push("This may indicate deeper dissatisfaction beyond just SMS preferences — AM should check account health proactively.");
    return parts.join(" ");
  }

  if (wantsListRemoval) {
    parts.push("Customer is requesting to be removed from contact/marketing lists.");
    parts.push("Verify whether this is a simple preference update or signals intent to disengage from Zoca entirely.");
    return parts.join(" ");
  }

  // Cancellation with context
  if (wantsCancel) {
    if (wantsRefund) {
      parts.push(`Customer is demanding both cancellation and a refund${amountStr}.`);
      parts.push(isUrgent ? "Marked as urgent — immediate AM escalation required before the customer initiates a chargeback." : "Billing team should process the refund while AM attempts retention.");
    } else if (noResults) {
      parts.push("Customer wants to cancel because they're not seeing results — no bookings or leads being generated.");
      parts.push("AM should present performance data and discuss optimization before processing cancellation.");
    } else if (websiteIssue) {
      parts.push("Customer is requesting cancellation along with website/domain removal.");
      parts.push("This appears to be a complete offboarding request — AM should attempt a save call before processing.");
    } else if (isUrgent) {
      parts.push("Customer is urgently requesting cancellation and expects same-day action.");
      parts.push("High churn risk — AM needs to reach out immediately, ideally by phone, to understand the root cause.");
    } else {
      parts.push("Customer has expressed intent to cancel their Zoca subscription.");
      parts.push(threatenLeave ? "Currently weighing the decision — there may be a retention window if AM acts quickly." : "AM should initiate a retention call to understand concerns and offer solutions.");
    }
    return parts.join(" ");
  }

  // Refund without cancellation
  if (wantsRefund || missedPayment || duplicateCharge) {
    if (threatenBank) {
      parts.push(`Customer is disputing a charge${amountStr} and threatening to contact their bank for a chargeback.`);
      parts.push("Critical: process refund immediately to avoid a formal dispute which carries additional fees and account risk.");
    } else if (duplicateCharge) {
      parts.push(`Customer reports being double-charged${amountStr}.`);
      parts.push("Billing team should verify transaction history and issue correction promptly — duplicate charges erode trust quickly.");
    } else if (missedPayment) {
      parts.push(`Customer says they were charged${amountStr} despite previously requesting service cancellation.`);
      parts.push("This suggests a process failure — verify cancellation was logged and process the refund to maintain goodwill.");
    } else {
      parts.push(`Customer is requesting a refund${amountStr}.`);
      parts.push("AM should review the billing history, understand the complaint, and coordinate with the billing team.");
    }
    return parts.join(" ");
  }

  // Lead/booking quality
  if (noResults || spamIssue) {
    if (spamIssue) {
      parts.push("Customer is receiving spam or unqualified leads instead of genuine bookings.");
      parts.push("This is a product quality issue — review the Win Agent/lead source configuration and filter settings for this account.");
    } else {
      parts.push("Customer reports zero bookings or leads over a sustained period and is questioning ROI.");
      parts.push("AM should pull the actual performance data, identify any configuration issues, and schedule a strategy review call.");
    }
    if (threatenLeave) parts[1] = parts[1].replace(/\.$/, "") + " — customer is considering cancellation if this isn't resolved.";
    return parts.join(" ");
  }

  // Technical issues
  if (notWorking || meetingIssue) {
    if (meetingIssue) {
      parts.push("Customer had trouble joining or connecting to a scheduled meeting/call.");
      parts.push("Resend the correct meeting link and follow up to reschedule — poor meeting experience damages AM trust.");
    } else if (websiteIssue && wrongSetup) {
      parts.push("Customer reports their website has incorrect information or changes haven't been applied.");
      parts.push("Verify the reported issue on the live site and push the fix — unresolved website issues directly impact their bookings.");
    } else if (wrongSetup) {
      parts.push("Customer says a previously requested change still hasn't been applied or is showing incorrectly.");
      parts.push("Check the change request history and apply the correction — repeated follow-ups on the same issue signal deteriorating trust.");
    } else {
      parts.push("Customer is reporting a technical issue that's blocking their ability to use Zoca services.");
      parts.push("Escalate to the technical team and confirm resolution with the customer — unresolved tech issues are a leading churn indicator.");
    }
    return parts.join(" ");
  }

  // Removal request
  if (wantsRemoval) {
    parts.push("Customer is asking to have Zoca branding or presence removed from their business profile.");
    parts.push("This typically precedes formal cancellation — AM should reach out to understand concerns and explore whether the relationship is salvageable.");
    return parts.join(" ");
  }

  // General disappointment
  if (isDisappointed) {
    parts.push("Customer is expressing strong dissatisfaction with Zoca's service delivery.");
    if (noResults) {
      parts[0] += " — specifically around lack of results and ROI.";
    }
    parts.push(threatenLeave ? "Customer is actively considering leaving — this requires urgent AM attention to prevent churn." : "AM should schedule a call to address concerns directly and rebuild confidence in the service.");
    return parts.join(" ");
  }

  // Price concern
  if (priceIssue) {
    parts.push("Customer has raised concerns about pricing or the cost-to-value ratio of Zoca services.");
    parts.push("AM should review their plan, demonstrate ROI with booking data, and discuss any available pricing options.");
    return parts.join(" ");
  }

  // Fallback — extract actual content
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 10);
  const firstMeaningful = sentences[0]?.trim() || text.slice(0, 120);
  const senderNote = sender && sender !== "Sent_By_Client" && sender !== "Received_By_Client" ? ` from ${sender}` : "";
  const sourceNote = source ? ` via ${source}` : "";

  parts.push(`Message received${senderNote}${sourceNote}: "${firstMeaningful.slice(0, 100)}${firstMeaningful.length > 100 ? "..." : ""}".`);
  parts.push("Flagged by negative keyword monitor — AM should review the full context and assess whether intervention is needed.");
  return parts.join(" ");
}

async function fetchCsv(url: string): Promise<RawRow[]> {
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) return [];
  const text = await res.text();
  const parsed = Papa.parse<RawRow>(text, { header: true, skipEmptyLines: true });
  return parsed.data;
}

function isWithin7Days(dateStr: string): boolean {
  try {
    const dt = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - dt.getTime();
    return diff >= 0 && diff <= 7 * 24 * 60 * 60 * 1000;
  } catch { return false; }
}

export async function GET() {
  try {
    const [rows1, rows2] = await Promise.all(CSV_URLS.map(fetchCsv));
    const allRows = [...rows1, ...rows2];
    const recent = allRows.filter((r) => r.message_date && isWithin7Days(r.message_date));
    const seen = new Set<string>();
    const deduped = recent.filter((r) => {
      const key = `${r.entity_id}::${(r.message_body || "").slice(0, 80)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    let masterAm: Record<string, string> = {};
    try {
      const amRes = await fetch(MASTER_AM_URL, { next: { revalidate: 0 } });
      if (amRes.ok) {
        const amText = await amRes.text();
        const amParsed = Papa.parse(amText, { header: true, skipEmptyLines: true });
        for (const row of amParsed.data as Record<string, string>[]) {
          if (row.entity_id && row.am_name) masterAm[row.entity_id] = row.am_name;
        }
      }
    } catch { /* optional */ }

    const enriched = deduped.map((r) => ({
      entity_id: r.entity_id,
      business_name: r.business_name,
      am_name: r.am_name || masterAm[r.entity_id] || "Unknown",
      message_body: r.message_body,
      subject: r.subject || "",
      message_date: r.message_date,
      message_time: r.message_time,
      sender: r.sender,
      source: r.source,
      category: classifyRisk(r.message_body, r.subject),
      analysis: analyze(r.message_body, r.subject, r.sender, r.source),
    }));

    enriched.sort((a, b) => {
      const da = `${a.message_date} ${a.message_time}`;
      const db = `${b.message_date} ${b.message_time}`;
      return db.localeCompare(da);
    });

    return NextResponse.json({
      alerts: enriched,
      fetchedAt: new Date().toISOString(),
      totalRaw: allRows.length,
      duplicatesRemoved: recent.length - deduped.length,
    });
  } catch (err) {
    console.error("Error fetching alerts:", err);
    return NextResponse.json({ alerts: [], error: "Failed to fetch data" }, { status: 500 });
  }
}

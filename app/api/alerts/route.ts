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

function summarize(msg: string, subject?: string): string {
  const text = (msg || "").trim();
  if (!text) return "No message content available.";
  const subjectHint = subject ? `Re: "${subject}". ` : "";
  const lower = text.toLowerCase();
  if (/cancel/i.test(lower)) return `${subjectHint}Customer is requesting cancellation of their Zoca account or services. Immediate AM intervention recommended.`;
  if (/refund|money.*back|took.*money|charge/i.test(lower)) return `${subjectHint}Customer is demanding a refund or disputing charges. Billing escalation needed urgently.`;
  if (/spam|no.*lead|no.*booking|unqualified/i.test(lower)) return `${subjectHint}Customer is dissatisfied with lead quality or lack of bookings. Performance review with AM needed.`;
  if (/not.*work|broken|bug|issue/i.test(lower)) return `${subjectHint}Customer is reporting a technical issue with Zoca services. Technical support escalation required.`;
  if (/disappoint|upset|unhappy|frustrated/i.test(lower)) return `${subjectHint}Customer is expressing general dissatisfaction with Zoca services. Proactive outreach from AM recommended.`;
  if (/stop/i.test(lower) && lower.length < 20) return `${subjectHint}Customer sent a stop/unsubscribe signal. Review communication preferences and check for deeper issues.`;
  if (/remove/i.test(lower)) return `${subjectHint}Customer is requesting removal from Zoca platform or communications. Review account status with AM.`;
  const firstSentence = text.replace(/\s+/g, " ").split(/[.!?]/)[0]?.trim() || text.slice(0, 100);
  return `${subjectHint}${firstSentence}. Review the full message for context and determine appropriate AM response.`;
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
      analysis: summarize(r.message_body, r.subject),
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

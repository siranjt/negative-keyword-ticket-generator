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

async function fetchCsv(url: string): Promise<RawRow[]> {
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) return [];
  const text = await res.text();
  const parsed = Papa.parse<RawRow>(text, { header: true, skipEmptyLines: true });
  return parsed.data;
}

function isWithin24Hours(dateStr: string, timeStr: string): boolean {
  try {
    const dt = new Date(`${dateStr} ${timeStr}`);
    const now = new Date();
    const diff = now.getTime() - dt.getTime();
    return diff >= 0 && diff <= 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export async function GET() {
  try {
    const [rows1, rows2] = await Promise.all(CSV_URLS.map(fetchCsv));

    const allRows = [...rows1, ...rows2];

    // Filter to last 24 hours
    const recent = allRows.filter((r) =>
      r.message_date && r.message_time && isWithin24Hours(r.message_date, r.message_time)
    );

    // Deduplicate by entity_id + message_body (first 80 chars)
    const seen = new Set<string>();
    const deduped = recent.filter((r) => {
      const key = `${r.entity_id}::${(r.message_body || "").slice(0, 80)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Fetch master AM for enrichment
    let masterAm: Record<string, string> = {};
    try {
      const amRes = await fetch(MASTER_AM_URL, { next: { revalidate: 0 } });
      if (amRes.ok) {
        const amText = await amRes.text();
        const amParsed = Papa.parse(amText, { header: true, skipEmptyLines: true });
        for (const row of amParsed.data as Record<string, string>[]) {
          if (row.entity_id && row.am_name) {
            masterAm[row.entity_id] = row.am_name;
          }
        }
      }
    } catch {
      // Master AM enrichment is optional
    }

    // Enrich AM names from master if missing
    const enriched = deduped.map((r) => ({
      ...r,
      am_name: r.am_name || masterAm[r.entity_id] || "Unknown",
    }));

    // Sort by date desc, time desc
    enriched.sort((a, b) => {
      const da = `${a.message_date} ${a.message_time}`;
      const db = `${b.message_date} ${b.message_time}`;
      return db.localeCompare(da);
    });

    return NextResponse.json({ alerts: enriched, fetchedAt: new Date().toISOString() });
  } catch (err) {
    console.error("Error fetching alerts:", err);
    return NextResponse.json({ alerts: [], error: "Failed to fetch data" }, { status: 500 });
  }
}

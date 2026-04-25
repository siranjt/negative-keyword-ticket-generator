import { NextResponse } from "next/server";

const LINEAR_API = "https://api.linear.app/graphql";
const TICKET_TITLE = "\u{1F6A8} RETENTION RISK ALERT \u{1F6A8}";

async function gql(query: string) {
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) throw new Error("LINEAR_API_KEY not set");

  const res = await fetch(LINEAR_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: apiKey },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) throw new Error(`Linear API HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data;
}

export async function GET() {
  try {
    // Fetch all Retention Risk Alert tickets from Finance team, last 30 days
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const data = await gql(`{
      issues(
        filter: {
          team: { name: { eq: "Finance" } },
          title: { eq: "${TICKET_TITLE.replace(/"/g, '\\"')}" },
          createdAt: { gte: "${since}" }
        },
        orderBy: createdAt,
        first: 100
      ) {
        nodes {
          id
          identifier
          url
          status { name type }
          assignee { name }
          createdAt
          description
          customerNeeds { nodes { customer { name } } }
        }
      }
    }`);

    const tickets = (data.issues?.nodes || []).map((t: {
      identifier: string;
      url: string;
      status: { name: string; type: string };
      assignee: { name: string } | null;
      createdAt: string;
      description: string;
      customerNeeds: { nodes: { customer: { name: string } }[] };
    }) => {
      // Extract business name from description
      const bizMatch = t.description?.match(/Business:\s*(.+)/);
      const biz = bizMatch?.[1]?.trim() || t.customerNeeds?.nodes?.[0]?.customer?.name?.split(" | ")?.[0] || "Unknown";

      // Extract category from description
      const catMatch = t.description?.match(/Risk Category:\s*(.+)/);
      const category = catMatch?.[1]?.trim() || "—";

      // Extract date from description
      const dateMatch = t.description?.match(/Date:\s*(\S+)/);
      const alertDate = dateMatch?.[1]?.trim() || "—";

      return {
        ticketId: t.identifier,
        url: t.url,
        business: biz,
        am: t.assignee?.name || "Unassigned",
        category,
        alertDate,
        status: t.status?.name || "Unknown",
        statusType: t.status?.type || "unstarted",
        createdAt: t.createdAt,
      };
    });

    // Sort newest first
    tickets.sort((a: { createdAt: string }, b: { createdAt: string }) => b.createdAt.localeCompare(a.createdAt));

    return NextResponse.json({ tickets });
  } catch (err) {
    console.error("Error fetching created tickets:", err);
    return NextResponse.json({ tickets: [], error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

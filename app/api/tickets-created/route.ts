import { NextResponse } from "next/server";

const LINEAR_API = "https://api.linear.app/graphql";
const FINANCE_TEAM_ID = "10848e63-4beb-4096-a505-a2f928e95eb9";

export async function GET() {
  try {
    const apiKey = process.env.LINEAR_API_KEY;
    if (!apiKey) return NextResponse.json({ tickets: [], error: "LINEAR_API_KEY not set" }, { status: 500 });

    const query = `{
      issues(
        filter: { team: { id: { eq: "${FINANCE_TEAM_ID}" } } }
        orderBy: createdAt
        first: 250
      ) {
        nodes {
          identifier
          title
          url
          description
          createdAt
          assignee { name }
          state { name type }
          needs: formerNeeds { nodes { customer { name } } }
        }
      }
    }`;

    const res = await fetch(LINEAR_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: apiKey },
      body: JSON.stringify({ query }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json({ tickets: [], error: `Linear HTTP ${res.status}: ${text.slice(0, 200)}` }, { status: 500 });
    }

    const json = await res.json();
    if (json.errors?.length) {
      return NextResponse.json({ tickets: [], error: json.errors[0].message }, { status: 500 });
    }

    const allIssues = json.data?.issues?.nodes || [];

    const openStates = new Set(["Todo", "In Progress", "In Review"]);

    const tickets = allIssues
      .filter((t: { title: string; state: { name: string } | null }) =>
        t.title && t.title.includes("RETENTION RISK ALERT") &&
        t.state && openStates.has(t.state.name)
      )
      .map((t: {
        identifier: string; url: string; description: string | null; createdAt: string;
        assignee: { name: string } | null;
        state: { name: string; type: string } | null;
        needs: { nodes: { customer: { name: string } }[] } | null;
      }) => {
        const desc = t.description || "";
        const bizMatch = desc.match(/Business:\s*(.+)/);
        const biz = bizMatch?.[1]?.trim() || t.needs?.nodes?.[0]?.customer?.name?.split(" | ")?.[0] || "Unknown";
        const catMatch = desc.match(/Risk Category:\s*(.+)/);
        const category = catMatch?.[1]?.trim() || "\u2014";
        const dateMatch = desc.match(/Date:\s*(\S+)/);
        const alertDate = dateMatch?.[1]?.trim() || "\u2014";

        return {
          ticketId: t.identifier,
          url: t.url,
          business: biz,
          am: t.assignee?.name || "Unassigned",
          category,
          alertDate,
          status: t.state?.name || "Unknown",
          statusType: t.state?.type || "unstarted",
          createdAt: t.createdAt,
        };
      });

    tickets.sort((a: { createdAt: string }, b: { createdAt: string }) => b.createdAt.localeCompare(a.createdAt));

    return NextResponse.json({ tickets, total: tickets.length });
  } catch (err) {
    return NextResponse.json({ tickets: [], error: err instanceof Error ? err.message : "Unknown" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";

const LINEAR_API = "https://api.linear.app/graphql";
const FINANCE_TEAM_ID = "10848e63-4beb-4096-a505-a2f928e95eb9";

export async function GET() {
  try {
    const apiKey = process.env.LINEAR_API_KEY;
    if (!apiKey) return NextResponse.json({ tickets: [], error: "LINEAR_API_KEY not set" }, { status: 500 });

    const res = await fetch(LINEAR_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: apiKey },
      body: JSON.stringify({
        query: `query($teamId: ID!, $first: Int!) {
          issues(filter: { team: { id: { eq: $teamId } } }, orderBy: createdAt, first: $first) {
            nodes {
              identifier title url description createdAt
              assignee { name }
              state { name type }
              customerNeeds { nodes { customer { name } } }
            }
          }
        }`,
        variables: { teamId: FINANCE_TEAM_ID, first: 250 }
      }),
    });

    if (!res.ok) {
      return NextResponse.json({ tickets: [], error: `Linear HTTP ${res.status}` }, { status: 500 });
    }

    const json = await res.json();
    if (json.errors?.length) {
      return NextResponse.json({ tickets: [], error: json.errors[0].message }, { status: 500 });
    }

    const allIssues = json.data?.issues?.nodes || [];

    // Client-side filter: RETENTION RISK ALERT + open states only (Todo, In Progress, In Review — NOT Backlog)
    const openStates = new Set(["Todo", "In Progress", "In Review"]);

    const tickets = allIssues
      .filter((t: { title: string; state: { name: string } | null }) =>
        t.title.includes("RETENTION RISK ALERT") &&
        openStates.has(t.state?.name || "")
      )
      .map((t: {
        identifier: string; url: string; description: string | null; createdAt: string;
        assignee: { name: string } | null;
        state: { name: string; type: string } | null;
        customerNeeds: { nodes: { customer: { name: string } }[] } | null;
      }) => {
        const desc = t.description || "";
        const bizMatch = desc.match(/Business:\s*(.+)/);
        const biz = bizMatch?.[1]?.trim() || t.customerNeeds?.nodes?.[0]?.customer?.name?.split(" | ")?.[0] || "Unknown";
        const catMatch = desc.match(/Risk Category:\s*(.+)/);
        const category = catMatch?.[1]?.trim() || "—";
        const dateMatch = desc.match(/Date:\s*(\S+)/);
        const alertDate = dateMatch?.[1]?.trim() || "—";

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

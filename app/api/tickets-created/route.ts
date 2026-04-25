import { NextResponse } from "next/server";

const LINEAR_API = "https://api.linear.app/graphql";

async function linearFetch(query: string) {
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) throw new Error("LINEAR_API_KEY not set");

  const res = await fetch(LINEAR_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: apiKey },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Linear HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data;
}

export async function GET() {
  try {
    // Simple approach: search issues on Finance team, filter client-side
    const data = await linearFetch(`{
      team(id: "Finance") {
        id
      }
    }`);

    // Get team ID first
    let teamId = data?.team?.id;
    if (!teamId) {
      const teamsData = await linearFetch(`{ teams { nodes { id name } } }`);
      const team = teamsData.teams.nodes.find((t: { name: string }) => t.name.toLowerCase() === "finance");
      if (!team) throw new Error("Finance team not found");
      teamId = team.id;
    }

    // Fetch open issues from Finance team (Todo, In Progress, In Review only)
    const issuesData = await linearFetch(`{
      issues(
        filter: {
          team: { id: { eq: "${teamId}" } },
          state: { type: { in: ["unstarted", "started"] } }
        },
        orderBy: createdAt,
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
          customerNeeds {
            nodes {
              customer { name }
            }
          }
        }
      }
    }`);

    const allIssues = issuesData?.issues?.nodes || [];

    // Filter client-side for RETENTION RISK ALERT tickets from last 30 days
    const since = Date.now() - 30 * 24 * 60 * 60 * 1000;

    const tickets = allIssues
      .filter((t: { title: string; createdAt: string }) =>
        t.title.includes("RETENTION RISK ALERT") &&
        new Date(t.createdAt).getTime() > since
      )
      .map((t: {
        identifier: string;
        url: string;
        description: string;
        createdAt: string;
        assignee: { name: string } | null;
        state: { name: string; type: string } | null;
        customerNeeds: { nodes: { customer: { name: string } }[] };
      }) => {
        const bizMatch = t.description?.match(/Business:\s*(.+)/);
        const biz = bizMatch?.[1]?.trim() ||
          t.customerNeeds?.nodes?.[0]?.customer?.name?.split(" | ")?.[0] ||
          "Unknown";

        const catMatch = t.description?.match(/Risk Category:\s*(.+)/);
        const category = catMatch?.[1]?.trim() || "—";

        const dateMatch = t.description?.match(/Date:\s*(\S+)/);
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

    // Sort newest first
    tickets.sort((a: { createdAt: string }, b: { createdAt: string }) =>
      b.createdAt.localeCompare(a.createdAt)
    );

    return NextResponse.json({ tickets, total: tickets.length });
  } catch (err) {
    console.error("Error fetching tickets:", err);
    return NextResponse.json(
      { tickets: [], error: err instanceof Error ? err.message : "Failed to fetch tickets" },
      { status: 500 }
    );
  }
}

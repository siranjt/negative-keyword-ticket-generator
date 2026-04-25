import { NextResponse } from "next/server";

const LINEAR_API = "https://api.linear.app/graphql";

async function linearFetch(query: string) {
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) return { error: "LINEAR_API_KEY not set" };

  const res = await fetch(LINEAR_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: apiKey },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) return { error: `HTTP ${res.status}` };
  const json = await res.json();
  if (json.errors?.length) return { error: json.errors[0].message };
  return json.data;
}

export async function GET() {
  try {
    // Step 1: Get Finance team ID
    const teamsData = await linearFetch(`{ teams { nodes { id name } } }`) as { teams?: { nodes: { id: string; name: string }[] }; error?: string };
    if ("error" in teamsData && teamsData.error) {
      return NextResponse.json({ tickets: [], error: teamsData.error }, { status: 500 });
    }
    const financeTeam = (teamsData as { teams: { nodes: { id: string; name: string }[] } }).teams.nodes.find(
      (t) => t.name.toLowerCase() === "finance"
    );
    if (!financeTeam) {
      return NextResponse.json({ tickets: [], error: "Finance team not found" }, { status: 500 });
    }

    // Step 2: Fetch open issues (Todo + In Progress + In Review) from Finance team
    const issuesData = await linearFetch(`{
      issues(
        filter: {
          team: { id: { eq: "${financeTeam.id}" } }
          state: { type: { in: ["unstarted", "started"] } }
        }
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
          customerNeeds {
            nodes {
              customer { name }
            }
          }
        }
      }
    }`) as { issues?: { nodes: Record<string, unknown>[] }; error?: string };

    if ("error" in issuesData && issuesData.error) {
      return NextResponse.json({ tickets: [], error: issuesData.error }, { status: 500 });
    }

    const allIssues = ((issuesData as { issues: { nodes: Record<string, unknown>[] } }).issues?.nodes || []) as {
      identifier: string;
      title: string;
      url: string;
      description: string | null;
      createdAt: string;
      assignee: { name: string } | null;
      state: { name: string; type: string } | null;
      customerNeeds: { nodes: { customer: { name: string } }[] } | null;
    }[];

    // Step 3: Filter for RETENTION RISK ALERT tickets only
    const tickets = allIssues
      .filter((t) => t.title && t.title.includes("RETENTION RISK ALERT"))
      .map((t, i) => {
        const desc = t.description || "";
        const bizMatch = desc.match(/Business:\s*(.+)/);
        const biz = bizMatch?.[1]?.trim() ||
          t.customerNeeds?.nodes?.[0]?.customer?.name?.split(" | ")?.[0] ||
          "Unknown";

        const catMatch = desc.match(/Risk Category:\s*(.+)/);
        const category = catMatch?.[1]?.trim() || "—";

        const dateMatch = desc.match(/Date:\s*(\S+)/);
        const alertDate = dateMatch?.[1]?.trim() || "—";

        return {
          index: i + 1,
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
    tickets.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return NextResponse.json({ tickets, total: tickets.length });
  } catch (err) {
    return NextResponse.json(
      { tickets: [], error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

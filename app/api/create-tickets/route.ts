import { NextRequest, NextResponse } from "next/server";

const LINEAR_API = "https://api.linear.app/graphql";
const TICKET_TITLE = "\u{1F6A8} RETENTION RISK ALERT \u{1F6A8}";
const TEMPLATE_ID = "ee431300-ce89-4f63-95d9-fef0e7d6c722";

interface AlertItem {
  entity_id: string;
  business_name: string;
  am_name: string;
  message_body: string;
  source: string;
  message_date: string;
  message_time: string;
  risk_category: string;
}

// ── Linear GraphQL helper ──
async function gql(query: string, variables: Record<string, unknown> = {}) {
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) throw new Error("LINEAR_API_KEY not set in environment variables");

  const res = await fetch(LINEAR_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: apiKey },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Linear API HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data;
}

// ── Build template description with Detailed Churn Risk Reason filled ──
function buildDescription(a: AlertItem): string {
  const reason = `Business: ${a.business_name}\nEntity ID: ${a.entity_id}\nAM: ${a.am_name}\nRisk Category: ${a.risk_category}\nSource: ${a.source}\nDate: ${a.message_date} ${a.message_time}\n\nSignal:\n${a.message_body.slice(0, 500)}\n\n(Created from Negative Keyword Alert Dashboard)`;

  const catMap: Record<string, string[]> = {
    "Lead quality": ["Leads velocity", "Leads Quality"],
    Cancellation: ["Unresponsive"],
    Billing: ["Missed payment"],
    Technical: ["Optimizing issues"],
    Disappointed: ["Pending actionable from team - delayed response"],
  };
  const ticked = new Set(catMap[a.risk_category] || []);
  const allCats = [
    "GBP unverified", "GBP post", "No manager access", "Returning leads",
    "Leads velocity", "Leads Quality", "Keyword mismatch", "Optimizing issues",
    "Website not published", "Does not like the website flow",
    "Pending actionable from team - delayed response", "Financial crisis",
    "Unresponsive", "Missed payment", "Social media", "Win", "Closing the business",
  ];
  const checklist = allCats.map((c) => `- [${ticked.has(c) ? "X" : " "}] ${c}`).join("\n");

  return `**Detailed Churn Risk Reason** :\n${reason}\n\n**Churn Risk Reason category** :\n\n${checklist}\n\n**First Dissatisfaction date :** ${a.message_date}\n\n**What are the actionable done so far :**\n\n**Was the churn prevention done earlier:**\n\n- [ ] Yes\n- [ ] No\n\n**Churn prevention call scheduled:**\n\n- [ ] Yes\n- [ ] No\n\n**Detailed Conclusion of the call:**\n\n`;
}

// ── Cached lookups ──
let _teamId: string | null = null;
let _todoId: string | null = null;

async function getTeamId() {
  if (_teamId) return _teamId;
  const d = await gql(`{ teams { nodes { id name } } }`);
  const t = d.teams.nodes.find((x: { name: string }) => x.name.toLowerCase() === "finance");
  if (!t) throw new Error("Finance team not found in Linear");
  _teamId = t.id;
  return t.id as string;
}

async function getTodoId(teamId: string) {
  if (_todoId) return _todoId;
  const d = await gql(`query { workflowStates(filter: { team: { id: { eq: "${teamId}" } }, name: { eq: "Todo" } }, first: 1) { nodes { id } } }`);
  if (!d.workflowStates?.nodes?.length) throw new Error("Todo state not found");
  _todoId = d.workflowStates.nodes[0].id;
  return _todoId as string;
}

async function findUser(name: string): Promise<string | null> {
  const d = await gql(`query { users(filter: { name: { containsIgnoreCase: "${name.split(" ")[0].replace(/"/g, "")}" } }, first: 3) { nodes { id name } } }`);
  return d.users?.nodes?.[0]?.id || null;
}

async function findCustomer(biz: string): Promise<string | null> {
  const d = await gql(`query { customers(filter: { name: { containsIgnoreCase: "${biz.replace(/"/g, "")}" } }, first: 3) { nodes { id } } }`);
  return d.customers?.nodes?.[0]?.id || null;
}

async function hasDuplicate(teamId: string, entityId: string): Promise<boolean> {
  const d = await gql(`query {
    issues(filter: {
      team: { id: { eq: "${teamId}" } },
      title: { eq: "${TICKET_TITLE.replace(/"/g, '\\"')}" },
      description: { contains: "${entityId}" },
      state: { type: { in: ["unstarted", "started", "backlog"] } }
    }, first: 3) { nodes { id } }
  }`);
  return (d.issues?.nodes?.length || 0) > 0;
}

// ── Main handler ──
export async function POST(req: NextRequest) {
  _teamId = null;
  _todoId = null;

  try {
    const body = await req.json();
    const alerts: AlertItem[] = body.alerts || [];
    if (!alerts.length) return NextResponse.json({ error: "No alerts" }, { status: 400 });

    const teamId = await getTeamId();
    const todoId = await getTodoId(teamId);

    const results: { business: string; ticketId: string; url: string; skipped: boolean; error?: string }[] = [];

    for (const a of alerts) {
      try {
        // RULE 4: Dedup
        if (await hasDuplicate(teamId, a.entity_id)) {
          results.push({ business: a.business_name, ticketId: "", url: "", skipped: true });
          continue;
        }

        // RULE 3: Customer UUID — MANDATORY
        const custId = await findCustomer(a.business_name);
        if (!custId) {
          results.push({ business: a.business_name, ticketId: "", url: "", skipped: false, error: `Customer "${a.business_name}" not found in Linear — cannot create without customer link` });
          continue;
        }

        // RULE 6: AM lookup
        const amId = await findUser(a.am_name);

        // RULES 1,2,5,7: Create ticket — exact title, template ID, filled description, Todo, assigned
        const desc = buildDescription(a);

        const mutation = `mutation {
          issueCreate(input: {
            teamId: "${teamId}"
            title: "${TICKET_TITLE.replace(/"/g, '\\"')}"
            templateId: "${TEMPLATE_ID}"
            lastAppliedTemplateId: "${TEMPLATE_ID}"
            description: ${JSON.stringify(desc)}
            stateId: "${todoId}"
            priority: 1
            ${amId ? `assigneeId: "${amId}"` : ""}
          }) {
            success
            issue { id identifier url }
          }
        }`;

        const cd = await gql(mutation);
        if (!cd.issueCreate?.success) throw new Error("issueCreate failed");
        const issue = cd.issueCreate.issue;

        // RULE 3: Link customer request — MANDATORY
        await gql(`mutation {
          customerNeedCreate(input: {
            issueId: "${issue.id}"
            customerId: "${custId}"
            body: ${JSON.stringify(`Retention risk: ${a.risk_category}\nBusiness: ${a.business_name}\nEntity ID: ${a.entity_id}\nAM: ${a.am_name}\nSource: ${a.source}\nDate: ${a.message_date} ${a.message_time}\n\nSignal:\n${a.message_body.slice(0, 400)}`)}
          }) { success }
        }`);

        results.push({ business: a.business_name, ticketId: issue.identifier, url: issue.url, skipped: false });
      } catch (err) {
        results.push({ business: a.business_name, ticketId: "", url: "", skipped: false, error: err instanceof Error ? err.message : "Unknown error" });
      }
    }

    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Server error" }, { status: 500 });
  }
}

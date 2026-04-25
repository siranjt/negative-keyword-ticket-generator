import { NextRequest, NextResponse } from "next/server";

const LINEAR_API = "https://api.linear.app/graphql";

// MANDATORY: Title must NEVER be changed.
const TICKET_TITLE = "\u{1F6A8} RETENTION RISK ALERT \u{1F6A8}";

// MANDATORY: Always create tickets under this template ID.
const TEMPLATE_ID = "ee431300-ce89-4f63-95d9-fef0e7d6c722";

// Hardcoded template content from FIN-3873 — the canonical template.
// The "Detailed Churn Risk Reason" section gets filled per-alert.
// Everything else stays EXACTLY as-is.
function buildDescription(alert: AlertItem): string {
  const reason = `Business: ${alert.business_name}
Entity ID: ${alert.entity_id}
AM: ${alert.am_name}
Risk Category: ${alert.risk_category}
Source: ${alert.source}
Date: ${alert.message_date} ${alert.message_time}

Signal:
${alert.message_body.slice(0, 500)}

(Created from Negative Keyword Alert Dashboard)`;

  // Map risk_category to checklist ticks
  const cats: Record<string, string[]> = {
    "Lead quality": ["Leads velocity", "Leads Quality"],
    "Cancellation": ["Unresponsive"],
    "Billing": ["Missed payment"],
    "Technical": ["Optimizing issues"],
    "Disappointed": ["Pending actionable from team - delayed response"],
    "Flagged": [],
  };
  const ticked = new Set(cats[alert.risk_category] || []);

  const allCats = [
    "GBP unverified", "GBP post", "No manager access", "Returning leads",
    "Leads velocity", "Leads Quality", "Keyword mismatch", "Optimizing issues",
    "Website not published", "Does not like the website flow",
    "Pending actionable from team - delayed response", "Financial crisis",
    "Unresponsive", "Missed payment", "Social media", "Win", "Closing the business",
  ];

  const checklist = allCats.map((c) => `- [${ticked.has(c) ? "X" : " "}] ${c}`).join("\n");

  return `**Detailed Churn Risk Reason** :
${reason}

**Churn Risk Reason category** :

${checklist}

**First Dissatisfaction date :** ${alert.message_date}

**What are the actionable done so far :**

**Was the churn prevention done earlier:**

- [ ] Yes
- [ ] No

**Churn prevention call scheduled:**

- [ ] Yes
- [ ] No

**Detailed Conclusion of the call:**


`;
}

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

async function linearQuery(query: string, variables: Record<string, unknown> = {}) {
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) throw new Error("LINEAR_API_KEY not configured");

  const res = await fetch(LINEAR_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ query, variables }),
  });

  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0]?.message || "Linear API error");
  return json.data;
}

// Cache these lookups per request
let cachedTeamId: string | null = null;
let cachedTodoStateId: string | null = null;

async function getFinanceTeamId(): Promise<string> {
  if (cachedTeamId) return cachedTeamId;
  const data = await linearQuery(`query { teams { nodes { id name } } }`);
  const team = data.teams.nodes.find((t: { name: string }) => t.name.toLowerCase() === "finance");
  if (!team) throw new Error("Finance team not found");
  cachedTeamId = team.id;
  return team.id;
}

async function getTodoStateId(teamId: string): Promise<string> {
  if (cachedTodoStateId) return cachedTodoStateId;
  const data = await linearQuery(
    `query($teamId: String!) {
      workflowStates(filter: { team: { id: { eq: $teamId } }, name: { eq: "Todo" } }, first: 1) {
        nodes { id name }
      }
    }`,
    { teamId }
  );
  const states = data.workflowStates?.nodes || [];
  if (states.length === 0) throw new Error("Todo state not found for Finance team");
  cachedTodoStateId = states[0].id;
  return states[0].id;
}

async function findAMUserId(amName: string): Promise<string | null> {
  const firstName = amName.split(" ")[0];
  const data = await linearQuery(
    `query($q: String!) {
      users(filter: { name: { containsIgnoreCase: $q } }, first: 5) {
        nodes { id name }
      }
    }`,
    { q: firstName }
  );
  const users = data.users?.nodes || [];
  return users.length > 0 ? users[0].id : null;
}

async function findCustomerUUID(businessName: string): Promise<string | null> {
  const data = await linearQuery(
    `query($q: String!) {
      customers(filter: { name: { containsIgnoreCase: $q } }, first: 5) {
        nodes { id name }
      }
    }`,
    { q: businessName }
  );
  const customers = data.customers?.nodes || [];
  return customers.length > 0 ? customers[0].id : null;
}

async function checkExistingTicket(teamId: string, entityId: string): Promise<boolean> {
  const data = await linearQuery(
    `query($teamId: String!, $title: String!, $entityId: String!) {
      issues(filter: {
        team: { id: { eq: $teamId } },
        title: { eq: $title },
        description: { contains: $entityId },
        state: { type: { in: ["unstarted", "started", "backlog"] } }
      }, first: 5) {
        nodes { id identifier }
      }
    }`,
    { teamId, title: TICKET_TITLE, entityId }
  );
  return (data.issues?.nodes?.length || 0) > 0;
}

export async function POST(req: NextRequest) {
  // Reset caches per request
  cachedTeamId = null;
  cachedTodoStateId = null;

  try {
    const { alerts } = (await req.json()) as { alerts: AlertItem[] };
    if (!alerts || alerts.length === 0) {
      return NextResponse.json({ error: "No alerts provided" }, { status: 400 });
    }

    const teamId = await getFinanceTeamId();
    const todoStateId = await getTodoStateId(teamId);

    const results: {
      business: string;
      ticketId: string;
      url: string;
      skipped: boolean;
      error?: string;
    }[] = [];

    for (const alert of alerts) {
      try {
        // ── RULE 4: Dedup check ──
        const exists = await checkExistingTicket(teamId, alert.entity_id);
        if (exists) {
          results.push({ business: alert.business_name, ticketId: "", url: "", skipped: true });
          continue;
        }

        // ── RULE 3: Find customer UUID — MANDATORY, block if not found ──
        const custUUID = await findCustomerUUID(alert.business_name);
        if (!custUUID) {
          results.push({
            business: alert.business_name, ticketId: "", url: "", skipped: false,
            error: `Customer "${alert.business_name}" not found in Linear. Cannot create ticket without customer link.`,
          });
          continue;
        }

        // ── RULE 6: Find AM user ID for assignment ──
        const amUserId = await findAMUserId(alert.am_name);

        // ── RULES 1, 2, 5, 6, 7: Create ticket with exact title, template ID, description, Todo status, AM assignment ──
        const description = buildDescription(alert);

        const createVars: Record<string, unknown> = {
          teamId,
          title: TICKET_TITLE,
          templateId: TEMPLATE_ID,
          lastAppliedTemplateId: TEMPLATE_ID,
          description,
          stateId: todoStateId,
          priority: 1,
        };
        if (amUserId) createVars.assigneeId = amUserId;

        const createData = await linearQuery(
          `mutation($teamId: String!, $title: String!, $templateId: String!, $lastAppliedTemplateId: String!, $description: String!, $stateId: String!, $priority: Int!${amUserId ? ", $assigneeId: String!" : ""}) {
            issueCreate(input: {
              teamId: $teamId,
              title: $title,
              templateId: $templateId,
              lastAppliedTemplateId: $lastAppliedTemplateId,
              description: $description,
              stateId: $stateId,
              priority: $priority
              ${amUserId ? "assigneeId: $assigneeId" : ""}
            }) {
              success
              issue { id identifier url }
            }
          }`,
          createVars
        );

        if (!createData.issueCreate?.success) {
          throw new Error("Linear issueCreate returned success=false");
        }

        const issue = createData.issueCreate.issue;

        // ── Add Churn label ──
        try {
          await linearQuery(
            `mutation($id: String!, $labels: [String!]!) {
              issueUpdate(id: $id, input: { labelIds: $labels }) { success }
            }`,
            { id: issue.id, labels: [] }
          );
        } catch { /* label is optional */ }

        // ── RULE 3: Link customer request — MANDATORY ──
        await linearQuery(
          `mutation($issueId: String!, $customerId: String!, $body: String!) {
            customerNeedCreate(input: {
              issueId: $issueId,
              customerId: $customerId,
              body: $body
            }) { success }
          }`,
          {
            issueId: issue.id,
            customerId: custUUID,
            body: `Retention risk detected via negative keyword alert.\n\nBusiness: ${alert.business_name}\nEntity ID: ${alert.entity_id}\nAM: ${alert.am_name}\nCategory: ${alert.risk_category}\nSource: ${alert.source}\nDate: ${alert.message_date} ${alert.message_time}\n\nSignal:\n${alert.message_body.slice(0, 400)}`,
          }
        );

        results.push({
          business: alert.business_name,
          ticketId: issue.identifier,
          url: issue.url,
          skipped: false,
        });
      } catch (err) {
        results.push({
          business: alert.business_name, ticketId: "", url: "", skipped: false,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    return NextResponse.json({ results });
  } catch (err) {
    console.error("Ticket creation error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server error" },
      { status: 500 }
    );
  }
}

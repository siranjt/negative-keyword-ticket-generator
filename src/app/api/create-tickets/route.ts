import { NextRequest, NextResponse } from "next/server";

const LINEAR_API = "https://api.linear.app/graphql";

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
    headers: {
      "Content-Type": "application/json",
      Authorization: apiKey,
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0]?.message || "Linear API error");
  return json.data;
}

async function getFinanceTeamId(): Promise<string> {
  const data = await linearQuery(`
    query { teams { nodes { id name } } }
  `);
  const team = data.teams.nodes.find(
    (t: { name: string }) => t.name.toLowerCase() === "finance"
  );
  if (!team) throw new Error("Finance team not found");
  return team.id;
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
  if (customers.length > 0) return customers[0].id;
  return null;
}

async function checkExistingTicket(
  teamId: string,
  entityId: string
): Promise<boolean> {
  const data = await linearQuery(
    `query($teamId: String!, $q: String!) {
      issues(filter: {
        team: { id: { eq: $teamId } },
        description: { contains: $q },
        state: { type: { in: ["unstarted", "started", "backlog"] } }
      }, first: 5) {
        nodes { id identifier title }
      }
    }`,
    { teamId, q: entityId }
  );
  return (data.issues?.nodes?.length || 0) > 0;
}

async function createTicket(
  teamId: string,
  alert: AlertItem
): Promise<{ id: string; identifier: string; url: string }> {
  const description = `## Retention Risk Alert

**Customer:** ${alert.business_name}
**Entity ID:** ${alert.entity_id}
**AM:** ${alert.am_name}
**Risk Category:** ${alert.risk_category}
**Source:** ${alert.source}
**Date:** ${alert.message_date} ${alert.message_time}

## Signal

> ${alert.message_body.slice(0, 500)}

---
*Created from Negative Keyword Alerts Dashboard*`;

  const data = await linearQuery(
    `mutation($teamId: String!, $title: String!, $description: String!, $priority: Int!) {
      issueCreate(input: {
        teamId: $teamId,
        title: $title,
        description: $description,
        priority: $priority
      }) {
        success
        issue { id identifier url }
      }
    }`,
    {
      teamId,
      title: `Retention Risk Alert: ${alert.business_name}`,
      description,
      priority: 2,
    }
  );

  return data.issueCreate.issue;
}

async function addCustomerNeed(
  issueId: string,
  customerUUID: string,
  body: string
) {
  await linearQuery(
    `mutation($issueId: String!, $customerId: String!, $body: String!) {
      customerNeedCreate(input: {
        issueId: $issueId,
        customerId: $customerId,
        body: $body
      }) {
        success
      }
    }`,
    { issueId: issueId, customerId: customerUUID, body }
  );
}

export async function POST(req: NextRequest) {
  try {
    const { alerts } = (await req.json()) as { alerts: AlertItem[] };

    if (!alerts || alerts.length === 0) {
      return NextResponse.json({ error: "No alerts provided" }, { status: 400 });
    }

    const teamId = await getFinanceTeamId();
    const results: {
      business: string;
      ticketId: string;
      url: string;
      skipped: boolean;
      error?: string;
    }[] = [];

    for (const alert of alerts) {
      try {
        // Check for existing open ticket
        const exists = await checkExistingTicket(teamId, alert.entity_id);
        if (exists) {
          results.push({
            business: alert.business_name,
            ticketId: "",
            url: "",
            skipped: true,
          });
          continue;
        }

        // Create ticket
        const issue = await createTicket(teamId, alert);

        // Try to add customer request
        try {
          const custUUID = await findCustomerUUID(alert.business_name);
          if (custUUID) {
            await addCustomerNeed(
              issue.id,
              custUUID,
              `Retention risk detected: ${alert.risk_category} — ${alert.message_body.slice(0, 200)}`
            );
          }
        } catch {
          // Customer linking is best-effort
        }

        results.push({
          business: alert.business_name,
          ticketId: issue.identifier,
          url: issue.url,
          skipped: false,
        });
      } catch (err) {
        results.push({
          business: alert.business_name,
          ticketId: "",
          url: "",
          skipped: false,
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

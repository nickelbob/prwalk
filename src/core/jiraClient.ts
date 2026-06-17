import type { SyncPlan } from "./sync.js";

/**
 * Minimal native JIRA Cloud executor for a SyncPlan. This is the headless
 * alternative to having an agent execute the plan via its own JIRA tools:
 * `prwalk sync --execute` builds a JiraClient from environment credentials and
 * applies the plan (comment + transition + assignee) directly over REST.
 *
 * Credentials come from the environment, NEVER from committed config:
 *   JIRA_BASE_URL (optional; falls back to .prwalk/config.json jira.baseUrl)
 *   JIRA_EMAIL, JIRA_API_TOKEN  (an Atlassian API token)
 *
 * The pure helpers (auth header, ADF conversion, transition resolution, action
 * description) are unit-tested; the HTTP methods are thin wrappers over fetch.
 */

export interface JiraTransition {
  id: string;
  name: string;
}

/** Basic-auth header for Jira Cloud: base64("email:token"). */
export function buildAuthHeader(email: string, token: string): string {
  return "Basic " + Buffer.from(`${email}:${token}`).toString("base64");
}

/**
 * Convert prwalk's lightly-marked comment text into a minimal ADF document
 * (required by the v3 comment API). Blank-line-separated blocks become
 * paragraphs; a ```fenced``` block becomes a codeBlock; newlines within a
 * paragraph become hard breaks. Inline markers (**, `) are left as literal
 * text — good enough for v1; the agent-executed path renders richer markdown.
 */
export function textToAdf(text: string): object {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/);
  const content: object[] = [];
  for (const raw of blocks) {
    const block = raw.replace(/^\n+|\n+$/g, "");
    if (!block) continue;
    const fence = block.match(/^```[^\n]*\n?([\s\S]*?)\n?```$/);
    if (fence) {
      content.push({
        type: "codeBlock",
        content: [{ type: "text", text: fence[1] }],
      });
      continue;
    }
    const lines = block.split("\n");
    const para: object[] = [];
    lines.forEach((line, i) => {
      if (i > 0) para.push({ type: "hardBreak" });
      if (line.length) para.push({ type: "text", text: line });
    });
    content.push({ type: "paragraph", content: para });
  }
  if (content.length === 0) {
    content.push({ type: "paragraph", content: [{ type: "text", text: "" }] });
  }
  return { type: "doc", version: 1, content };
}

/** Find a transition id by its (case-insensitive) target status name. */
export function resolveTransitionId(
  transitions: JiraTransition[],
  name: string,
): string | null {
  const want = name.trim().toLowerCase();
  const hit = transitions.find((t) => t.name.trim().toLowerCase() === want);
  return hit ? hit.id : null;
}

export interface PlannedAction {
  kind: "comment" | "transition" | "assign";
  detail: string;
}

/** Ordered, human-readable list of what executing a plan will do (offline). */
export function describeExecution(plan: SyncPlan): PlannedAction[] {
  if (plan.noop || !plan.issueKey) return [];
  const actions: PlannedAction[] = [];
  actions.push({ kind: "comment", detail: `post comment on ${plan.issueKey}` });
  if (plan.transition) {
    actions.push({ kind: "transition", detail: `transition ${plan.issueKey} → "${plan.transition}"` });
  }
  if (plan.assignee) {
    actions.push({ kind: "assign", detail: `assign ${plan.issueKey} → ${plan.assignee}` });
  }
  return actions;
}

export interface JiraCredentials {
  baseUrl: string;
  email: string;
  token: string;
}

export class JiraError extends Error {}

export class JiraClient {
  private baseUrl: string;
  private auth: string;

  constructor(creds: JiraCredentials) {
    this.baseUrl = creds.baseUrl.replace(/\/+$/, "");
    this.auth = buildAuthHeader(creds.email, creds.token);
  }

  private async req(method: string, path: string, body?: unknown): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: this.auth,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new JiraError(`JIRA ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
    }
    return text ? JSON.parse(text) : null;
  }

  async getTransitions(issueKey: string): Promise<JiraTransition[]> {
    const data = (await this.req("GET", `/rest/api/3/issue/${issueKey}/transitions`)) as {
      transitions?: { id: string; name: string }[];
    };
    return (data.transitions ?? []).map((t) => ({ id: t.id, name: t.name }));
  }

  async addComment(issueKey: string, text: string): Promise<void> {
    await this.req("POST", `/rest/api/3/issue/${issueKey}/comment`, { body: textToAdf(text) });
  }

  async transition(issueKey: string, transitionId: string): Promise<void> {
    await this.req("POST", `/rest/api/3/issue/${issueKey}/transitions`, {
      transition: { id: transitionId },
    });
  }

  async assign(issueKey: string, accountId: string): Promise<void> {
    await this.req("PUT", `/rest/api/3/issue/${issueKey}/assignee`, { accountId });
  }
}

export interface ExecResult {
  done: string[];
  skipped: string[];
}

/** Apply a SyncPlan over REST. Comment first (always safe), then transition,
 * then assignee — each failure is surfaced but doesn't undo prior steps. */
export async function executeSyncPlan(
  plan: SyncPlan,
  client: JiraClient,
): Promise<ExecResult> {
  const done: string[] = [];
  const skipped: string[] = [];
  if (plan.noop || !plan.issueKey) {
    skipped.push("no issue key / tracker — nothing to sync");
    return { done, skipped };
  }

  await client.addComment(plan.issueKey, plan.comment);
  done.push(`commented on ${plan.issueKey}`);

  if (plan.transition) {
    const transitions = await client.getTransitions(plan.issueKey);
    const id = resolveTransitionId(transitions, plan.transition);
    if (id) {
      await client.transition(plan.issueKey, id);
      done.push(`transitioned → "${plan.transition}"`);
    } else {
      skipped.push(
        `transition "${plan.transition}" not available (have: ${transitions
          .map((t) => t.name)
          .join(", ")})`,
      );
    }
  }

  if (plan.assignee) {
    await client.assign(plan.issueKey, plan.assignee);
    done.push(`assigned → ${plan.assignee}`);
  }

  return { done, skipped };
}

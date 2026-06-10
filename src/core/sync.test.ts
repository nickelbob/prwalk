import { describe, expect, it } from "vitest";
import { parseDiff } from "./diffParser.js";
import { chunkFiles } from "./chunker.js";
import { buildInitialManifest } from "./merge.js";
import { applyDecision } from "./decisions.js";
import { buildSyncPlan } from "./sync.js";
import { DEFAULT_CONFIG, type PrwalkConfig } from "./config.js";
import type { Manifest } from "./schema.js";

const CONFIG: PrwalkConfig = {
  ...DEFAULT_CONFIG,
  tracker: "jira",
  jira: { ...DEFAULT_CONFIG.jira, baseUrl: "https://acme.atlassian.net", reviewer: "rev@acme.io" },
};

function manifest(n: number, issueKey: string | null = "PROJ-1"): Manifest {
  const diff = Array.from({ length: n })
    .map(
      (_, i) => `diff --git a/f${i}.ts b/f${i}.ts
index 1..2 100644
--- a/f${i}.ts
+++ b/f${i}.ts
@@ -1 +1,2 @@
+const x${i} = ${i};
`,
    )
    .join("");
  const { manifest } = buildInitialManifest(chunkFiles(parseDiff(diff)), {
    branch: "feat/PROJ-1-login",
    baseRef: "main",
    baseSha: "b0",
    headSha: "h0",
    issueKey,
    issueUrl: issueKey ? `https://acme.atlassian.net/browse/${issueKey}` : null,
    tracker: issueKey ? "jira" : null,
  });
  return manifest;
}

function decide(m: Manifest, i: number, action: "accept" | "reject", feedback?: string): Manifest {
  const c = m.chunks[i];
  return applyDecision(m, { stableId: c.stableId, revisionId: c.revisionId, action, feedback }).manifest;
}

describe("buildSyncPlan", () => {
  it("maps a fresh review (draft) to the in_review transition and assigns the reviewer", () => {
    const plan = buildSyncPlan(manifest(2), CONFIG);
    expect(plan.prStatus).toBe("draft");
    expect(plan.transition).toBe("In Review");
    expect(plan.assignee).toBe("rev@acme.io");
    expect(plan.reviewLink).toBe("prwalk review PROJ-1");
    expect(plan.comment).toContain("ready for review");
    expect(plan.noop).toBe(false);
  });

  it("maps a rejection to changes_requested with the feedback in the comment, no reviewer reassign", () => {
    let m = manifest(2);
    m = decide(m, 0, "reject", "use a constant");
    const plan = buildSyncPlan(m, CONFIG);
    expect(plan.prStatus).toBe("changes_requested");
    expect(plan.transition).toBe("In Progress");
    expect(plan.assignee).toBeNull();
    expect(plan.comment).toContain("use a constant");
    expect(plan.comment).toContain("changes requested");
  });

  it("maps a fully-accepted review to approved/Done", () => {
    let m = manifest(2);
    m = decide(m, 0, "accept");
    m = decide(m, 1, "accept");
    const plan = buildSyncPlan(m, CONFIG);
    expect(plan.prStatus).toBe("approved");
    expect(plan.transition).toBe("Done");
    expect(plan.comment).toContain("approved");
  });

  it("returns null transition when the status is unmapped", () => {
    const cfg: PrwalkConfig = { ...CONFIG, jira: { ...CONFIG.jira, transitions: {} } };
    const plan = buildSyncPlan(manifest(1), cfg);
    expect(plan.transition).toBeNull();
  });

  it("is a no-op when there is no issue key", () => {
    const plan = buildSyncPlan(manifest(1, null), CONFIG);
    expect(plan.issueKey).toBeNull();
    expect(plan.noop).toBe(true);
    expect(plan.reviewLink).toBe("prwalk review --branch feat/PROJ-1-login");
  });

  it("is a no-op when no tracker is configured even with an issue key", () => {
    const plan = buildSyncPlan(manifest(1), DEFAULT_CONFIG); // tracker: null
    expect(plan.noop).toBe(true);
  });
});

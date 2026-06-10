import { describe, expect, it } from "vitest";
import { parseDiff } from "./diffParser.js";
import { chunkFiles, inferRisk } from "./chunker.js";
import { buildInitialManifest } from "./merge.js";
import { applyDecision } from "./decisions.js";
import { applyReviewLevel, inScope } from "./reviewLevel.js";
import { deriveStatus } from "./status.js";
import type { Manifest } from "./schema.js";

const META = { branch: "feat", baseRef: "main", baseSha: "b0", headSha: "h0" };

function manifestWithRisks(risks: number[]): Manifest {
  // Build N single-line-add chunks, then stamp explicit risk on each.
  const diff = risks
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
  const { manifest } = buildInitialManifest(chunkFiles(parseDiff(diff)), META);
  manifest.chunks.forEach((c, i) => (c.risk = risks[i]));
  return manifest;
}

describe("inferRisk heuristic", () => {
  it("rates import-only / comment-only hunks trivial (1)", () => {
    const patch = "@@ -1 +1,2 @@\n+import { x } from './x';\n+// a note\n";
    expect(inferRisk("src/a.ts", patch, "modify")).toBe(1);
  });
  it("rates css/test/low-risk files at 2", () => {
    expect(inferRisk("src/a.css", "@@ -1 +1,2 @@\n+.x { color: red; }\n", "modify")).toBe(2);
    expect(inferRisk("src/a.test.ts", "@@ -1 +1,2 @@\n+expect(1).toBe(1);\n", "modify")).toBe(2);
  });
  it("rates real logic at 3 and never auto-guesses 4/5", () => {
    const r = inferRisk("src/a.ts", "@@ -1 +1,2 @@\n+if (user.isAdmin) grant();\n", "modify");
    expect(r).toBe(3);
    expect(r).toBeLessThanOrEqual(3);
  });
});

describe("applyReviewLevel", () => {
  it("auto-accepts below-level chunks with provenance and reaches approved when all in-scope decided", () => {
    // risks: [2,2,4] reviewing at level 3 → two auto-accepted, one in scope.
    const m0 = manifestWithRisks([2, 2, 4]);
    const { manifest: m1, summary } = applyReviewLevel(m0, 3);
    expect(summary.autoAccepted).toBe(2);
    expect(summary.inScope).toBe(1);

    const below = m1.chunks.filter((c) => c.risk < 3);
    expect(below.every((c) => c.decision.state === "accepted" && c.decision.via === "auto-threshold")).toBe(true);
    // still one pending in-scope chunk → not yet approved
    expect(deriveStatus(m1)).not.toBe("approved");

    // explicitly accept the in-scope chunk
    const inScopeChunk = m1.chunks.find((c) => c.risk >= 3)!;
    const { manifest: m2 } = applyDecision(m1, {
      stableId: inScopeChunk.stableId,
      revisionId: inScopeChunk.revisionId,
      action: "accept",
    });
    expect(deriveStatus(m2)).toBe("approved");
    // provenance distinguishes explicit vs auto
    expect(m2.chunks.find((c) => c.stableId === inScopeChunk.stableId)!.decision.via).toBe("explicit");
  });

  it("explicit decisions are sticky across level changes", () => {
    const m0 = manifestWithRisks([2, 5]);
    // explicitly reject the low-risk one
    const low = m0.chunks.find((c) => c.risk === 2)!;
    const { manifest: rejected } = applyDecision(m0, {
      stableId: low.stableId,
      revisionId: low.revisionId,
      action: "reject",
      feedback: "no",
    });
    // now set a high level that would otherwise auto-accept the low-risk chunk
    const { manifest: leveled } = applyReviewLevel(rejected, 4);
    const lowAfter = leveled.chunks.find((c) => c.stableId === low.stableId)!;
    expect(lowAfter.decision.state).toBe("rejected"); // not auto-accepted
    expect(lowAfter.decision.via).toBe("explicit");
  });

  it("reopens previously auto-accepted chunks when the level is lowered", () => {
    const m0 = manifestWithRisks([2, 4]);
    const { manifest: high } = applyReviewLevel(m0, 4); // risk-2 auto-accepted
    const low = high.chunks.find((c) => c.risk === 2)!;
    expect(low.decision.state).toBe("accepted");
    expect(low.decision.via).toBe("auto-threshold");

    const { manifest: lowered, summary } = applyReviewLevel(high, 2); // now in scope
    expect(summary.reopened).toBe(1);
    const lowAfter = lowered.chunks.find((c) => c.stableId === low.stableId)!;
    expect(lowAfter.decision.state).toBe("pending");
  });

  it("inScope respects the level boundary", () => {
    const m = manifestWithRisks([1, 3, 5]);
    expect(inScope(m.chunks[0], 3)).toBe(false);
    expect(inScope(m.chunks[1], 3)).toBe(true);
    expect(inScope(m.chunks[2], 3)).toBe(true);
    expect(inScope(m.chunks[0], null)).toBe(true); // no level → all in scope
  });
});

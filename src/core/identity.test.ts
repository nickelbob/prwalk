import { describe, expect, it } from "vitest";
import { parseDiff } from "./diffParser.js";
import { chunkFiles } from "./chunker.js";
import { contentHash, matchCandidates } from "./identity.js";
import { buildInitialManifest, mergeRound } from "./merge.js";
import { applyDecision } from "./decisions.js";
import { deriveStatus } from "./status.js";
import type { Chunk } from "./schema.js";

function candidatesFrom(diff: string) {
  return chunkFiles(parseDiff(diff));
}

const META = { branch: "feat", baseRef: "main", baseSha: "b0", headSha: "h0" };

describe("contentHash", () => {
  it("ignores indentation and line numbers (moved + reindented block)", () => {
    const a = "@@ -1,2 +1,2 @@\n-  foo(a)\n+  bar(a)\n";
    const b = "@@ -50,2 +60,2 @@\n-      foo(a)\n+      bar(a)\n";
    expect(contentHash("f.ts", a)).toBe(contentHash("f.ts", b));
  });
  it("differs when content differs", () => {
    const a = "@@ -1 +1 @@\n+foo\n";
    const b = "@@ -1 +1 @@\n+bar\n";
    expect(contentHash("f.ts", a)).not.toBe(contentHash("f.ts", b));
  });
});

describe("multi-round identity carry", () => {
  // Round 1: two hunks in two files.
  const r1Diff = `diff --git a/x.ts b/x.ts
index 1..2 100644
--- a/x.ts
+++ b/x.ts
@@ -10,3 +10,4 @@ function foo() {
   const a = 1;
+  const b = 2;
   return a;
diff --git a/y.ts b/y.ts
index 1..2 100644
--- a/y.ts
+++ b/y.ts
@@ -5,2 +5,3 @@ function bar() {
   doThing();
+  doOther();
`;

  it("Tier-1 unchanged match keeps an accepted decision", () => {
    const { manifest: m1 } = buildInitialManifest(candidatesFrom(r1Diff), META);
    // accept the x.ts chunk
    const xChunk = m1.chunks.find((c) => c.file === "x.ts")!;
    const { manifest: accepted } = applyDecision(m1, {
      stableId: xChunk.stableId,
      revisionId: xChunk.revisionId,
      action: "accept",
    });

    // Round 2: x.ts identical, y.ts changed (different added line).
    const r2Diff = `diff --git a/x.ts b/x.ts
index 1..2 100644
--- a/x.ts
+++ b/x.ts
@@ -20,3 +20,4 @@ function foo() {
   const a = 1;
+  const b = 2;
   return a;
diff --git a/y.ts b/y.ts
index 1..2 100644
--- a/y.ts
+++ b/y.ts
@@ -5,2 +5,3 @@ function bar() {
   doThing();
+  doDifferent();
`;
    const { manifest: m2, counts } = mergeRound(accepted, candidatesFrom(r2Diff), {
      ...META,
      headSha: "h1",
    });

    const x2 = m2.chunks.find((c) => c.file === "x.ts" && !c.absent)!;
    const y2 = m2.chunks.find((c) => c.file === "y.ts" && !c.absent)!;

    // x.ts unchanged -> same stableId, still accepted (moved line numbers ok)
    expect(x2.stableId).toBe(xChunk.stableId);
    expect(x2.decision.state).toBe("accepted");
    // y.ts revised -> same stableId carried, reset to pending
    expect(y2.decision.state).toBe("pending");
    expect(counts.unchanged).toBe(1);
    expect(counts.revised).toBe(1);
  });

  it("a vanished chunk is marked absent, not deleted", () => {
    const { manifest: m1 } = buildInitialManifest(candidatesFrom(r1Diff), META);
    // Round 2: only x.ts remains.
    const r2 = `diff --git a/x.ts b/x.ts
index 1..2 100644
--- a/x.ts
+++ b/x.ts
@@ -10,3 +10,4 @@ function foo() {
   const a = 1;
+  const b = 2;
   return a;
`;
    const { manifest: m2, counts } = mergeRound(m1, candidatesFrom(r2), { ...META, headSha: "h1" });
    const y = m2.chunks.find((c) => c.file === "y.ts");
    expect(y?.absent).toBe(true);
    expect(counts.absent).toBe(1);
  });
});

describe("matchCandidates basic tiers", () => {
  it("returns null match for brand new content", () => {
    const existing: Chunk[] = [];
    const cands = candidatesFrom(`diff --git a/z.ts b/z.ts
index 1..2 100644
--- a/z.ts
+++ b/z.ts
@@ -1 +1,2 @@
+new line
`);
    const res = matchCandidates(cands, existing);
    expect(res[0].existingStableId).toBeNull();
  });
});

describe("deriveStatus truth table", () => {
  const base = candidatesFrom(`diff --git a/x.ts b/x.ts
index 1..2 100644
--- a/x.ts
+++ b/x.ts
@@ -1 +1,2 @@
+a
diff --git a/y.ts b/y.ts
index 1..2 100644
--- a/y.ts
+++ b/y.ts
@@ -1 +1,2 @@
+b
`);

  it("all pending -> draft", () => {
    const { manifest } = buildInitialManifest(base, META);
    expect(deriveStatus(manifest)).toBe("draft");
  });

  it("one rejected -> changes_requested", () => {
    let { manifest } = buildInitialManifest(base, META);
    manifest = applyDecision(manifest, {
      stableId: manifest.chunks[0].stableId,
      revisionId: manifest.chunks[0].revisionId,
      action: "reject",
      feedback: "no",
    }).manifest;
    expect(deriveStatus(manifest)).toBe("changes_requested");
  });

  it("all accepted -> approved", () => {
    let { manifest } = buildInitialManifest(base, META);
    for (const c of [...manifest.chunks]) {
      manifest = applyDecision(manifest, {
        stableId: c.stableId,
        revisionId: c.revisionId,
        action: "accept",
      }).manifest;
    }
    expect(deriveStatus(manifest)).toBe("approved");
  });

  it("some accepted, some pending -> in_review", () => {
    let { manifest } = buildInitialManifest(base, META);
    manifest = applyDecision(manifest, {
      stableId: manifest.chunks[0].stableId,
      revisionId: manifest.chunks[0].revisionId,
      action: "accept",
    }).manifest;
    expect(deriveStatus(manifest)).toBe("in_review");
  });
});

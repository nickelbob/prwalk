import { describe, expect, it } from "vitest";
import { parseDiff, splitHunk } from "./diffParser.js";
import { chunkFiles } from "./chunker.js";

/** Build a large added-block hunk with `n` added lines. */
function bigAddDiff(n: number): string {
  const adds = Array.from({ length: n }, (_, i) => `+line ${i}`).join("\n");
  return `diff --git a/big.ts b/big.ts
index 1..2 100644
--- a/big.ts
+++ b/big.ts
@@ -1,2 +1,${n + 2} @@ context
 const head = 1;
${adds}
 const tail = 2;
`;
}

describe("splitHunk", () => {
  it("returns the hunk unchanged when under the limit", () => {
    const [file] = parseDiff(bigAddDiff(5));
    const parts = splitHunk(file.hunks[0], 300);
    expect(parts).toHaveLength(1);
  });

  it("splits a large hunk into multiple sub-hunks", () => {
    const [file] = parseDiff(bigAddDiff(250));
    const parts = splitHunk(file.hunks[0], 100);
    expect(parts.length).toBeGreaterThan(1);
  });

  it("preserves total added/removed counts across the split", () => {
    const [file] = parseDiff(bigAddDiff(250));
    const orig = file.hunks[0];
    const parts = splitHunk(orig, 100);
    const added = parts.reduce((s, p) => s + p.addedLines, 0);
    const removed = parts.reduce((s, p) => s + p.removedLines, 0);
    expect(added).toBe(orig.addedLines);
    expect(removed).toBe(orig.removedLines);
  });

  it("produces sub-hunks whose new-line ranges are contiguous", () => {
    const [file] = parseDiff(bigAddDiff(250));
    const parts = splitHunk(file.hunks[0], 100);
    for (let i = 1; i < parts.length; i++) {
      const prev = parts[i - 1];
      const cur = parts[i];
      expect(cur.newStart).toBe(prev.newStart + prev.newLines);
    }
  });

  it("each sub-hunk carries a valid @@ header", () => {
    const [file] = parseDiff(bigAddDiff(250));
    const parts = splitHunk(file.hunks[0], 100);
    for (const p of parts) {
      expect(p.patch.startsWith("@@ -")).toBe(true);
      expect(p.header).toMatch(/^@@ -\d+,\d+ \+\d+,\d+ @@/);
    }
  });
});

describe("chunkFiles splitting", () => {
  it("emits multiple chunks for one large hunk", () => {
    const files = parseDiff(bigAddDiff(250));
    const chunks = chunkFiles(files, { maxHunkLines: 80 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => !c.diff.truncated)).toBe(true);
  });
});

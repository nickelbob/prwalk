import { describe, expect, it } from "vitest";
import { parseDiff } from "./diffParser.js";

const SAMPLE = `diff --git a/src/auth.ts b/src/auth.ts
index 1111111..2222222 100644
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -40,7 +42,9 @@ export function issueToken() {
   const a = 1;
-  return signHS256(a);
+  return signRS256(a);
+  // new comment
 }
diff --git a/src/new.ts b/src/new.ts
new file mode 100644
index 0000000..3333333
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1,2 @@
+export const x = 1;
+export const y = 2;
diff --git a/src/old.ts b/src/old.ts
deleted file mode 100644
index 4444444..0000000
--- a/src/old.ts
+++ /dev/null
@@ -1,1 +0,0 @@
-export const gone = true;
diff --git a/src/a.ts b/src/b.ts
similarity index 100%
rename from src/a.ts
rename to src/b.ts
`;

describe("parseDiff", () => {
  const files = parseDiff(SAMPLE);

  it("parses all four files", () => {
    expect(files).toHaveLength(4);
  });

  it("classifies change types", () => {
    expect(files[0].changeType).toBe("modify");
    expect(files[1].changeType).toBe("add");
    expect(files[2].changeType).toBe("delete");
    expect(files[3].changeType).toBe("rename");
  });

  it("extracts hunk headers and line counts", () => {
    const h = files[0].hunks[0];
    expect(h.newStart).toBe(42);
    expect(h.section).toContain("issueToken");
    expect(h.addedLines).toBe(2);
    expect(h.removedLines).toBe(1);
  });

  it("renamed file with 100% similarity has no hunks but records paths", () => {
    expect(files[3].oldPath).toBe("src/a.ts");
    expect(files[3].newPath).toBe("src/b.ts");
    expect(files[3].hunks).toHaveLength(0);
  });

  it("embeds raw patch text in the hunk", () => {
    expect(files[0].hunks[0].patch).toContain("+  return signRS256(a);");
  });
});

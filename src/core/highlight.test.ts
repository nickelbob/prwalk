import { describe, it, expect } from "vitest";
import Prism from "prismjs";
import "prismjs/components/prism-typescript.js";
import "prismjs/components/prism-jsx.js";
import "prismjs/components/prism-tsx.js";
import "prismjs/components/prism-python.js";
import { inferLanguage } from "./chunker.js";

/**
 * Guards the syntax-highlighting pipeline used by the DiffView: that the
 * chunker's inferred language values resolve to a loaded Prism grammar and
 * that Prism actually emits `token` spans. A build with prismjs missing (or a
 * grammar import dropped) tags nothing and silently renders plain text — this
 * test fails loudly in that case.
 */
describe("syntax highlight pipeline", () => {
  it("infers Prism-resolvable languages from common paths", () => {
    expect(inferLanguage("src/foo.ts")).toBe("typescript");
    expect(inferLanguage("src/foo.tsx")).toBe("tsx");
    expect(inferLanguage("src/foo.py")).toBe("python");
  });

  it("has the core + imported grammars registered on the shared Prism instance", () => {
    expect(Prism.languages.typescript).toBeTruthy();
    expect(Prism.languages.tsx).toBeTruthy();
    expect(Prism.languages.python).toBeTruthy();
    // core grammars that DiffView relies on without an explicit import
    expect(Prism.languages.javascript).toBeTruthy();
    expect(Prism.languages.markup).toBeTruthy();
  });

  it("emits token spans for a realistic diff line", () => {
    const html = Prism.highlight(
      "const x = useState(0);",
      Prism.languages.typescript,
      "typescript",
    );
    expect(html).toContain('class="token keyword"');
    expect(html).toContain('class="token function"');
  });
});

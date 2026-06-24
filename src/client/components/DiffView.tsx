import { useState } from "react";
import Prism from "prismjs";
// Order matters: dependents (tsx→jsx/typescript, cpp→c) come after their bases.
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-python";
import "prismjs/components/prism-json";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-toml";
import "prismjs/components/prism-go";
import "prismjs/components/prism-rust";
import "prismjs/components/prism-ruby";
import "prismjs/components/prism-java";
import "prismjs/components/prism-c";
import "prismjs/components/prism-cpp";
import "prismjs/components/prism-csharp";
// php registers a before-tokenize hook that calls into markup-templating on
// EVERY highlight — it must be loaded first, or all highlighting throws.
import "prismjs/components/prism-markup-templating";
import "prismjs/components/prism-php";
import "prismjs/components/prism-css";
import "prismjs/components/prism-scss";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-swift";
import "prismjs/components/prism-kotlin";
import "prismjs/components/prism-markdown";

// Maps the chunker's `language` values (core/chunker.ts LANG_BY_EXT) to a loaded
// Prism grammar. markup/css/javascript/clike ship in Prism core (no import).
const ALIAS: Record<string, string> = {
  javascript: "javascript",
  typescript: "typescript",
  tsx: "tsx",
  jsx: "jsx",
  python: "python",
  json: "json",
  bash: "bash",
  yaml: "yaml",
  toml: "toml",
  go: "go",
  rust: "rust",
  ruby: "ruby",
  java: "java",
  c: "c",
  cpp: "cpp",
  csharp: "csharp",
  php: "php",
  css: "css",
  scss: "scss",
  sql: "sql",
  swift: "swift",
  kotlin: "kotlin",
  markup: "markup",
  markdown: "markdown",
};

function highlight(code: string, language: string): string {
  const lang = ALIAS[language];
  const grammar = lang ? Prism.languages[lang] : undefined;
  if (!grammar) return escapeHtml(code);
  try {
    return Prism.highlight(code, grammar, lang);
  } catch {
    return escapeHtml(code);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Render a unified diff with syntax highlighting. Diffs longer than
 * `collapseOver` lines are collapsed behind a toggle so very large reviews
 * keep the DOM light and stay responsive (a lightweight stand-in for full list
 * virtualization).
 */
export function DiffView({
  patch,
  language,
  collapseOver = 80,
}: {
  patch: string;
  language: string;
  collapseOver?: number;
}) {
  const lines = patch.replace(/\n$/, "").split("\n");
  const [open, setOpen] = useState(lines.length <= collapseOver);

  if (!open) {
    return (
      <button className="diff-collapsed" onClick={() => setOpen(true)}>
        Show diff — {lines.length} lines (+{lines.filter((l) => l.startsWith("+")).length} / -
        {lines.filter((l) => l.startsWith("-")).length})
      </button>
    );
  }

  return (
    <>
    {lines.length > collapseOver && (
      <button className="diff-hide" onClick={() => setOpen(false)}>
        Hide diff
      </button>
    )}
    <pre className="diff">
      {lines.map((line, i) => {
        let cls = "ctx";
        if (line.startsWith("@@")) cls = "hunk";
        else if (line.startsWith("+")) cls = "add";
        else if (line.startsWith("-")) cls = "del";
        const sign = cls === "hunk" ? "" : line.slice(0, 1);
        const code = cls === "hunk" ? line : line.slice(1);
        const html =
          cls === "hunk" ? escapeHtml(code) : highlight(code, language);
        return (
          <div key={i} className={`line ${cls}`}>
            <span className="sign">{sign}</span>
            <span
              className="code"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </div>
        );
      })}
    </pre>
    </>
  );
}

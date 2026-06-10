import Prism from "prismjs";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-python";
import "prismjs/components/prism-json";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-go";
import "prismjs/components/prism-rust";
import "prismjs/components/prism-css";
import "prismjs/components/prism-markdown";

const ALIAS: Record<string, string> = {
  javascript: "javascript",
  typescript: "typescript",
  tsx: "tsx",
  jsx: "jsx",
  python: "python",
  json: "json",
  bash: "bash",
  yaml: "yaml",
  go: "go",
  rust: "rust",
  css: "css",
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

export function DiffView({ patch, language }: { patch: string; language: string }) {
  const lines = patch.replace(/\n$/, "").split("\n");
  return (
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
  );
}

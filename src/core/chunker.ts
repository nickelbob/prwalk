import type { ParsedFile, ParsedHunk } from "./diffParser.js";
import { splitHunk } from "./diffParser.js";
import { makeAnchor, type CandidateChunk } from "./identity.js";

/**
 * Turn parsed diff files into review candidate chunks. Default granularity is
 * one git hunk = one chunk; special file states (add/delete/rename/binary/mode)
 * with no hunks still produce a single acknowledgeable chunk.
 */

const LANG_BY_EXT: Record<string, string> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  yml: "yaml",
  yaml: "yaml",
  toml: "toml",
  md: "markdown",
  html: "markup",
  css: "css",
  scss: "scss",
  sql: "sql",
  swift: "swift",
  kt: "kotlin",
};

export function inferLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return LANG_BY_EXT[ext] ?? "text";
}

const LOW_RISK_EXT = new Set(["css", "scss", "md", "markdown", "txt", "json", "yml", "yaml", "toml"]);

/**
 * Heuristic starting risk (1 trivial … 5 critical). Conservative: caps at 3
 * (moderate) so the agent must consciously elevate genuinely risky changes to
 * 4/5 — nothing risky is hidden by a guessed-low default. The PR creator is
 * expected to confirm/override each value in the manifest.
 */
export function inferRisk(
  path: string,
  patch: string,
  changeType: ParsedFile["changeType"],
): number {
  if (changeType === "rename" || changeType === "mode") return 1;
  if (changeType === "binary") return 2;

  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const isTest = /\.(test|spec)\./.test(path) || /(^|\/)__tests__\//.test(path);

  // Body lines that actually changed (added/removed), minus diff file markers.
  const changed = patch
    .split("\n")
    .filter((l) => (l.startsWith("+") || l.startsWith("-")) && !l.startsWith("+++") && !l.startsWith("---"))
    .map((l) => l.slice(1).trim());

  const allTrivial =
    changed.length > 0 &&
    changed.every(
      (l) =>
        l === "" ||
        l.startsWith("import ") ||
        l.startsWith("export {") ||
        l.startsWith("//") ||
        l.startsWith("/*") ||
        l.startsWith("*") ||
        l.startsWith("#") ||
        l.startsWith("export * from"),
    );
  if (allTrivial) return 1;
  if (LOW_RISK_EXT.has(ext) || isTest) return 2;
  return 3;
}

export interface ChunkerOptions {
  /** Hunks longer than this many body lines are split into sub-chunks. */
  maxHunkLines?: number;
}

function hunkToCandidate(file: ParsedFile, hunk: ParsedHunk): CandidateChunk {
  const path = file.newPath ?? file.oldPath ?? "unknown";
  return {
    file: path,
    previousFile: file.changeType === "rename" ? file.oldPath : null,
    changeType: file.changeType,
    language: inferLanguage(path),
    risk: inferRisk(path, hunk.patch, file.changeType),
    anchor: makeAnchor(path, hunk),
    diff: {
      format: "unified",
      hunkHeader: hunk.header,
      patch: hunk.patch,
      addedLines: hunk.addedLines,
      removedLines: hunk.removedLines,
      truncated: false,
    },
  };
}

/** A synthetic single chunk for files with no `@@` hunks (rename/binary/etc). */
function fileToSyntheticCandidate(file: ParsedFile): CandidateChunk {
  const path = file.newPath ?? file.oldPath ?? "unknown";
  const label =
    file.changeType === "binary"
      ? `Binary file ${path} differs`
      : file.changeType === "rename"
        ? `Renamed ${file.oldPath ?? "?"} -> ${file.newPath ?? "?"}`
        : file.changeType === "mode"
          ? `Mode change on ${path}`
          : file.changeType === "delete"
            ? `Deleted ${path}`
            : `${file.changeType} ${path}`;
  return {
    file: path,
    previousFile: file.changeType === "rename" ? file.oldPath : null,
    changeType: file.changeType,
    language: inferLanguage(path),
    risk: inferRisk(path, label, file.changeType),
    anchor: makeAnchor(path, {
      header: label,
      oldStart: 0,
      oldLines: 0,
      newStart: 0,
      newLines: 0,
      section: label,
      patch: label,
      addedLines: 0,
      removedLines: 0,
    }),
    diff: {
      format: "unified",
      hunkHeader: label,
      patch: label,
      addedLines: 0,
      removedLines: 0,
      truncated: false,
    },
  };
}

export function chunkFiles(
  files: ParsedFile[],
  opts: ChunkerOptions = {},
): CandidateChunk[] {
  const maxHunkLines = opts.maxHunkLines ?? 300;
  const candidates: CandidateChunk[] = [];
  for (const file of files) {
    if (file.hunks.length === 0) {
      candidates.push(fileToSyntheticCandidate(file));
      continue;
    }
    for (const hunk of file.hunks) {
      // Large hunks are split into multiple reviewable sub-chunks rather than
      // truncated, so nothing is hidden from the reviewer.
      for (const sub of splitHunk(hunk, maxHunkLines)) {
        candidates.push(hunkToCandidate(file, sub));
      }
    }
  }
  return candidates;
}

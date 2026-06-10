/**
 * Parse a git unified diff into files and hunks. Pure, no I/O.
 *
 * We rely on git's porcelain-stable `diff --git` headers. Each file block may
 * carry zero or more `@@` hunks (zero for pure renames / binary / mode-only).
 */

export type RawChangeType =
  | "add"
  | "modify"
  | "delete"
  | "rename"
  | "binary"
  | "mode";

export interface ParsedHunk {
  /** The full `@@ -a,b +c,d @@ ctx` header line. */
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  /** Context that follows the second `@@` (often a function signature). */
  section: string;
  /** Raw hunk text including the @@ header and all +/-/space body lines. */
  patch: string;
  addedLines: number;
  removedLines: number;
}

export interface ParsedFile {
  oldPath: string | null;
  newPath: string | null;
  changeType: RawChangeType;
  isBinary: boolean;
  hunks: ParsedHunk[];
}

const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;

function parsePathFromGitHeader(line: string): {
  a: string;
  b: string;
} | null {
  // `diff --git a/foo b/bar` — handle paths without spaces (the common case).
  const m = line.match(/^diff --git a\/(.+) b\/(.+)$/);
  if (!m) return null;
  return { a: m[1], b: m[2] };
}

export function parseDiff(diffText: string): ParsedFile[] {
  const lines = diffText.split("\n");
  const files: ParsedFile[] = [];
  let cur: ParsedFile | null = null;
  let curHunk: ParsedHunk | null = null;

  const flushHunk = () => {
    if (cur && curHunk) cur.hunks.push(curHunk);
    curHunk = null;
  };
  const flushFile = () => {
    flushHunk();
    if (cur) files.push(cur);
    cur = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("diff --git ")) {
      flushFile();
      const paths = parsePathFromGitHeader(line);
      cur = {
        oldPath: paths?.a ?? null,
        newPath: paths?.b ?? null,
        changeType: "modify",
        isBinary: false,
        hunks: [],
      };
      continue;
    }
    if (!cur) continue;

    if (line.startsWith("new file mode")) {
      cur.changeType = "add";
      cur.oldPath = null;
      continue;
    }
    if (line.startsWith("deleted file mode")) {
      cur.changeType = "delete";
      cur.newPath = null;
      continue;
    }
    if (line.startsWith("rename from ")) {
      cur.changeType = "rename";
      cur.oldPath = line.slice("rename from ".length);
      continue;
    }
    if (line.startsWith("rename to ")) {
      cur.changeType = "rename";
      cur.newPath = line.slice("rename to ".length);
      continue;
    }
    if (line.startsWith("copy from ") || line.startsWith("copy to ")) {
      cur.changeType = "rename";
      continue;
    }
    if (
      (line.startsWith("old mode ") || line.startsWith("new mode ")) &&
      cur.hunks.length === 0
    ) {
      if (cur.changeType === "modify") cur.changeType = "mode";
      continue;
    }
    if (line.startsWith("Binary files")) {
      cur.isBinary = true;
      cur.changeType =
        cur.changeType === "modify" ? "binary" : cur.changeType;
      continue;
    }
    // Ignore `index`, `---`, `+++`, `similarity index`, `\ No newline` markers.
    if (
      line.startsWith("index ") ||
      line.startsWith("--- ") ||
      line.startsWith("+++ ") ||
      line.startsWith("similarity index") ||
      line.startsWith("dissimilarity index") ||
      line.startsWith("\\ No newline")
    ) {
      continue;
    }

    const hm = line.match(HUNK_RE);
    if (hm) {
      flushHunk();
      curHunk = {
        header: line,
        oldStart: Number(hm[1]),
        oldLines: hm[2] === undefined ? 1 : Number(hm[2]),
        newStart: Number(hm[3]),
        newLines: hm[4] === undefined ? 1 : Number(hm[4]),
        section: (hm[5] ?? "").trim(),
        patch: line + "\n",
        addedLines: 0,
        removedLines: 0,
      };
      continue;
    }

    if (curHunk && (line.startsWith("+") || line.startsWith("-") || line.startsWith(" "))) {
      curHunk.patch += line + "\n";
      if (line.startsWith("+")) curHunk.addedLines++;
      else if (line.startsWith("-")) curHunk.removedLines++;
      continue;
    }
  }
  flushFile();
  return files;
}

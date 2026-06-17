/**
 * Parse a git unified diff into files and hunks. Pure, no I/O.
 *
 * We rely on git's porcelain-stable `diff --git` headers. Each file block may
 * carry zero or more `@@` hunks (zero for pure renames / binary / mode-only).
 */
const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;
function parsePathFromGitHeader(line) {
    // `diff --git a/foo b/bar` — handle paths without spaces (the common case).
    const m = line.match(/^diff --git a\/(.+) b\/(.+)$/);
    if (!m)
        return null;
    return { a: m[1], b: m[2] };
}
export function parseDiff(diffText) {
    const lines = diffText.split("\n");
    const files = [];
    let cur = null;
    let curHunk = null;
    const flushHunk = () => {
        if (cur && curHunk)
            cur.hunks.push(curHunk);
        curHunk = null;
    };
    const flushFile = () => {
        flushHunk();
        if (cur)
            files.push(cur);
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
        if (!cur)
            continue;
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
        if ((line.startsWith("old mode ") || line.startsWith("new mode ")) &&
            cur.hunks.length === 0) {
            if (cur.changeType === "modify")
                cur.changeType = "mode";
            continue;
        }
        if (line.startsWith("Binary files")) {
            cur.isBinary = true;
            cur.changeType =
                cur.changeType === "modify" ? "binary" : cur.changeType;
            continue;
        }
        // Ignore `index`, `---`, `+++`, `similarity index`, `\ No newline` markers.
        if (line.startsWith("index ") ||
            line.startsWith("--- ") ||
            line.startsWith("+++ ") ||
            line.startsWith("similarity index") ||
            line.startsWith("dissimilarity index") ||
            line.startsWith("\\ No newline")) {
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
            if (line.startsWith("+"))
                curHunk.addedLines++;
            else if (line.startsWith("-"))
                curHunk.removedLines++;
            continue;
        }
    }
    flushFile();
    return files;
}
/**
 * Split one hunk into multiple valid sub-hunks of at most ~maxLines body lines
 * each, cutting only at context-line boundaries so each sub-hunk has leading
 * context and the old/new line accounting stays exact. Returns the hunk
 * unchanged (in a single-element array) when it is already small enough.
 */
export function splitHunk(hunk, maxLines) {
    const body = hunk.patch.split("\n");
    // First line is the @@ header; drop a trailing empty entry from the split.
    const lines = body.slice(1).filter((l, i) => !(i === body.length - 2 && l === ""));
    if (lines.length <= maxLines)
        return [hunk];
    const result = [];
    let oldLine = hunk.oldStart;
    let newLine = hunk.newStart;
    let winLines = [];
    let winOldStart = oldLine;
    let winNewStart = newLine;
    let winOld = 0;
    let winNew = 0;
    let winAdded = 0;
    let winRemoved = 0;
    const flush = () => {
        if (winLines.length === 0)
            return;
        const header = `@@ -${winOldStart},${winOld} +${winNewStart},${winNew} @@${hunk.section ? " " + hunk.section : ""}`;
        result.push({
            header,
            oldStart: winOldStart,
            oldLines: winOld,
            newStart: winNewStart,
            newLines: winNew,
            section: hunk.section,
            patch: header + "\n" + winLines.join("\n") + "\n",
            addedLines: winAdded,
            removedLines: winRemoved,
        });
        winLines = [];
        winOld = 0;
        winNew = 0;
        winAdded = 0;
        winRemoved = 0;
    };
    for (const line of lines) {
        const isContext = line.startsWith(" ") || line === "";
        // Cut before a context line once the window is large enough, so the next
        // sub-hunk starts with context.
        if (winLines.length >= maxLines && isContext) {
            flush();
            winOldStart = oldLine;
            winNewStart = newLine;
        }
        winLines.push(line);
        if (line.startsWith("+")) {
            winNew++;
            newLine++;
            winAdded++;
        }
        else if (line.startsWith("-")) {
            winOld++;
            oldLine++;
            winRemoved++;
        }
        else {
            winOld++;
            winNew++;
            oldLine++;
            newLine++;
        }
    }
    flush();
    return result;
}
//# sourceMappingURL=diffParser.js.map
/**
 * Recover an external tracker issue key (e.g. "PROJ-123") from a branch name.
 *
 * The regex comes from config (`jira.issueKeyRegex`); the first match in the
 * branch wins. Returns null when nothing matches — correlation is best-effort,
 * and an explicit `--issue` flag always overrides this at the call site.
 */
export function extractIssueKey(branch, regexSource) {
    let re;
    try {
        re = new RegExp(regexSource);
    }
    catch {
        return null; // a malformed configured regex shouldn't crash create
    }
    const m = branch.match(re);
    return m ? m[0] : null;
}
//# sourceMappingURL=issueKey.js.map
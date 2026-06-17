import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { prwalkDir } from "./paths.js";
export const DEFAULT_CONFIG = {
    tracker: null,
    jira: {
        baseUrl: "",
        issueKeyRegex: "[A-Z][A-Z0-9]+-\\d+",
        remote: "origin",
        reviewer: null,
        transitions: {
            // A freshly-created review (nothing decided yet) is "draft" — at the
            // submission moment that is the "ready for review" state, so map both.
            draft: "In Review",
            in_review: "In Review",
            changes_requested: "In Progress",
            approved: "Done",
        },
    },
};
export function configPath(repoRoot) {
    return join(prwalkDir(repoRoot), "config.json");
}
/**
 * Load `.prwalk/config.json`, deep-merged onto the defaults. Returns the
 * defaults (tracker disabled) when the file is absent. Throws only on malformed
 * JSON so a typo surfaces rather than silently disabling integration.
 */
export async function loadConfig(repoRoot) {
    const path = configPath(repoRoot);
    if (!existsSync(path))
        return DEFAULT_CONFIG;
    let raw;
    try {
        raw = JSON.parse(await readFile(path, "utf8"));
    }
    catch (e) {
        throw new Error(`prwalk: ${path} is not valid JSON: ${e.message}`);
    }
    const obj = (raw ?? {});
    return {
        tracker: obj.tracker ?? DEFAULT_CONFIG.tracker,
        jira: {
            ...DEFAULT_CONFIG.jira,
            ...(obj.jira ?? {}),
            transitions: {
                ...DEFAULT_CONFIG.jira.transitions,
                ...(obj.jira?.transitions ?? {}),
            },
        },
    };
}
/** Build the canonical browse URL for an issue, or null without a baseUrl. */
export function issueUrl(config, issueKey) {
    const base = config.jira.baseUrl.replace(/\/+$/, "");
    if (!base)
        return null;
    return `${base}/browse/${issueKey}`;
}
//# sourceMappingURL=config.js.map
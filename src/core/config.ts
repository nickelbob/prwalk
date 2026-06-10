import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { prwalkDir } from "./paths.js";
import type { PrStatus } from "./schema.js";

/**
 * Team-shared prwalk configuration, committed at `.prwalk/config.json`. Holds
 * conventions only — NEVER secrets. The (future) native JIRA executor reads
 * credentials from the environment (JIRA_BASE_URL / JIRA_EMAIL / JIRA_API_TOKEN),
 * not from this file.
 */
export interface JiraConfig {
  /** e.g. "https://acme.atlassian.net" — used to build issue browse URLs. */
  baseUrl: string;
  /** Regex (as a string) used to pull an issue key out of a branch name. */
  issueKeyRegex: string;
  /** Git remote reviewers fetch from. */
  remote: string;
  /** Default assignee for the review (accountId or email); null = unchanged. */
  reviewer: string | null;
  /** Map a derived PR status to the JIRA transition (status) name to apply. */
  transitions: Partial<Record<PrStatus, string>>;
}

export interface PrwalkConfig {
  tracker: "jira" | null;
  jira: JiraConfig;
}

export const DEFAULT_CONFIG: PrwalkConfig = {
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

export function configPath(repoRoot: string): string {
  return join(prwalkDir(repoRoot), "config.json");
}

/**
 * Load `.prwalk/config.json`, deep-merged onto the defaults. Returns the
 * defaults (tracker disabled) when the file is absent. Throws only on malformed
 * JSON so a typo surfaces rather than silently disabling integration.
 */
export async function loadConfig(repoRoot: string): Promise<PrwalkConfig> {
  const path = configPath(repoRoot);
  if (!existsSync(path)) return DEFAULT_CONFIG;
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(path, "utf8"));
  } catch (e) {
    throw new Error(`prwalk: ${path} is not valid JSON: ${(e as Error).message}`);
  }
  const obj = (raw ?? {}) as Partial<PrwalkConfig> & { jira?: Partial<JiraConfig> };
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
export function issueUrl(config: PrwalkConfig, issueKey: string): string | null {
  const base = config.jira.baseUrl.replace(/\/+$/, "");
  if (!base) return null;
  return `${base}/browse/${issueKey}`;
}

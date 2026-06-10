import type { Manifest, PrStatus } from "./schema.js";
import type { PrwalkConfig } from "./config.js";
import { buildStatusReport } from "./report.js";

/**
 * A tracker-agnostic description of what should happen in the issue tracker for
 * the current review state. It is PURE DATA: prwalk computes it; an executor
 * (the orchestrating agent via its JIRA tools, or a future native REST client)
 * carries it out. No I/O, no credentials here.
 */
export interface SyncPlan {
  issueKey: string | null;
  issueUrl: string | null;
  /** The derived prwalk status this plan reflects. */
  prStatus: PrStatus;
  /** JIRA transition (target status name) to apply, or null if none mapped. */
  transition: string | null;
  /** Comment body to post on the issue (markdown-ish, JIRA-renderable). */
  comment: string;
  /** Who to assign (accountId/email), or null to leave the assignee unchanged. */
  assignee: string | null;
  /** The reviewer-facing command/link to open the review. */
  reviewLink: string;
  /**
   * True when there is no issueKey or no tracker configured — the plan is still
   * returned (for inspection) but an executor should treat it as a no-op.
   */
  noop: boolean;
}

/**
 * The command a reviewer runs to open the review. With reviewer-hosted git
 * transport there is no URL to click — the manifest travels in git, so the
 * "link" is a command keyed by the issue (or the branch as a fallback).
 */
export function reviewCommand(issueKey: string | null, branch: string): string {
  return issueKey ? `prwalk review ${issueKey}` : `prwalk review --branch ${branch}`;
}

function composeComment(
  manifest: Manifest,
  status: PrStatus,
  reviewLink: string,
): string {
  const report = buildStatusReport(manifest, null);
  const { round } = report;
  const level = report.reviewLevel;
  const levelNote =
    level !== null
      ? ` at risk level ${level}+ (${report.autoAccepted} lower-risk chunk(s) auto-accepted)`
      : "";

  switch (status) {
    case "approved":
      return [
        `✅ **prwalk: approved** — round ${round}.`,
        `${report.counts.accepted} chunk(s) accepted${levelNote}.`,
        `Audit log committed at \`.prwalk/${slugLine(manifest)}.json\`.`,
      ].join("\n");

    case "changes_requested": {
      const lines = [
        `🔴 **prwalk: changes requested** — round ${round}.`,
        `${report.counts.rejected} chunk(s) need changes:`,
        ...report.rejected.map(
          (c) => `- \`${c.file}\` — ${c.feedback?.trim() || "(see review)"}`,
        ),
      ];
      return lines.join("\n");
    }

    case "in_review":
    case "draft":
    default:
      return [
        `▶ **prwalk: ready for review** — round ${round}.`,
        `${report.counts.total} chunk(s)${levelNote}.`,
        ``,
        `Open it: \`${reviewLink}\``,
      ].join("\n");
  }
}

function slugLine(manifest: Manifest): string {
  // Mirror branchToSlug without importing it to keep this module dependency-light
  // for the comment text only.
  return manifest.pr.branch.replace(/[/\\]/g, "-").replace(/[^A-Za-z0-9._-]/g, "_");
}

/**
 * Build the SyncPlan for a manifest given the team config. Pure + deterministic.
 */
export function buildSyncPlan(
  manifest: Manifest,
  config: PrwalkConfig,
  reviewLink?: string,
): SyncPlan {
  const report = buildStatusReport(manifest, null);
  const status = report.status;
  const issueKey = manifest.pr.issueKey;
  const link = reviewLink ?? reviewCommand(issueKey, manifest.pr.branch);
  const transition = config.jira.transitions[status] ?? null;

  // Assign the reviewer when work is going TO them; hand back to the author
  // (leave unchanged here) when changes are requested.
  const assignee =
    status === "in_review" || status === "draft" ? config.jira.reviewer : null;

  return {
    issueKey,
    issueUrl: manifest.pr.issueUrl,
    prStatus: status,
    transition,
    comment: composeComment(manifest, status, link),
    assignee,
    reviewLink: link,
    noop: !issueKey || config.tracker === null,
  };
}

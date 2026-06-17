# prwalk

A PR-style **walkthrough review** tool for the *human-reviews-agent-code* workflow.

An AI agent writes and commits code on a branch, computes a review manifest, and
sends you a localhost link. You walk the change chunk-by-chunk with the agent's
descriptions and **accept** or **reject** each chunk (rejections carry free-text
"what I want instead"). Every decision is recorded into a self-contained JSON
audit log committed into the repo — and the full history of every code version
and every decision is preserved across revision rounds.

prwalk **never edits your source code**. It only records understanding and
decisions. Rejections are feedback the agent reads and acts on in the next round.

## Install

```bash
npm install
npm run build
npm link          # exposes the global `prwalk` command
```

`prwalk` operates on the current working directory's git repo.

## The loop

| Step | Who | Command |
|------|-----|---------|
| 1. Commit code on a branch (`feat/PROJ-123-…`) | agent | `git commit …` |
| 2. Build the review manifest | agent | `prwalk create --base main` |
| 3. Annotate descriptions / sections / **risk 1–5** | agent | edit `.prwalk/<branch>.json` |
| 4. Push the branch + announce the review on the issue | agent | `git push` then `prwalk sync` |
| 5. Open the review (fetches the branch, serves locally) | **you** | `prwalk review PROJ-123` |
| 6. Pick a review level, review in-scope chunks one-at-a-time | **you** | accept / reject in the browser |
| 7. Read decisions back | agent | `prwalk status --json` |
| 8. Sync the outcome to the issue | agent | `prwalk sync --json` → execute via JIRA tools |
| 9. Revise rejected code, commit, push | agent | `git commit … && git push` |
| 10. Re-run create (round 2…) | agent | `prwalk create --base main` |
| 11. Re-review only what changed | **you** | accepted-unchanged chunks stay accepted |
| 12. Commit the audit log | **you** | `prwalk commit-msg` suggests a message |

Repeat 6–11 until `prwalk status` reports **approved**.

### What a review does (and doesn't)
Reviewing is deliberately low-side-effect. As you accept/reject, each decision
is written to the audit log (`.prwalk/<branch>.json`) and **`git add`-staged** —
live. That's it. prwalk **never commits** (you commit the log) and **reviewing
never touches JIRA** (the tracker only moves when someone runs `prwalk sync`).
The completion screen and `prwalk status` both spell out this state — what's
saved, what's still uncommitted, and the next step for you vs. the agent.

## Risk-gated, one-at-a-time review

You don't have to look at everything. The PR creator (agent) tags each chunk with
a **risk level 1–5** (1 trivial … 5 critical) in the manifest. When you open a
review, you pick the level you want to review at — e.g. "**3 and up**". prwalk then:

- puts the in-scope chunks (risk ≥ your level) in front of you **one at a time** —
  read it, Accept or Reject with feedback, and it advances to the next;
- **auto-accepts** everything below your level, recorded in the audit log as
  `accepted (auto · under threshold N)` so it's honest that you didn't individually
  review it. The PR can still reach `approved`.

Your explicit decisions are sticky: changing the level never overrides a chunk you
actually clicked. Lowering the level reopens previously auto-accepted chunks for
review. An **overview** toggle still shows the whole list if you want it.

The agent should set each chunk's `risk` in `.prwalk/<branch>.json` (a heuristic
default is filled in but caps at 3 — genuinely risky changes must be elevated to
4/5 deliberately).

## Commands

- `prwalk create --base <ref> [--branch <name>] [--title "..."] [--max-hunk-lines N] [--json]`
  Diffs the branch vs its merge-base with `<ref>`, splits into chunks, and
  scaffolds or **merges** `.prwalk/<branch>.json` (carrying prior decisions +
  annotations across rounds). Stages the file with `git add`. prwalk's own
  `.prwalk/` logs are excluded from the reviewed diff.
- `prwalk serve [branch] [--port 7777] [--open] [--dev] [--json]`
  Starts the review server (serves *all* reviews, routed by slug) and prints the
  link. Auto-increments the port on conflict unless `--port` is explicit.
- `prwalk status [branch] [--json]`
  The agent's read path. `--json` returns `{status, counts, rejected[], pending[], stale, …}`.
- `prwalk sync [branch] [--json] [--execute] [--dry-run]`
  Emits the **SyncPlan** for the review's current state — the JIRA transition,
  comment, and assignee that should follow. Prints it for the orchestrating
  agent to execute via its own JIRA tools (`--json` for machine consumption), or
  applies it directly with `--execute` (native REST client; reads `JIRA_BASE_URL`
  / `JIRA_EMAIL` / `JIRA_API_TOKEN` from the environment). `--dry-run` shows what
  `--execute` would do without contacting JIRA.
- `prwalk review <ISSUE-KEY> [--branch <name>] [--remote <name>] [--port N]`
  The **reviewer's** entry point. Fetches the remote, resolves the branch
  carrying that issue key (or `--branch`), checks it out, and serves the review
  locally. The manifest embeds its diffs, so reviewing needs no build.
- `prwalk list [--json]` — all reviews in the repo with status + counts.
- `prwalk commit-msg [branch]` — prints (never runs) a suggested commit message.

## JIRA + git integration

prwalk hooks into a JIRA + git SDLC through four seams, with **git as the
transport** (the committed manifest rides the branch) and **JIRA as the inbox +
audit destination**. No hosted service, and prwalk never holds JIRA credentials.

- **Correlate** — `prwalk create` extracts the issue key from the branch name
  (`feat/PROJ-123-login` → `PROJ-123`, regex configurable) or takes `--issue
  PROJ-123`, and records `pr.issueKey` / `pr.issueUrl` in the manifest.
- **Deliver** — the reviewer runs `prwalk review PROJ-123`; it fetches and
  serves the branch's committed review locally. Each reviewer hosts their own.
- **Sync back** — `prwalk sync` computes a pure **SyncPlan** (status →
  transition + comment + assignee). The orchestrating agent executes it with its
  JIRA tools; a native REST executor is the later headless/CI option.
- **Configure** — `.prwalk/config.json` (committed, team-shared) holds the issue
  regex, remote, reviewer, and the status→transition mapping. **Secrets never go
  here** — the future native executor reads `JIRA_BASE_URL` / `JIRA_EMAIL` /
  `JIRA_API_TOKEN` from the environment.

```jsonc
// .prwalk/config.json
{
  "tracker": "jira",
  "jira": {
    "baseUrl": "https://acme.atlassian.net",
    "issueKeyRegex": "[A-Z][A-Z0-9]+-\\d+",
    "remote": "origin",
    "reviewer": "<accountId|email>",
    "transitions": {
      "draft": "In Review", "in_review": "In Review",
      "changes_requested": "In Progress", "approved": "Done"
    }
  }
}
```

The derived status maps to a transition: a fresh/handed-off review → **In
Review** (assigned to the reviewer); any rejection → **In Progress** (back to the
author, with each `file — feedback` in the comment); all-accepted → **Done**.
Without a tracker configured or an issue key, `sync` is a no-op and just prints
the reviewer command.

## How chunk identity survives revisions

When the agent revises after a rejection, `create` recomputes the diff and
re-matches chunks to the prior round:

- **unchanged content** (content hash match) → same identity, **decision kept**
  (an accepted chunk stays accepted even if surrounding lines moved);
- **revised content** at the same locus (header hash / nearby line) → same
  identity, **decision reset to pending** so it re-surfaces for review;
- **new** hunks become new chunks; **vanished** chunks are marked `absent`
  (kept for history, never deleted).

The agent only annotates new/revised chunks each round.

## Audit log

`.prwalk/<branch>.json` is committed to the repo as the durable record:
`pr` metadata, `rounds[]`, `sections[]`, the current `chunks[]`, and an
append-only `events[]` log (every code revision + every accept/reject). It is
self-contained — the diff content is embedded, so the review is reproducible
from the file alone.

## Development

```bash
npm run dev:server     # prwalk serve --dev (API only, CORS)
npm run dev:client     # vite dev server with HMR (proxies /api)
npm test               # vitest unit tests
```

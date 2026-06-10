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
| 1. Commit code on a branch | agent | `git commit …` |
| 2. Build the review manifest | agent | `prwalk create --base main` |
| 3. Annotate descriptions / sections / **risk 1–5** | agent | edit `.prwalk/<branch>.json` |
| 4. Serve + send the link | agent | `prwalk serve` → `http://localhost:7777/r/<slug>` |
| 5. Pick a review level, review in-scope chunks one-at-a-time | **you** | accept / reject in the browser |
| 6. Read decisions back | agent | `prwalk status --json` |
| 7. Revise rejected code, commit | agent | `git commit …` |
| 8. Re-run create (round 2…) | agent | `prwalk create --base main` |
| 9. Re-review only what changed | **you** | accepted-unchanged chunks stay accepted |
| 10. Commit the audit log | **you** | `prwalk commit-msg` suggests a message |

Repeat 5–9 until `prwalk status` reports **approved**.

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
- `prwalk list [--json]` — all reviews in the repo with status + counts.
- `prwalk commit-msg [branch]` — prints (never runs) a suggested commit message.

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

#!/usr/bin/env node
import { Command } from "commander";
import { isGitRepo } from "../core/git.js";
import { cmdCreate } from "./commands/create.js";
import { cmdServe } from "./commands/serve.js";
import { cmdStatus } from "./commands/status.js";
import { cmdList } from "./commands/list.js";
import { cmdCommitMsg } from "./commands/commitMsg.js";
import { cmdSync } from "./commands/sync.js";
import { cmdReview } from "./commands/review.js";

async function requireRepo(): Promise<string> {
  const cwd = process.cwd();
  if (!(await isGitRepo(cwd))) {
    process.stderr.write(`prwalk: not a git repository (cwd: ${cwd})\n`);
    process.exit(1);
  }
  return cwd;
}

const program = new Command();
program
  .name("prwalk")
  .description("PR-style walkthrough review for human-reviews-agent-code")
  .version("0.1.0");

program
  .command("create")
  .description("Compute the diff and scaffold/merge the review manifest")
  .requiredOption("--base <ref>", "base ref to diff against (e.g. main)")
  .option("--branch <name>", "branch to review (default: current branch)")
  .option("--title <title>", "PR title")
  .option("--issue <key>", "tracker issue key (default: extracted from branch)")
  .option("--max-hunk-lines <n>", "truncate hunks longer than this", (v) => parseInt(v, 10))
  .option("--json", "machine-readable output")
  .action(async (opts) => {
    const cwd = await requireRepo();
    await cmdCreate(cwd, opts);
  });

program
  .command("serve")
  .description("Start the review server and print the link")
  .argument("[branch]", "branch to deep-link to")
  .option("--port <n>", "port (default 7777)", (v) => parseInt(v, 10))
  .option("--open", "open the browser")
  .option("--dev", "dev mode: API only, permissive CORS")
  .option("--json", "machine-readable output")
  .action(async (branch, opts) => {
    const cwd = await requireRepo();
    await cmdServe(cwd, branch, opts);
  });

program
  .command("status")
  .description("Print review status (the agent's read path)")
  .argument("[branch]", "branch (default: current branch)")
  .option("--json", "machine-readable output")
  .action(async (branch, opts) => {
    const cwd = await requireRepo();
    await cmdStatus(cwd, branch, opts);
  });

program
  .command("list")
  .description("List all reviews in this repo")
  .option("--json", "machine-readable output")
  .action(async (opts) => {
    const cwd = await requireRepo();
    await cmdList(cwd, opts);
  });

program
  .command("sync")
  .description("Emit the tracker SyncPlan (transition + comment + assignee) for the review")
  .argument("[branch]", "branch (default: current branch)")
  .option("--json", "machine-readable output")
  .option("--execute", "execute via the native JIRA client (not yet implemented)")
  .action(async (branch, opts) => {
    const cwd = await requireRepo();
    await cmdSync(cwd, branch, opts);
  });

program
  .command("review")
  .description("Reviewer entry: fetch the branch for an issue and serve the review locally")
  .argument("<issue>", "tracker issue key (e.g. PROJ-123)")
  .option("--branch <name>", "review this branch directly (skip issue lookup)")
  .option("--remote <name>", "git remote to fetch from (default: from config or 'origin')")
  .option("--port <n>", "port (default 7777)", (v) => parseInt(v, 10))
  .option("--open", "open the browser")
  .action(async (issue, opts) => {
    const cwd = await requireRepo();
    await cmdReview(cwd, issue, opts);
  });

program
  .command("commit-msg")
  .description("Print a suggested commit message for the staged audit log")
  .argument("[branch]", "branch (default: current branch)")
  .action(async (branch) => {
    const cwd = await requireRepo();
    await cmdCommitMsg(cwd, branch);
  });

program.parseAsync(process.argv).catch((err) => {
  process.stderr.write(`prwalk: ${(err as Error).message}\n`);
  process.exit(1);
});

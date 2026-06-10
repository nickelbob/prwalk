import { createReview } from "../../core/create.js";
import { branchToSlug } from "../../core/paths.js";

export interface CreateOpts {
  base: string;
  branch?: string;
  title?: string;
  maxHunkLines?: number;
  json?: boolean;
}

export async function cmdCreate(cwd: string, opts: CreateOpts): Promise<void> {
  const result = await createReview(cwd, {
    base: opts.base,
    branch: opts.branch,
    title: opts.title,
    maxHunkLines: opts.maxHunkLines,
  });
  const { counts, branch, round, baseSha, headSha, manifestPath, warnings } = result;
  const slug = branchToSlug(branch);

  if (opts.json) {
    process.stdout.write(
      JSON.stringify({
        branch,
        slug,
        round,
        baseSha,
        headSha,
        counts,
        manifestPath,
        warnings,
      }) + "\n",
    );
    return;
  }

  if (counts.total === 0 && counts.new === 0) {
    process.stdout.write(
      `prwalk: no changes between ${opts.base} and ${branch} — nothing to review.\n`,
    );
    return;
  }

  const lines: string[] = [];
  lines.push(
    `prwalk: round ${round} ${round === 1 ? "created" : "updated"} for ${branch} (base ${opts.base} @ ${baseSha.slice(0, 7)}, head ${headSha.slice(0, 7)})`,
  );
  if (round === 1) {
    lines.push(`  ${counts.total} chunk(s) to review`);
  } else {
    lines.push(
      `  ${counts.total} live chunk(s) — ${counts.new} new, ${counts.revised} revised (re-review needed), ${counts.unchanged} unchanged (carried), ${counts.absent} no longer in diff`,
    );
  }
  for (const w of warnings) lines.push(`  warning: ${w}`);
  lines.push(`  Edit each chunk's description AND risk (1=trivial … 5=critical) in ${manifestPath}`);
  lines.push(`  (risk drives what the reviewer sees; heuristic defaults are set but cap at 3 — elevate genuinely risky chunks)`);
  lines.push(`  Then run: prwalk serve ${slug}`);
  process.stdout.write(lines.join("\n") + "\n");
}

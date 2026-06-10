import { Router } from "express";
import type { ReviewStore } from "./persistence.js";
import { buildStatusReport, suggestCommitMessage } from "../core/report.js";
import { countDecisions, deriveStatus } from "../core/status.js";
import { SCHEMA_VERSION } from "../core/schema.js";

export function apiRouter(
  store: ReviewStore,
  opts: { readOnly?: boolean } = {},
): Router {
  const r = Router();
  const readOnly = opts.readOnly ?? false;

  r.get("/health", (_req, res) => {
    res.json({ ok: true, schemaVersion: SCHEMA_VERSION, readOnly });
  });

  // Chooser list.
  r.get("/reviews", async (_req, res) => {
    const items = await store.list();
    res.json(
      items.map(({ slug, manifest }) => ({
        slug,
        branch: manifest.pr.branch,
        title: manifest.pr.title,
        round: manifest.pr.currentRound,
        status: deriveStatus(manifest),
        counts: countDecisions(manifest),
      })),
    );
  });

  // Full manifest + derived status + staleness.
  r.get("/reviews/:slug", async (req, res) => {
    const manifest = await store.load(req.params.slug);
    if (!manifest) return res.status(404).json({ error: "not found" });
    const liveHead = await store.liveHeadSha(manifest.pr.branch);
    res.json({
      manifest,
      status: deriveStatus(manifest),
      counts: countDecisions(manifest),
      stale: liveHead !== null && liveHead !== manifest.pr.headSha,
      liveHeadSha: liveHead,
      readOnly,
    });
  });

  r.get("/reviews/:slug/status", async (req, res) => {
    const manifest = await store.load(req.params.slug);
    if (!manifest) return res.status(404).json({ error: "not found" });
    const liveHead = await store.liveHeadSha(manifest.pr.branch);
    res.json(buildStatusReport(manifest, liveHead));
  });

  // Per-chunk history (revision + decision events).
  r.get("/reviews/:slug/chunk/:stableId/history", async (req, res) => {
    const manifest = await store.load(req.params.slug);
    if (!manifest) return res.status(404).json({ error: "not found" });
    const events = manifest.events.filter(
      (e) => "chunkStableId" in e && e.chunkStableId === req.params.stableId,
    );
    res.json({ stableId: req.params.stableId, events });
  });

  // Record an accept/reject decision.
  r.post("/reviews/:slug/decisions", async (req, res) => {
    if (readOnly) {
      return res.status(423).json({
        error:
          "This prwalk server is read-only because another server instance owns writes for this repo. Stop the other server, or use it to record decisions.",
      });
    }
    const { stableId, revisionId, action, feedback } = req.body ?? {};
    if (!stableId || !revisionId || (action !== "accept" && action !== "reject")) {
      return res.status(400).json({ error: "stableId, revisionId, action(accept|reject) required" });
    }
    try {
      const { manifest, chunk } = await store.decide(req.params.slug, {
        stableId,
        revisionId,
        action,
        feedback: feedback ?? null,
        actor: "developer",
      });
      res.json({
        chunk,
        status: deriveStatus(manifest),
        counts: countDecisions(manifest),
      });
    } catch (err) {
      res.status(409).json({ error: (err as Error).message });
    }
  });

  // Staleness check.
  r.post("/reviews/:slug/refresh", async (req, res) => {
    const manifest = await store.load(req.params.slug);
    if (!manifest) return res.status(404).json({ error: "not found" });
    const liveHead = await store.liveHeadSha(manifest.pr.branch);
    res.json({
      stale: liveHead !== null && liveHead !== manifest.pr.headSha,
      liveHeadSha: liveHead,
      headShaAtCreate: manifest.pr.headSha,
    });
  });

  r.get("/reviews/:slug/commit-message", async (req, res) => {
    const manifest = await store.load(req.params.slug);
    if (!manifest) return res.status(404).json({ error: "not found" });
    res.json({ message: suggestCommitMessage(manifest) });
  });

  return r;
}

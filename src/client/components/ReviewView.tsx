import { useEffect, useMemo, useRef, useState } from "react";
import type { Chunk, Manifest, Section } from "../types.js";
import { ChunkCard } from "./ChunkCard.js";

interface Group {
  section: Section | null;
  open: Chunk[]; // pending / rejected / stale — in the review flow
  accepted: Chunk[]; // accepted — collapsed out of the flow
}

function buildGroups(manifest: Manifest): Group[] {
  const live = manifest.chunks.filter((c) => !c.absent);
  const sections = [...manifest.sections].sort((a, b) => a.order - b.order);
  const groups: Group[] = [];

  const placeChunks = (chunks: Chunk[]): { open: Chunk[]; accepted: Chunk[] } => {
    const sorted = chunks.sort(
      (a, b) => a.sectionOrder - b.sectionOrder || a.order - b.order,
    );
    return {
      open: sorted.filter((c) => c.decision.state !== "accepted"),
      accepted: sorted.filter((c) => c.decision.state === "accepted"),
    };
  };

  if (sections.length > 0) {
    for (const section of sections) {
      const chunks = live.filter((c) => c.sectionId === section.id);
      if (chunks.length === 0) continue;
      groups.push({ section, ...placeChunks(chunks) });
    }
    const ungrouped = live.filter(
      (c) => !c.sectionId || !sections.some((s) => s.id === c.sectionId),
    );
    if (ungrouped.length) groups.push({ section: null, ...placeChunks(ungrouped) });
  } else {
    groups.push({ section: null, ...placeChunks(live) });
  }
  return groups;
}

export function ReviewView({
  manifest,
  slug,
  busy,
  readOnly,
  onAccept,
  onReject,
}: {
  manifest: Manifest;
  slug: string;
  busy: Set<string>;
  readOnly: boolean;
  onAccept: (c: Chunk) => void;
  onReject: (c: Chunk, feedback: string) => void;
}) {
  const groups = useMemo(() => buildGroups(manifest), [manifest]);
  const flowChunks = useMemo(() => groups.flatMap((g) => g.open), [groups]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const refs = useRef(new Map<string, HTMLDivElement>());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Default the active chunk to the first one in the flow.
  useEffect(() => {
    if (activeId && flowChunks.some((c) => c.stableId === activeId)) return;
    setActiveId(flowChunks[0]?.stableId ?? null);
  }, [flowChunks, activeId]);

  const scrollTo = (id: string) => {
    refs.current.get(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  // Keyboard navigation: j/k move, a accept, r begins reject (handled in card).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT") return;
      const idx = flowChunks.findIndex((c) => c.stableId === activeId);
      if (e.key === "j") {
        const next = flowChunks[Math.min(idx + 1, flowChunks.length - 1)];
        if (next) { setActiveId(next.stableId); scrollTo(next.stableId); }
      } else if (e.key === "k") {
        const prev = flowChunks[Math.max(idx - 1, 0)];
        if (prev) { setActiveId(prev.stableId); scrollTo(prev.stableId); }
      } else if (e.key === "a" && activeId && !readOnly) {
        const c = flowChunks[idx];
        if (c) onAccept(c);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flowChunks, activeId, onAccept, readOnly]);

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const renderCard = (c: Chunk) => (
    <ChunkCard
      key={c.stableId}
      chunk={c}
      slug={slug}
      active={c.stableId === activeId}
      busy={busy.has(c.stableId)}
      readOnly={readOnly}
      onAccept={() => onAccept(c)}
      onReject={(fb) => onReject(c, fb)}
      onActivate={() => setActiveId(c.stableId)}
      registerRef={(el) => {
        if (el) refs.current.set(c.stableId, el);
        else refs.current.delete(c.stableId);
      }}
    />
  );

  return (
    <main className="review">
      {groups.map((g, gi) => {
        const key = g.section?.id ?? `__ungrouped_${gi}`;
        const acceptedKey = `accepted:${key}`;
        return (
          <section className="group" key={key}>
            {g.section && (
              <div className="section-head">
                <h2>{g.section.title}</h2>
                {g.section.description && <p>{g.section.description}</p>}
              </div>
            )}
            {g.open.map(renderCard)}
            {g.accepted.length > 0 && (
              <div className="accepted-group">
                <button className="collapse-toggle" onClick={() => toggleExpand(acceptedKey)}>
                  {expanded.has(acceptedKey) ? "▾" : "▸"} Accepted (unchanged) — {g.accepted.length}
                </button>
                {expanded.has(acceptedKey) && g.accepted.map(renderCard)}
              </div>
            )}
          </section>
        );
      })}
      {flowChunks.length === 0 && (
        <div className="all-done">
          ✓ Nothing pending — every chunk has been reviewed.
        </div>
      )}
    </main>
  );
}

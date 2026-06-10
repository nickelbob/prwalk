import type {
  DecisionResponse,
  ReviewListItem,
  ReviewResponse,
} from "./types.js";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchReviews(): Promise<ReviewListItem[]> {
  return json(await fetch("/api/reviews"));
}

export async function fetchReview(slug: string): Promise<ReviewResponse> {
  return json(await fetch(`/api/reviews/${encodeURIComponent(slug)}`));
}

export async function postDecision(
  slug: string,
  input: { stableId: string; revisionId: string; action: "accept" | "reject"; feedback?: string },
): Promise<DecisionResponse> {
  return json(
    await fetch(`/api/reviews/${encodeURIComponent(slug)}/decisions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function fetchCommitMessage(slug: string): Promise<string> {
  const r = await json<{ message: string }>(
    await fetch(`/api/reviews/${encodeURIComponent(slug)}/commit-message`),
  );
  return r.message;
}

export async function fetchChunkHistory(slug: string, stableId: string) {
  return json<{ stableId: string; events: import("./types.js").AuditEvent[] }>(
    await fetch(`/api/reviews/${encodeURIComponent(slug)}/chunk/${stableId}/history`),
  );
}

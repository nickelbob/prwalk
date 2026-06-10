import { createHash, randomUUID } from "node:crypto";

export function nowIso(): string {
  return new Date().toISOString();
}

export function uuid(): string {
  return randomUUID();
}

/** Short stable id with a prefix, e.g. shortId("chk") -> "chk_8a1f2c". */
export function shortId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
}

/** Short hash of a string, prefixed. Deterministic. */
export function shortHash(prefix: string, input: string): string {
  const h = createHash("sha1").update(input).digest("hex").slice(0, 12);
  return `${prefix}_${h}`;
}

/** A short monotonic-ish event id from an integer counter. */
export function eventId(n: number): string {
  return `evt_${String(n).padStart(4, "0")}`;
}

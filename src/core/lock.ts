import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { serveLockPath } from "./paths.js";

export interface LockHolder {
  pid: number;
  port: number;
  startedAt: string;
}

export interface LockResult {
  acquired: boolean;
  /** When not acquired, the live holder currently owning the lock. */
  holder?: LockHolder;
  path: string;
}

function pidAlive(pid: number): boolean {
  try {
    // Signal 0 performs error checking without sending a signal.
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // ESRCH = no such process; EPERM = exists but not ours (still alive).
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Acquire the single-writer server lock for a repo. If another live server
 * already holds it, returns {acquired:false, holder} so the caller can run in
 * read-only mode. A stale lock (dead PID) is reclaimed. Registers process-exit
 * handlers to remove our lock.
 */
export function acquireServerLock(repoRoot: string, port: number): LockResult {
  const path = serveLockPath(repoRoot);
  if (existsSync(path)) {
    try {
      const holder = JSON.parse(readFileSync(path, "utf8")) as LockHolder;
      if (holder.pid !== process.pid && pidAlive(holder.pid)) {
        return { acquired: false, holder, path };
      }
    } catch {
      // Corrupt lock file — treat as stale and overwrite.
    }
  }

  mkdirSync(dirname(path), { recursive: true });
  const holder: LockHolder = {
    pid: process.pid,
    port,
    startedAt: new Date().toISOString(),
  };
  writeFileSync(path, JSON.stringify(holder) + "\n");

  const release = () => {
    try {
      // Only remove if it is still ours.
      const cur = JSON.parse(readFileSync(path, "utf8")) as LockHolder;
      if (cur.pid === process.pid) rmSync(path, { force: true });
    } catch {
      /* already gone */
    }
  };
  process.once("exit", release);
  process.once("SIGINT", () => {
    release();
    process.exit(130);
  });
  process.once("SIGTERM", () => {
    release();
    process.exit(143);
  });

  return { acquired: true, path };
}

import { describe, expect, it } from "vitest";
import { extractIssueKey } from "./issueKey.js";
import { DEFAULT_CONFIG } from "./config.js";

const RE = DEFAULT_CONFIG.jira.issueKeyRegex;

describe("extractIssueKey", () => {
  it("pulls the key out of a conventional branch name", () => {
    expect(extractIssueKey("feat/PROJ-123-login", RE)).toBe("PROJ-123");
    expect(extractIssueKey("PROJ-7", RE)).toBe("PROJ-7");
    expect(extractIssueKey("bugfix/AB12-99/retry", RE)).toBe("AB12-99");
  });

  it("returns null when nothing matches", () => {
    expect(extractIssueKey("feat/login", RE)).toBeNull();
    expect(extractIssueKey("main", RE)).toBeNull();
  });

  it("does not match lowercase project keys (avoids false positives)", () => {
    expect(extractIssueKey("feat/proj-123", RE)).toBeNull();
  });

  it("takes the first match when several keys appear", () => {
    expect(extractIssueKey("PROJ-1-then-PROJ-2", RE)).toBe("PROJ-1");
  });

  it("survives a malformed configured regex without throwing", () => {
    expect(extractIssueKey("feat/PROJ-1", "[unclosed")).toBeNull();
  });
});

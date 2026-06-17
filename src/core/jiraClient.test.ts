import { describe, expect, it } from "vitest";
import {
  buildAuthHeader,
  textToAdf,
  resolveTransitionId,
  describeExecution,
} from "./jiraClient.js";
import type { SyncPlan } from "./sync.js";

describe("buildAuthHeader", () => {
  it("base64-encodes email:token as Basic auth", () => {
    expect(buildAuthHeader("a@b.io", "tok")).toBe(
      "Basic " + Buffer.from("a@b.io:tok").toString("base64"),
    );
  });
});

describe("textToAdf", () => {
  it("wraps blank-line blocks as paragraphs with hard breaks", () => {
    const doc = textToAdf("line one\nline two\n\nsecond para") as any;
    expect(doc.type).toBe("doc");
    expect(doc.content).toHaveLength(2);
    expect(doc.content[0].type).toBe("paragraph");
    // line one, hardBreak, line two
    expect(doc.content[0].content.map((n: any) => n.type)).toEqual([
      "text",
      "hardBreak",
      "text",
    ]);
  });

  it("turns a fenced block into a codeBlock node", () => {
    const doc = textToAdf("intro\n\n```\nprwalk review EX-1\n```") as any;
    const code = doc.content.find((n: any) => n.type === "codeBlock");
    expect(code).toBeTruthy();
    expect(code.content[0].text).toBe("prwalk review EX-1");
  });

  it("never produces empty content", () => {
    const doc = textToAdf("") as any;
    expect(doc.content.length).toBeGreaterThan(0);
  });
});

describe("resolveTransitionId", () => {
  const transitions = [
    { id: "61", name: "Dev Complete" },
    { id: "2", name: "Ready To Merge" },
  ];
  it("matches case-insensitively by name", () => {
    expect(resolveTransitionId(transitions, "dev complete")).toBe("61");
    expect(resolveTransitionId(transitions, "Ready To Merge")).toBe("2");
  });
  it("returns null when no transition matches", () => {
    expect(resolveTransitionId(transitions, "In Review")).toBeNull();
  });
});

describe("describeExecution", () => {
  const base: SyncPlan = {
    issueKey: "EX-1",
    issueUrl: "https://x/browse/EX-1",
    prStatus: "draft",
    transition: "Dev Complete",
    comment: "ready",
    assignee: "acct-1",
    reviewLink: "prwalk review EX-1",
    noop: false,
  };
  it("lists comment + transition + assign in order", () => {
    expect(describeExecution(base).map((a) => a.kind)).toEqual([
      "comment",
      "transition",
      "assign",
    ]);
  });
  it("omits transition/assign when absent", () => {
    const plan = { ...base, transition: null, assignee: null };
    expect(describeExecution(plan).map((a) => a.kind)).toEqual(["comment"]);
  });
  it("is empty for a no-op plan", () => {
    expect(describeExecution({ ...base, noop: true })).toEqual([]);
  });
});

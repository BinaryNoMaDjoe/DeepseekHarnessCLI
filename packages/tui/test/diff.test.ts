import { describe, expect, it } from "vitest";
import { unifiedDiff } from "../src/diff.js";

describe("unifiedDiff", () => {
  it("detects a simple line change", () => {
    const rows = unifiedDiff("a\nb\nc", "a\nB\nc");
    expect(rows).toContainEqual({ kind: "del", text: "b" });
    expect(rows).toContainEqual({ kind: "add", text: "B" });
  });

  it("detects additions", () => {
    const rows = unifiedDiff("a", "a\nb");
    expect(rows).toContainEqual({ kind: "add", text: "b" });
  });

  it("returns unchanged lines as context", () => {
    const rows = unifiedDiff("a\nb", "a\nb");
    expect(rows).toEqual([
      { kind: "context", text: "a" },
      { kind: "context", text: "b" },
    ]);
  });
});

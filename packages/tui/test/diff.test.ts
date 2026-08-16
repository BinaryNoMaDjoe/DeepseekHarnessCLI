import { describe, expect, it } from "vitest";
import { diffWords, pairDiffRows, unifiedDiff } from "../src/diff.js";

describe("diffWords", () => {
  it("marks only the changed words", () => {
    const segments = diffWords("const a = 1;", "const a = 2;");
    expect(segments).toContainEqual({ kind: "same", text: "const a = " });
    expect(segments).toContainEqual({ kind: "del", text: "1;" });
    expect(segments).toContainEqual({ kind: "add", text: "2;" });
  });

  it("handles whole-line replacement", () => {
    const segments = diffWords("old line", "new line");
    expect(segments.some((s) => s.kind === "del" && s.text === "old")).toBe(true);
    expect(segments.some((s) => s.kind === "add" && s.text === "new")).toBe(true);
  });
});

describe("diffWords budget guard", () => {
  it("falls back to a full replace for huge lines instead of quadratic LCS", () => {
    const big = Array.from({ length: 2000 }, (_, i) => "word" + i).join(" ");
    const other = Array.from({ length: 2000 }, (_, i) => "word" + i).join(" ") + " extra";
    const segments = diffWords(big, other);
    expect(segments.length).toBe(2);
    expect(segments[0]!.kind).toBe("del");
    expect(segments[1]!.kind).toBe("add");
  });
});

describe("pairDiffRows", () => {
  it("pairs consecutive del/add lines with word spans", () => {
    const rows = pairDiffRows([
      { kind: "context", text: "header" },
      { kind: "del", text: "const a = 1;" },
      { kind: "add", text: "const a = 2;" },
    ]);
    expect(rows[0]).toEqual({ kind: "context", text: "header", words: [] });
    expect(rows[1]!.kind).toBe("del");
    expect(rows[1]!.words.some((w) => w.kind === "del" && w.text === "1;")).toBe(true);
    expect(rows[2]!.kind).toBe("add");
  });

  it("keeps unpaired add lines as plain rows", () => {
    const rows = pairDiffRows([{ kind: "add", text: "only added" }]);
    expect(rows).toEqual([{ kind: "add", text: "only added", words: [] }]);
  });
});

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

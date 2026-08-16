import { describe, expect, it } from "vitest";
import { filterItems, firstEmptyField, visiblePage } from "../src/dialog-logic.js";
import type { DialogItem } from "../src/store.js";

describe("firstEmptyField", () => {
  it("returns null when every field is filled", () => {
    expect(
      firstEmptyField(
        [
          { key: "provider", label: "provider" },
          { key: "model", label: "model" },
        ],
        { provider: "deepseek-official", model: "deepseek-v4-flash" },
      ),
    ).toBeNull();
  });

  it("finds the first empty field in order", () => {
    const empty = firstEmptyField(
      [
        { key: "provider", label: "provider" },
        { key: "model", label: "model" },
      ],
      { provider: "  ", model: "m" },
    );
    expect(empty?.key).toBe("provider");
  });
});

describe("filterItems", () => {
  const items: DialogItem[] = [
    { id: "a", label: "Alpha", detail: "session-1" },
    { id: "b", label: "Beta", meta: ["topic: css"] },
    { id: "c", label: "Gamma" },
  ];

  it("returns everything for an empty query", () => {
    expect(filterItems(items, "")).toEqual(items);
  });

  it("matches label, detail and meta case-insensitively", () => {
    expect(filterItems(items, "alp").map((i) => i.id)).toEqual(["a"]);
    expect(filterItems(items, "session-1").map((i) => i.id)).toEqual(["a"]);
    expect(filterItems(items, "css").map((i) => i.id)).toEqual(["b"]);
  });

  it("returns empty on no match", () => {
    expect(filterItems(items, "zzz")).toEqual([]);
  });
});

describe("visiblePage", () => {
  const items = Array.from({ length: 25 }, (_, i) => ({ id: String(i), label: "item" + i }));

  it("slices one page", () => {
    const page = visiblePage(items, 1, 12);
    expect(page.length).toBe(12);
    expect(page[0]?.id).toBe("12");
  });

  it("handles the tail page", () => {
    const page = visiblePage(items, 2, 12);
    expect(page.length).toBe(1);
    expect(page[0]?.id).toBe("24");
  });
});

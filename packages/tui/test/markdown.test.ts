import { describe, expect, it } from "vitest";
import { renderMarkdown, stripInline, wrapText } from "../src/markdown.js";

describe("renderMarkdown", () => {
  it("parses fenced code blocks", () => {
    const nodes = renderMarkdown("text before\n\n```ts\nconst a = 1;\n```\n\nafter");
    expect(nodes).toContainEqual({ type: "code", lang: "ts", text: "const a = 1;" });
    expect(nodes.at(-1)).toEqual({ type: "paragraph", text: "after" });
  });

  it("parses headings and bullets", () => {
    const nodes = renderMarkdown("## Title\n- one\n- two");
    expect(nodes).toContainEqual({ type: "heading", level: 2, text: "Title" });
    expect(nodes).toContainEqual({ type: "bullet", text: "one" });
    expect(nodes).toContainEqual({ type: "bullet", text: "two" });
  });
});

describe("stripInline", () => {
  it("removes code and bold markup", () => {
    expect(stripInline("run `npm test` and **stay**")).toBe("run npm test and stay");
  });
});

describe("wrapText", () => {
  it("wraps long lines to width", () => {
    const lines = wrapText("aaa bbb ccc ddd", 10);
    expect(lines.every((line) => line.length <= 10)).toBe(true);
    expect(lines.join(" ")).toBe("aaa bbb ccc ddd");
  });
});

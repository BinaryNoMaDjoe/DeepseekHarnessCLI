import { describe, expect, it } from "vitest";
import { parseInline, renderMarkdown, stripInline, wrapText } from "../src/markdown.js";

describe("renderMarkdown", () => {
  it("parses fenced code blocks", () => {
    const nodes = renderMarkdown("text before\n\n```ts\nconst a = 1;\n```\n\nafter");
    expect(nodes).toContainEqual({ type: "code", lang: "ts", text: "const a = 1;" });
    expect(nodes.at(-1)).toEqual({ type: "paragraph", inline: [{ type: "text", text: "after" }] });
  });

  it("parses headings and bullets", () => {
    const nodes = renderMarkdown("## Title\n- one\n- two");
    expect(nodes).toContainEqual({
      type: "heading",
      level: 2,
      inline: [{ type: "text", text: "Title" }],
    });
    expect(nodes).toContainEqual({
      type: "bullet",
      inline: [{ type: "text", text: "one" }],
      ordered: false,
      index: 0,
    });
  });

  it("parses ordered lists, quotes, hr and tables", () => {
    const nodes = renderMarkdown(
      "1. first\n2. second\n> quoted\n---\n| a | b |\n| - | - |\n| 1 | 2 |",
    );
    expect(nodes).toContainEqual({
      type: "bullet",
      inline: [{ type: "text", text: "first" }],
      ordered: true,
      index: 1,
    });
    expect(nodes).toContainEqual({ type: "quote", inline: [{ type: "text", text: "quoted" }] });
    expect(nodes).toContainEqual({ type: "hr" });
    expect(nodes).toContainEqual({ type: "table", header: ["a", "b"], rows: [["1", "2"]] });
  });
});

describe("parseInline", () => {
  it("parses code, bold and italic spans", () => {
    expect(parseInline("run `npm test` now")).toEqual([
      { type: "text", text: "run " },
      { type: "code", text: "npm test" },
      { type: "text", text: " now" },
    ]);
    expect(parseInline("**bold** and *italic*")).toEqual([
      { type: "bold", text: "bold" },
      { type: "text", text: " and " },
      { type: "italic", text: "italic" },
    ]);
  });

  it("treats unclosed code ticks literally", () => {
    expect(parseInline("a `b")).toEqual([{ type: "text", text: "a `b" }]);
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

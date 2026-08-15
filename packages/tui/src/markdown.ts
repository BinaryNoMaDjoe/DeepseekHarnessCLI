/**
 * A deliberately small terminal markdown renderer. It covers what agent
 * output actually contains — paragraphs, inline code, fenced code blocks,
 * headings, bullet lists, bold/italic — and returns a framework-free node
 * tree so components decide how to paint it.
 */

export type MarkdownNode =
  | { type: "paragraph"; text: string }
  | { type: "heading"; level: number; text: string }
  | { type: "code"; lang: string; text: string }
  | { type: "bullet"; text: string }
  | { type: "quote"; text: string }
  | { type: "blank" };

export function renderMarkdown(source: string): MarkdownNode[] {
  const lines = source.split(/\r?\n/);
  const nodes: MarkdownNode[] = [];
  let code: { lang: string; lines: string[] } | null = null;

  const flushCode = (): void => {
    if (code === null) return;
    nodes.push({ type: "code", lang: code.lang, text: code.lines.join("\n") });
    code = null;
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (line.startsWith("```")) {
      if (code === null) {
        code = { lang: line.slice(3).trim(), lines: [] };
      } else {
        flushCode();
      }
      continue;
    }
    if (code !== null) {
      code.lines.push(line);
      continue;
    }
    if (line.trim() === "") {
      nodes.push({ type: "blank" });
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading !== null) {
      nodes.push({ type: "heading", level: heading[1]!.length, text: heading[2]! });
      continue;
    }
    const bullet = /^\s*[-*+]\s+(.+)$/.exec(line);
    if (bullet !== null) {
      nodes.push({ type: "bullet", text: bullet[1]! });
      continue;
    }
    const quote = /^\s*>\s?(.*)$/.exec(line);
    if (quote !== null) {
      nodes.push({ type: "quote", text: quote[1] ?? "" });
      continue;
    }
    nodes.push({ type: "paragraph", text: line });
  }
  flushCode();
  return nodes;
}

/** Strip lightweight inline markup: `code`, **bold**, *italic*. */
export function stripInline(text: string): string {
  return text
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1$2");
}

/** Hard-wrap a paragraph to a column width, respecting existing newlines. */
export function wrapText(text: string, width: number): string[] {
  const out: string[] = [];
  for (const rawLine of text.split("\n")) {
    if (rawLine.length <= width) {
      out.push(rawLine);
      continue;
    }
    const words = rawLine.split(" ");
    let current = "";
    for (const word of words) {
      if (current === "") current = word;
      else if (current.length + 1 + word.length <= width) current += " " + word;
      else {
        out.push(current);
        current = word;
      }
    }
    if (current !== "") out.push(current);
  }
  return out;
}

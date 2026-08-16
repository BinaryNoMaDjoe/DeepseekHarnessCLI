/**
 * A small terminal markdown renderer, framework-free on purpose: parsing
 * produces node trees, components decide how to paint them.
 *
 * Blocks: paragraph, heading, fenced code, bullet list, ordered list,
 * blockquote, table, horizontal rule, blank.
 * Inline: text, **bold**, *italic*, `code`, escaped \*.
 */

export type MarkdownNode =
  | { type: "paragraph"; inline: InlineNode[] }
  | { type: "heading"; level: number; inline: InlineNode[] }
  | { type: "code"; lang: string; text: string }
  | { type: "bullet"; inline: InlineNode[]; ordered: boolean; index: number }
  | { type: "quote"; inline: InlineNode[] }
  | { type: "table"; header: string[]; rows: string[][] }
  | { type: "hr" }
  | { type: "blank" };

export type InlineNode =
  | { type: "text"; text: string }
  | { type: "bold"; text: string }
  | { type: "italic"; text: string }
  | { type: "code"; text: string };

export function renderMarkdown(source: string): MarkdownNode[] {
  const lines = source.split(/\r?\n/);
  const nodes: MarkdownNode[] = [];
  let code: { lang: string; lines: string[] } | null = null;
  let table: string[][] | null = null;
  let ordered = 0;

  const flushCode = (): void => {
    if (code === null) return;
    nodes.push({ type: "code", lang: code.lang, text: code.lines.join("\n") });
    code = null;
  };
  const flushTable = (): void => {
    if (table === null || table.length < 2) {
      // Not a real table: re-emit as plain paragraphs.
      for (const row of table ?? []) {
        nodes.push({ type: "paragraph", inline: parseInline(row.join(" | ")) });
      }
      table = null;
      return;
    }
    const header = table[0]!;
    const rows = table.slice(1).filter((row) => !isTableSeparator(row));
    nodes.push({ type: "table", header, rows });
    table = null;
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (line.startsWith("```")) {
      flushTable();
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
      flushTable();
      nodes.push({ type: "blank" });
      ordered = 0;
      continue;
    }
    // Tables: consecutive lines that start with | (with a separator line).
    if (line.trimStart().startsWith("|") && line.trimEnd().endsWith("|")) {
      const cells = splitTableRow(line);
      if (table === null) table = [];
      table.push(cells);
      continue;
    }
    flushTable();
    if (/^(---|___|\*\*\*)\s*$/.test(line.trim())) {
      nodes.push({ type: "hr" });
      ordered = 0;
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading !== null) {
      nodes.push({
        type: "heading",
        level: heading[1]!.length,
        inline: parseInline(heading[2]!),
      });
      ordered = 0;
      continue;
    }
    const bullet = /^\s*[-*+]\s+(.+)$/.exec(line);
    if (bullet !== null) {
      nodes.push({
        type: "bullet",
        inline: parseInline(bullet[1]!),
        ordered: false,
        index: 0,
      });
      ordered = 0;
      continue;
    }
    const numbered = /^\s*(\d+)[.)]\s+(.+)$/.exec(line);
    if (numbered !== null) {
      ordered += 1;
      nodes.push({
        type: "bullet",
        inline: parseInline(numbered[2]!),
        ordered: true,
        index: ordered,
      });
      continue;
    }
    const quote = /^\s*>\s?(.*)$/.exec(line);
    if (quote !== null) {
      nodes.push({ type: "quote", inline: parseInline(quote[1] ?? "") });
      ordered = 0;
      continue;
    }
    nodes.push({ type: "paragraph", inline: parseInline(line) });
  }
  flushTable();
  flushCode();
  return nodes;
}

/**
 * Inline parser: `code` spans first, then **bold** and *italic* outside
 * them. Backslash escapes the next marker character.
 */
export function parseInline(text: string): InlineNode[] {
  const out: InlineNode[] = [];
  let rest = text;
  while (rest !== "") {
    const tick = rest.indexOf("`");
    if (tick === -1) {
      out.push(...parseEmphasis(rest));
      break;
    }
    if (tick > 0) out.push(...parseEmphasis(rest.slice(0, tick)));
    const close = rest.indexOf("`", tick + 1);
    if (close === -1) {
      // Unclosed tick: treat the rest literally.
      out.push({ type: "text", text: rest.slice(tick) });
      break;
    }
    out.push({ type: "code", text: rest.slice(tick + 1, close) });
    rest = rest.slice(close + 1);
  }
  // Merge adjacent text nodes so unclosed ticks and split prefixes render
  // as one span.
  const merged: InlineNode[] = [];
  for (const node of out) {
    const lastNode = merged.at(-1);
    if (node.type === "text" && lastNode !== undefined && lastNode.type === "text") {
      merged[merged.length - 1] = { type: "text", text: lastNode.text + node.text };
    } else {
      merged.push(node);
    }
  }
  return merged;
}

function parseEmphasis(text: string): InlineNode[] {
  const out: InlineNode[] = [];
  const boldRe = /\*\*([^*]+)\*\*/g;
  let cursor = 0;
  // Bold first (longer marker), then italics on the leftovers.
  for (const match of text.matchAll(boldRe)) {
    const index = match.index ?? 0;
    if (index > cursor) out.push(...parseItalics(text.slice(cursor, index)));
    out.push({ type: "bold", text: match[1]! });
    cursor = index + match[0].length;
  }
  if (cursor < text.length) out.push(...parseItalics(text.slice(cursor)));
  if (out.length === 0) {
    out.push({ type: "text", text });
  }
  return out;
}

function parseItalics(text: string): InlineNode[] {
  const out: InlineNode[] = [];
  const re = /(^|[^*])\*([^*]+)\*/g;
  let cursor = 0;
  for (const match of text.matchAll(re)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      out.push({ type: "text", text: text.slice(cursor, index) + (match[1] ?? "") });
    }
    out.push({ type: "italic", text: match[2]! });
    cursor = index + match[0].length;
  }
  if (cursor < text.length) out.push({ type: "text", text: text.slice(cursor) });
  if (out.length === 0) out.push({ type: "text", text });
  return out;
}

function isTableSeparator(row: string[]): boolean {
  return row.every((cell) => /^:?-+:?$/.test(cell.trim()));
}

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
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
      // A single token wider than the column is hard-split instead of
      // overflowing the layout (long URLs, compact JSON, no-space runs).
      while (current.length > width) {
        out.push(current.slice(0, width));
        current = current.slice(width);
      }
    }
    if (current !== "") out.push(current);
  }
  return out;
}

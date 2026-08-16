import React from "react";
import { Box, Text } from "ink";
import { diffWords, looksLikeDiff, parseDiff, type DiffLine } from "../diff.js";
import { useTheme } from "../theme-context.js";
import { Spinner } from "./Spinner.js";
import { StatusIcon } from "./StatusIcon.js";

export interface ToolCallRow {
  id: string;
  name: string;
  /** Raw JSON arguments string, as recorded by DSH. */
  args: string;
  result?: { ok: boolean; text: string };
}

const PREVIEW_LINES = 3;
const EXPANDED_LINES = 40;

/**
 * Tool call card v2: status icon (spinner while the turn runs, ✓/✗ when
 * settled), collapsible result body (Ctrl+O, Kimi-style), line-level
 * diff backgrounds with word-level highlights (Claude-style).
 */
export function ToolCallView({
  call,
  width,
  sessionRunning,
  expanded,
}: {
  call: ToolCallRow;
  width: number;
  sessionRunning: boolean;
  expanded: boolean;
}): React.JSX.Element {
  const theme = useTheme();
  const args = summarizeArgs(call.args, Math.max(24, width - call.name.length - 14));
  const settled = call.result !== undefined;
  const pending = !settled && sessionRunning;

  const status = settled
    ? call.result!.ok
      ? ("success" as const)
      : ("error" as const)
    : pending
      ? ("loading" as const)
      : ("pending" as const);

  return (
    <Box flexDirection="column" marginLeft={1}>
      <Text>
        {theme.border("╭─ ")}
        {pending ? <Spinner label="" /> : <StatusIcon status={status} withSpace />}
        {theme.strong(call.name)} {theme.muted(args)}
      </Text>
      {settled && call.result!.text !== "" && expanded ? (
        <ResultBody text={call.result!.text} ok={call.result!.ok} width={Math.max(20, width - 4)} />
      ) : settled && call.result!.text !== "" ? (
        <ResultBody
          text={call.result!.text}
          ok={call.result!.ok}
          width={Math.max(20, width - 4)}
          preview
        />
      ) : null}
      {settled && call.result!.text !== "" ? (
        <Text>
          {theme.border("╰─ ")}
          {theme.muted(expanded ? "ctrl+o collapse" : "ctrl+o expand")}
        </Text>
      ) : (
        <Text>{theme.border("╰" + "─".repeat(Math.min(width - 2, 48)))}</Text>
      )}
    </Box>
  );
}

function ResultBody({
  text,
  ok,
  width: _width,
  preview = false,
}: {
  text: string;
  ok: boolean;
  width: number;
  preview?: boolean;
}): React.JSX.Element {
  const theme = useTheme();
  const limit = preview ? PREVIEW_LINES : EXPANDED_LINES;
  if (looksLikeDiff(text)) {
    const rows = pairDiff(parseDiff(text)).slice(0, limit);
    return (
      <Box flexDirection="column" marginLeft={2}>
        {rows.map((row, index) => (
          <DiffRow key={index} row={row} />
        ))}
      </Box>
    );
  }
  const lines = text.split("\n");
  const head = lines.slice(0, limit);
  const more = lines.length - head.length;
  return (
    <Box flexDirection="column" marginLeft={2}>
      {head.map((line, index) => (
        <Text key={index}>
          {theme.border("│ ")}
          {ok ? theme.dim(line) : theme.error(line)}
        </Text>
      ))}
      {more > 0 ? (
        <Text>
          {theme.border("│ ")}
          {theme.muted("… " + more + " more lines")}
        </Text>
      ) : null}
    </Box>
  );
}

/**
 * One diff row: context lines plain; paired del/add lines render with
 * line-level backgrounds and bold changed words (Claude-style).
 */
function DiffRow({ row }: { row: DiffRowData }): React.JSX.Element {
  const theme = useTheme();
  if (row.kind === "context") {
    return (
      <Text>
        {theme.border("│ ")}
        {theme.dim("  " + row.text)}
      </Text>
    );
  }
  if (row.kind === "del" || row.kind === "add") {
    const bg = row.kind === "del" ? theme.diffRemovedBg : theme.diffAddedBg;
    const mark = row.kind === "del" ? "- " : "+ ";
    const strong = row.kind === "del" ? theme.diffRemoved : theme.diffAdded;
    if (row.words.length === 0) {
      return (
        <Text>
          {theme.border("│ ")}
          {bg(mark + row.text)}
        </Text>
      );
    }
    return (
      <Text>
        {theme.border("│ ")}
        {bg(mark)}
        {row.words.map((segment, index) => (
          <Text key={index}>
            {segment.kind === "same" ? bg(segment.text) : bg(strong(segment.text))}
          </Text>
        ))}
      </Text>
    );
  }
  // file header
  return (
    <Text>
      {theme.border("│ ")}
      {theme.diffMeta(row.text)}
    </Text>
  );
}

type DiffRowData =
  | { kind: "context"; text: string; words: never[] }
  | { kind: "del" | "add"; text: string; words: { kind: "add" | "del" | "same"; text: string }[] }
  | { kind: "meta"; text: string; words: never[] };

/** Pair consecutive del/add lines and compute their word-level changes. */
function pairDiff(rows: DiffLine[]): DiffRowData[] {
  const out: DiffRowData[] = [];
  let i = 0;
  while (i < rows.length) {
    const row = rows[i]!;
    if (row.kind === "del" && rows[i + 1]?.kind === "add") {
      const oldLine = row.text;
      const newLine = rows[i + 1]!.text;
      const words = diffWords(oldLine, newLine);
      out.push({ kind: "del", text: oldLine, words });
      out.push({ kind: "add", text: newLine, words });
      i += 2;
      continue;
    }
    out.push({
      kind: row.kind === "context" ? "context" : row.kind,
      text: row.text,
      words: [],
    });
    i += 1;
  }
  return out;
}

function summarizeArgs(raw: string, max: number): string {
  let text = raw.trim();
  if (text === "") return "";
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    text = Object.entries(parsed)
      .slice(0, 4)
      .map(([key, value]) => {
        const shown = typeof value === "string" ? value : JSON.stringify(value);
        return key + "=" + shown;
      })
      .join("  ");
    if (Object.keys(parsed).length > 4) text += " …";
  } catch {
    // Not JSON: show the raw string.
  }
  return text.length <= max ? text : text.slice(0, max - 1) + "…";
}

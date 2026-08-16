import React from "react";
import { Box, Text } from "ink";
import { looksLikeDiff, parseDiff } from "../diff.js";
import { useTheme } from "../theme-context.js";
import { Spinner } from "./Spinner.js";

export interface ToolCallRow {
  id: string;
  name: string;
  /** Raw JSON arguments string, as recorded by DSH. */
  args: string;
  result?: { ok: boolean; text: string };
}

const MAX_RESULT_LINES = 12;

/**
 * One tool invocation as a bordered card: status icon (spinner while the
 * turn runs, ✓/✗ when settled), tool name, one-line argument summary, and
 * an indented result body (colored diff when the output looks like one).
 */
export function ToolCallView({
  call,
  width,
  sessionRunning,
}: {
  call: ToolCallRow;
  width: number;
  sessionRunning: boolean;
}): React.JSX.Element {
  const theme = useTheme();
  const args = summarizeArgs(call.args, Math.max(24, width - call.name.length - 14));
  const settled = call.result !== undefined;
  const pending = !settled && sessionRunning;

  const status = settled ? (
    call.result!.ok ? (
      theme.ok("✓")
    ) : (
      theme.err("✗")
    )
  ) : pending ? (
    <Spinner label="" />
  ) : (
    theme.secondary("…")
  );

  return (
    <Box flexDirection="column" marginLeft={1}>
      <Text>
        {theme.border("╭─ ")}
        {status} {theme.tool(call.name)} {theme.secondary(args)}
      </Text>
      {settled && call.result!.text !== "" ? (
        <ResultBody text={call.result!.text} ok={call.result!.ok} width={Math.max(20, width - 4)} />
      ) : null}
      <Text>{theme.border("╰" + "─".repeat(Math.min(width - 2, 48)))}</Text>
    </Box>
  );
}

function ResultBody({
  text,
  ok,
  width: _width,
}: {
  text: string;
  ok: boolean;
  width: number;
}): React.JSX.Element {
  const theme = useTheme();
  if (looksLikeDiff(text)) {
    const rows = parseDiff(text).slice(0, MAX_RESULT_LINES);
    return (
      <Box flexDirection="column" marginLeft={2}>
        {rows.map((row, index) => (
          <Text key={index}>
            {theme.border("│ ")}
            {row.kind === "add"
              ? theme.diffAdd("+ " + row.text)
              : row.kind === "del"
                ? theme.diffDel("- " + row.text)
                : theme.diffContext("  " + row.text)}
          </Text>
        ))}
      </Box>
    );
  }
  const lines = text.split("\n");
  const head = lines.slice(0, MAX_RESULT_LINES);
  const more = lines.length - head.length;
  return (
    <Box flexDirection="column" marginLeft={2}>
      {head.map((line, index) => (
        <Text key={index}>
          {theme.border("│ ")}
          {ok ? theme.secondary(line) : theme.err(line)}
        </Text>
      ))}
      {more > 0 ? (
        <Text>
          {theme.border("│ ")}
          {theme.secondary("… " + more + " more lines")}
        </Text>
      ) : null}
    </Box>
  );
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

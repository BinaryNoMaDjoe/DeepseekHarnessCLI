import React from "react";
import { Box, Text } from "ink";
import { looksLikeDiff, parseDiff } from "../diff.js";
import { useTheme } from "../theme-context.js";

export interface ToolCallRow {
  id: string;
  name: string;
  /** Raw JSON arguments string, as recorded by DSH. */
  args: string;
  result?: { ok: boolean; text: string };
}

const MAX_RESULT_LINES = 12;

/** One tool invocation: name, one-line args, and a truncated result. */
export function ToolCallView({
  call,
  width,
}: {
  call: ToolCallRow;
  width: number;
}): React.JSX.Element {
  const theme = useTheme();
  const args = truncate(call.args, Math.max(20, width - call.name.length - 4));
  const status = call.result === undefined ? "…" : call.result.ok ? "✓" : "✗";
  const color = call.result === undefined ? theme.secondary : call.result.ok ? theme.ok : theme.err;
  return (
    <Box flexDirection="column" marginLeft={1}>
      <Text>
        {color(status)} {theme.tool(call.name)} {theme.secondary(args)}
      </Text>
      {call.result !== undefined && call.result.text !== "" ? (
        <ResultBody text={call.result.text} ok={call.result.ok} />
      ) : null}
    </Box>
  );
}

function ResultBody({ text, ok }: { text: string; ok: boolean }): React.JSX.Element {
  const theme = useTheme();
  if (looksLikeDiff(text)) {
    const rows = parseDiff(text).slice(0, MAX_RESULT_LINES);
    return (
      <Box flexDirection="column" marginLeft={2}>
        {rows.map((row, index) => (
          <Text key={index}>
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
        <Text key={index}>{ok ? theme.secondary(line) : theme.err(line)}</Text>
      ))}
      {more > 0 ? <Text>{theme.secondary("… " + more + " more lines")}</Text> : null}
    </Box>
  );
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1) + "…";
}

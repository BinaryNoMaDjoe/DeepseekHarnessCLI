import React from "react";
import { Box, Text } from "ink";
import type { TranscriptItem } from "../store.js";
import { useTheme } from "../theme-context.js";
import { BlockText } from "./BlockText.js";
import { ToolCallView } from "./ToolCallView.js";

export interface MessageViewProps {
  item: TranscriptItem;
  width: number;
  sessionRunning: boolean;
  expandedCalls: Record<string, boolean>;
  expandedThinking: Record<number, boolean>;
}

export function MessageView({
  item,
  width,
  sessionRunning,
  expandedCalls,
  expandedThinking,
}: MessageViewProps): React.JSX.Element {
  const theme = useTheme();
  if (item.kind === "user") {
    return (
      <Box flexDirection="column">
        <Text>
          {theme.user("❯ ")}
          {theme.bold(item.text)}
        </Text>
      </Box>
    );
  }
  if (item.kind === "local") {
    return (
      <Box flexDirection="column">
        <Text>{theme.dim(item.text)}</Text>
      </Box>
    );
  }
  if (item.kind === "thinking") {
    const lines = item.text.split("\n");
    const expanded = expandedThinking[item.id] ?? false;
    const preview = expanded ? lines : lines.slice(0, 2);
    const more = lines.length - preview.length;
    return (
      <Box flexDirection="column">
        {preview.map((line, index) => (
          <Text key={index}>
            {theme.muted("● ")}
            {theme.italic(line)}
          </Text>
        ))}
        {more > 0 ? (
          <Text>
            {theme.muted(
              "  " + (expanded ? "ctrl+o collapse" : "ctrl+o expand (" + more + " more lines)"),
            )}
          </Text>
        ) : null}
      </Box>
    );
  }
  return (
    <Box flexDirection="column">
      {item.text !== "" ? <BlockText text={item.text} width={width} /> : null}
      {item.toolCalls.map((call) => (
        <ToolCallView
          key={call.id}
          call={call}
          width={width}
          sessionRunning={sessionRunning}
          expanded={expandedCalls[call.id] ?? false}
        />
      ))}
      {!item.finished && sessionRunning ? <Text>{theme.dim("▍")}</Text> : null}
    </Box>
  );
}

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
  expandedThinking: _expandedThinking,
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
    return (
      <Box flexDirection="column">
        <Text>
          {theme.muted("● ")}
          {theme.italic(item.text)}
        </Text>
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

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
}

export function MessageView({ item, width, sessionRunning }: MessageViewProps): React.JSX.Element {
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
        <Text>{theme.local(item.text)}</Text>
      </Box>
    );
  }
  return (
    <Box flexDirection="column">
      {item.text !== "" ? <BlockText text={item.text} width={width} /> : null}
      {item.toolCalls.map((call) => (
        <ToolCallView key={call.id} call={call} width={width} sessionRunning={sessionRunning} />
      ))}
      {!item.finished && sessionRunning ? <Text>{theme.secondary("▍")}</Text> : null}
    </Box>
  );
}

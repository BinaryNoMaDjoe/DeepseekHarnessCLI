import React from "react";
import { Box, Text } from "ink";
import type { TranscriptItem } from "../store.js";
import { theme } from "../theme.js";
import { BlockText } from "./BlockText.js";
import { ToolCallView } from "./ToolCallView.js";

export function MessageView({
  item,
  width,
}: {
  item: TranscriptItem;
  width: number;
}): React.JSX.Element {
  if (item.kind === "user") {
    return (
      <Box flexDirection="column">
        <Text>{theme.user("❯ " + item.text)}</Text>
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
        <ToolCallView key={call.id} call={call} width={width} />
      ))}
      {!item.finished ? <Text>{theme.status("▍")}</Text> : null}
    </Box>
  );
}

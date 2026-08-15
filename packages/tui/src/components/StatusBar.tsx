import React from "react";
import { Box, Text } from "ink";
import type { ModelSelection } from "@deepseek-harness/sdk";
import { theme } from "../theme.js";
import { Spinner } from "./Spinner.js";

export interface StatusBarProps {
  running: boolean;
  model?: ModelSelection;
  sessionId: string | null;
  permissionMode: string;
}

/** Single-line top bar: session, model, live state, and key hints. */
export function StatusBar({
  running,
  model,
  sessionId,
  permissionMode,
}: StatusBarProps): React.JSX.Element {
  const left = [
    "dsht",
    model !== undefined ? model.provider + "/" + model.model : "no-model",
    sessionId !== null ? sessionId.slice(0, 8) : "new session",
  ].join(" · ");
  const right = running ? <Spinner label="thinking…" /> : <Text>{theme.status("idle")}</Text>;
  return (
    <Box justifyContent="space-between">
      <Text>{theme.status(left)}</Text>
      <Box gap={1}>
        <Text>{theme.status("mode:" + permissionMode)}</Text>
        {right}
        <Text>{theme.hint("esc=cancel  ctrl+c=exit")}</Text>
      </Box>
    </Box>
  );
}

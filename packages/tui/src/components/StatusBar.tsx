import React from "react";
import { Box, Text } from "ink";
import type { ModelSelection } from "@deepseek-harness/sdk";
import { useTheme } from "../theme-context.js";
import { Spinner } from "./Spinner.js";

export interface StatusBarProps {
  running: boolean;
  /** The session's actual model (store) — preferred over the fallback. */
  model: { provider: string; model: string } | null;
  /** Fallback selection (bundle-provided default) when the store is empty. */
  fallbackModel?: ModelSelection;
  sessionId: string | null;
  permissionMode: string;
  themeName: string;
}

/** Single-line top bar: session, model, live state, and key hints. */
export function StatusBar({
  running,
  model,
  fallbackModel,
  sessionId,
  permissionMode,
  themeName,
}: StatusBarProps): React.JSX.Element {
  const theme = useTheme();
  const selection = model ?? fallbackModel;
  const left = [
    "dsht",
    selection !== undefined ? selection.provider + "/" + selection.model : "no-model",
    sessionId !== null ? sessionId.slice(0, 8) : "new session",
  ].join(" · ");
  const right = running ? <Spinner label="thinking…" /> : <Text>{theme.secondary("idle")}</Text>;
  return (
    <Box justifyContent="space-between">
      <Text>{theme.secondary(left)}</Text>
      <Box gap={1}>
        <Text>{theme.secondary(themeName)}</Text>
        <Text>{theme.secondary("mode:" + permissionMode)}</Text>
        {right}
        <Text>{theme.secondary("esc=cancel  ctrl+c=exit")}</Text>
      </Box>
    </Box>
  );
}

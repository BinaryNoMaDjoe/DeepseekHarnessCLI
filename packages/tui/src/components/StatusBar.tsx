import React from "react";
import { Box, Text } from "ink";
import type { ModelSelection } from "@deepseek-harness/sdk";
import { useTheme } from "../theme-context.js";
import { Spinner } from "./Spinner.js";

export interface StatusBarProps {
  running: boolean;
  model: { provider: string; model: string } | null;
  fallbackModel?: ModelSelection;
  sessionId: string | null;
  permissionMode: string;
  themeName: string;
  tokens: { input: number; output: number } | null;
  currentTool: string | null;
  planActive: boolean;
  todo: { done: number; total: number } | null;
}

/**
 * Single-line top bar: identity chips on the left, live state on the
 * right (tool spinner, tokens, plan/todo badges, mode, theme).
 */
export function StatusBar(props: StatusBarProps): React.JSX.Element {
  const theme = useTheme();
  const selection = props.model ?? props.fallbackModel;
  const left = [
    theme.bold("dsht"),
    selection !== undefined ? selection.provider + "/" + selection.model : "no-model",
    props.sessionId !== null ? props.sessionId.slice(0, 8) : "new session",
  ].join(theme.secondary(" · "));

  return (
    <Box justifyContent="space-between">
      <Text>{left}</Text>
      <Box gap={1}>
        {props.planActive ? <Text>{theme.warning(" PLAN ")}</Text> : null}
        {props.todo !== null ? (
          <Text>{theme.secondary("☑ " + props.todo.done + "/" + props.todo.total)}</Text>
        ) : null}
        {props.running ? (
          <Text>
            <Spinner label={props.currentTool !== null ? props.currentTool : "thinking"} />
          </Text>
        ) : (
          <Text>{theme.secondary("idle")}</Text>
        )}
        {props.tokens !== null ? (
          <Text>
            {theme.secondary("tok " + props.tokens.input + "↑" + props.tokens.output + "↓")}
          </Text>
        ) : null}
        <Text>{theme.secondary("mode:" + props.permissionMode)}</Text>
        <Text>{theme.secondary(props.themeName)}</Text>
      </Box>
    </Box>
  );
}

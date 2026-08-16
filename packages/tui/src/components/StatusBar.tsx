import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import type { ModelSelection } from "@deepseek-harness/sdk";
import { useTheme } from "../theme-context.js";
import { ProgressBar } from "./ProgressBar.js";
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
  gitBadge: string | null;
}

const TIPS = [
  "Ctrl+O 展开/折叠工具输出",
  "/model 切换模型 · /theme 切换主题",
  "/sessions 历史会话 · /resume <id> 恢复",
  "/plan 计划模式 · /goal 长目标",
  "Ctrl+Enter 换行 · ↑↓ 历史",
  "/export 导出会话 · /status 状态",
  "Esc 取消 · Ctrl+C 退出",
  "/help 全部命令",
];

const TIP_INTERVAL_MS = 10000;

/**
 * Two-line footer (Kimi-style): identity + live state on line 1,
 * context/progress + rotating tips on line 2.
 */
export function StatusBar(props: StatusBarProps): React.JSX.Element {
  const theme = useTheme();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((current) => current + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const selection = props.model ?? props.fallbackModel;
  const left = [
    theme.strong("dsht"),
    selection !== undefined ? selection.provider + "/" + selection.model : "no-model",
    props.sessionId !== null ? props.sessionId.slice(0, 8) : "new session",
    props.gitBadge !== null ? props.gitBadge : null,
  ]
    .filter((part): part is string => part !== null)
    .join(theme.muted(" · "));

  const tip = TIPS[Math.floor((tick * 1000) / TIP_INTERVAL_MS) % TIPS.length]!;
  const usage = props.tokens !== null ? contextRatio(props.tokens) : null;

  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between">
        <Text>{left}</Text>
        <Box gap={1}>
          {props.planActive ? <Text>{theme.warning("PLAN")}</Text> : null}
          {props.todo !== null ? (
            <Text>{theme.dim("☑ " + props.todo.done + "/" + props.todo.total)}</Text>
          ) : null}
          {props.running ? (
            <Spinner label={props.currentTool !== null ? props.currentTool : "thinking"} />
          ) : (
            <Text>{theme.dim("idle")}</Text>
          )}
          <Text>{theme.dim("mode:" + props.permissionMode)}</Text>
          <Text>{theme.dim(props.themeName)}</Text>
        </Box>
      </Box>
      <Box justifyContent="space-between">
        <Text>
          {theme.muted("context")}{" "}
          {usage !== null ? <ProgressBar ratio={usage} width={16} /> : theme.muted("—")}
        </Text>
        <Text>{theme.muted(tip)}</Text>
      </Box>
    </Box>
  );
}

function contextRatio(tokens: { input: number; output: number }): number {
  // Ratio approximates context pressure; a precise context window arrives
  // with the token-meter integration on the roadmap.
  return Math.min(1, tokens.input / 200_000);
}

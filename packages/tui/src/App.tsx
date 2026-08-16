import React, { useEffect } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import type { ApprovalDecision, ModelSelection, ReplController } from "@deepseek-harness/sdk";
import { useSessionState } from "./hooks.js";
import type { SessionStore } from "./store.js";
import { ApprovalPrompt } from "./components/ApprovalPrompt.js";
import { Dialog } from "./components/Dialog.js";
import { InputBox } from "./components/InputBox.js";
import { MessageView } from "./components/MessageView.js";
import { StatusBar } from "./components/StatusBar.js";
import { ThemeProvider, useTheme } from "./theme-context.js";
import type { ThemeInstance } from "./theme.js";

export interface AppProps {
  store: SessionStore;
  repl: ReplController;
  fallbackModel?: ModelSelection;
  permissionMode: string;
  theme: ThemeInstance;
  gitBadge: string | null;
  onDecideApproval(decision: ApprovalDecision): void;
  onExitRequested(code: number): void;
}

const CHROME_LINES = 7;

/** The full-screen layout: two-line footer, transcript, modal, prompt. */
export function App(props: AppProps): React.JSX.Element {
  return (
    <ThemeProvider theme={props.theme}>
      <AppBody {...props} />
    </ThemeProvider>
  );
}

function AppBody(props: AppProps): React.JSX.Element {
  const theme = useTheme();
  const state = useSessionState(props.store);
  const { stdout } = useStdout();
  const width = Math.max(40, stdout?.columns ?? 80);
  const height = Math.max(12, stdout?.rows ?? 24);

  useEffect(() => {
    if (state.exited !== null) props.onExitRequested(state.exited.code);
  });

  // Ctrl+O: expand/collapse the most recent finished tool call.
  useInput((input, key) => {
    if (!key.ctrl || (input !== "o" && input !== "O")) return;
    const items = state.items;
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i]!;
      if (item.kind !== "assistant") continue;
      for (let j = item.toolCalls.length - 1; j >= 0; j--) {
        const call = item.toolCalls[j]!;
        if (call.result !== undefined) {
          props.store.toggleCall(call.id);
          return;
        }
      }
    }
  });

  const maxItems = Math.max(8, height - CHROME_LINES);
  const items = state.items.slice(-maxItems);
  const todo = computeTodo(state.todos);
  const modalActive = state.dialog !== null || state.approval !== null;

  return (
    <Box flexDirection="column" backgroundColor={theme.spec.background ?? undefined}>
      <StatusBar
        running={state.running}
        model={state.model}
        fallbackModel={props.fallbackModel}
        sessionId={state.sessionId}
        permissionMode={props.permissionMode}
        themeName={theme.spec.displayName}
        tokens={state.tokens}
        currentTool={state.currentTool}
        planActive={state.planActive}
        todo={todo}
        gitBadge={props.gitBadge}
      />
      <Box flexDirection="column" flexGrow={1}>
        {state.planActive ? (
          <Text>{theme.warning(" ▌ PLAN MODE — 计划模式：只产出方案，不修改文件")}</Text>
        ) : null}
        {state.error !== null ? <Text>{theme.error("✗ " + state.error)}</Text> : null}
        {items.map((item) => (
          <MessageView
            key={item.id}
            item={item}
            width={width}
            sessionRunning={state.running}
            expandedCalls={state.expandedCalls}
            expandedThinking={state.expandedThinking}
          />
        ))}
        {state.streaming !== null && state.streaming.reasoning !== "" ? (
          <Text>{theme.italic("● " + state.streaming.reasoning.slice(-160))}</Text>
        ) : null}
        {state.streaming !== null && state.streaming.text !== "" ? (
          <Text>
            {state.streaming.text}
            {theme.dim("▍")}
          </Text>
        ) : null}
      </Box>
      {state.dialog !== null ? (
        <Dialog request={state.dialog} onResult={(result) => props.store.resolveDialog(result)} />
      ) : state.approval !== null ? (
        <ApprovalPrompt request={state.approval} onDecide={props.onDecideApproval} />
      ) : (
        <InputBox
          history={props.repl.history}
          disabled={false}
          suspended={false}
          onSubmit={(text) => void props.repl.submit(text)}
          onCancel={() => void props.repl.cancel()}
          onExit={() => props.repl.exit(0)}
        />
      )}
      {!modalActive ? (
        <Text>
          {theme.muted(
            "Enter 发送 · Ctrl+Enter 换行 · ↑↓ 历史 · Ctrl+O 折叠工具 · Esc 取消 · Ctrl+C 退出",
          )}
        </Text>
      ) : null}
    </Box>
  );
}

function computeTodo(todos: { status: string }[]): { done: number; total: number } | null {
  if (todos.length === 0) return null;
  const done = todos.filter((todo) => todo.status === "completed").length;
  return { done, total: todos.length };
}

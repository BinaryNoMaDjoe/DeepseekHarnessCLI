import React, { useEffect } from "react";
import { Box, Text, useStdout } from "ink";
import type { ApprovalDecision, ModelSelection, ReplController } from "@deepseek-harness/sdk";
import { theme } from "./theme.js";
import { useSessionState } from "./hooks.js";
import type { SessionStore } from "./store.js";
import { ApprovalPrompt } from "./components/ApprovalPrompt.js";
import { InputBox } from "./components/InputBox.js";
import { MessageView } from "./components/MessageView.js";
import { StatusBar } from "./components/StatusBar.js";

export interface AppProps {
  store: SessionStore;
  repl: ReplController;
  model?: ModelSelection;
  permissionMode: string;
  onDecideApproval(decision: ApprovalDecision): void;
  onExitRequested(code: number): void;
}

const MAX_ITEMS = 40;

/** The full-screen layout: status bar, transcript window, approval modal, prompt. */
export function App(props: AppProps): React.JSX.Element {
  const state = useSessionState(props.store);
  const { stdout } = useStdout();
  const width = Math.max(40, stdout?.columns ?? 80);
  useEffect(() => {
    if (state.exited !== null) props.onExitRequested(state.exited.code);
  });

  const items = state.items.slice(-MAX_ITEMS);

  return (
    <Box flexDirection="column">
      <StatusBar
        running={state.running}
        model={props.model}
        sessionId={state.sessionId}
        permissionMode={props.permissionMode}
      />
      <Box flexDirection="column" flexGrow={1}>
        {state.error !== null ? <Text>{theme.error("✗ " + state.error)}</Text> : null}
        {items.map((item) => (
          <MessageView key={item.id} item={item} width={width} />
        ))}
        {state.streaming !== null && state.streaming.reasoning !== "" ? (
          <Text>{theme.reasoning("… " + state.streaming.reasoning.slice(-160))}</Text>
        ) : null}
        {state.streaming !== null && state.streaming.text !== "" ? (
          <Text>
            {state.streaming.text}
            {theme.status("▍")}
          </Text>
        ) : null}
      </Box>
      {state.approval !== null ? (
        <ApprovalPrompt request={state.approval} onDecide={props.onDecideApproval} />
      ) : null}
      <InputBox
        history={props.repl.history}
        disabled={false}
        onSubmit={(text) => void props.repl.submit(text)}
        onCancel={() => void props.repl.cancel()}
        onExit={() => props.repl.exit(0)}
      />
    </Box>
  );
}

import React from "react";
import { render } from "ink";
import type {
  ApprovalBroker,
  ApprovalDecision,
  DshClient,
  ModelSelection,
  SlashCommand,
} from "@deepseek-harness/sdk";
import { createRepl } from "@deepseek-harness/sdk";
import { App } from "./App.js";
import { SessionStore } from "./store.js";
import { buildTheme, DEFAULT_THEME, type ThemeInstance, type ThemeSpec } from "./theme.js";

export interface StartTuiOptions {
  client: DshClient;
  approval: ApprovalBroker;
  commands?: SlashCommand[];
  /** Fallback model for the status bar until the session reports its own. */
  fallbackModel?: ModelSelection;
  permissionMode: string;
  /** Resolved theme spec (default: deepseek-dark). */
  themeSpec?: ThemeSpec;
  /** Pre-built instance (themeSpec is ignored when set). */
  themeInstance?: ThemeInstance;
}

export interface TuiInstance {
  store: SessionStore;
  repl: ReturnType<typeof createRepl>;
  waitForExit(): Promise<number>;
}

/**
 * Start the full-screen terminal UI. This is the only entry the bundle
 * calls: the TUI never touches DSH internals — everything arrives through
 * the SDK client, the approval broker, and slash commands (SDK-boundary
 * rule).
 */
export function startTui(options: StartTuiOptions): TuiInstance {
  const store = new SessionStore();
  const repl = createRepl({
    commands: options.commands,
    agentProvider: () => options.client.current,
    emitLocal: (event) => store.handle(event),
  });

  const unsub = options.client.events.subscribe((event) => {
    store.handle(event);
    repl.onEvent(event);
  });

  // Approval bridge: the SDK broker answerer resolves through this UI.
  let pending: { resolve(decision: ApprovalDecision): void } | null = null;
  options.approval.setAnswerer({
    answer: async (request) => {
      store.raiseApproval(request);
      return await new Promise<ApprovalDecision>((resolve) => {
        pending = { resolve };
      });
    },
  });

  let exitCode = 0;
  const app = render(
    React.createElement(App, {
      store,
      repl,
      fallbackModel: options.fallbackModel,
      permissionMode: options.permissionMode,
      theme:
        options.themeInstance ??
        (options.themeSpec !== undefined ? buildTheme(options.themeSpec) : DEFAULT_THEME),
      onDecideApproval: (decision) => {
        store.clearApproval();
        pending?.resolve(decision);
        pending = null;
      },
      onExitRequested: (code) => {
        exitCode = code;
        unsub();
        app.unmount();
      },
    }),
    { exitOnCtrlC: false },
  );

  return {
    store,
    repl,
    async waitForExit(): Promise<number> {
      await app.waitUntilExit();
      return exitCode;
    },
  };
}

export { SessionStore } from "./store.js";
export { ThemeProvider, useTheme } from "./theme-context.js";
export {
  BUILTIN_THEMES,
  DEEPSEEK_DARK,
  DEEPSEEK_LIGHT,
  DEFAULT_THEME,
  buildTheme,
  validateThemeSpec,
} from "./theme.js";
export type { ThemeColors, ThemeInstance, ThemeMode, ThemeSpec } from "./theme.js";

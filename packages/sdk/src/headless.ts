import { assistantText } from "./events.js";
import type { SdkEvent, TurnReason } from "./events.js";
import type { DshClient } from "./driver.js";
import { denyAll, type ApprovalBroker, type Answerer } from "./approval.js";

/**
 * Headless runner: drives one task to completion and prints either the final
 * answer (text) or a machine-readable stream-json transcript. This is the
 * DSHT equivalent of Claude Code's `claude -p` / Kimi's print mode.
 */

export type OutputFormat = "text" | "stream-json";

/** Approval policy for unattended runs. */
export type HeadlessApproval = "deny" | "ask" | "allow";

export interface HeadlessOptions {
  /** Task text; multiple CLI words are joined upstream. */
  task: string;
  /** Resume this session instead of creating a new one. */
  resume?: string;
  /** Override model/provider for the created session. */
  model?: string;
  provider?: string;
  outputFormat: OutputFormat;
  approval: HeadlessApproval;
}

export interface HeadlessIo {
  out(line: string): void;
  err(line: string): void;
  exit(code: number): void;
}

/** Exit code 0: completed. 1: turn ended in error. 2: usage/infra failure. */
export const EXIT_OK = 0;
export const EXIT_TURN_ERROR = 1;
export const EXIT_FAILURE = 2;

export interface HeadlessResult {
  exitCode: number;
  text: string;
  sessionId: string | null;
}

const alwaysAllow: Answerer = {
  answer: async () => ({ action: "allow" }),
};

/**
 * Run one headless task. Returns a result object; callers own process exit.
 * Approval policy mapping: deny -> fail-closed, allow -> grant everything
 * (--dangerously-skip-approvals), ask -> the caller keeps its answerer
 * installed in the broker (the bundle wires the terminal prompt).
 */
export async function runHeadless(
  client: DshClient,
  approval: ApprovalBroker,
  options: HeadlessOptions,
  io: HeadlessIo,
): Promise<HeadlessResult> {
  if (options.approval !== "ask") {
    approval.setAnswerer(options.approval === "deny" ? denyAll : alwaysAllow);
  }

  const started = Date.now();
  const box: { text: string; reason: TurnReason | null; sessionId: string | null } = {
    text: "",
    reason: null,
    sessionId: null,
  };
  // Subscribe before attaching: the attach emits session/ready, which carries
  // the stream-json init line.
  const unsub = client.events.subscribe((event: SdkEvent) => {
    if (event.type === "session/ready") box.sessionId = event.sessionId;
    if (options.outputFormat === "stream-json") emitStreamJson(io, event, box.sessionId);
    switch (event.type) {
      case "assistant/message":
        box.text = assistantText(event.message);
        break;
      case "turn/end":
        box.reason = event.reason;
        break;
      default:
        break;
    }
  });

  try {
    const handle =
      options.resume !== undefined && options.resume !== ""
        ? await client.resumeSession(options.resume, {
            model: options.model,
            provider: options.provider,
          })
        : await client.createSession({ model: options.model, provider: options.provider });
    box.sessionId = handle.sessionId;
  } catch (error) {
    unsub();
    io.err("dsht: " + (error instanceof Error ? error.message : String(error)));
    io.exit(EXIT_FAILURE);
    return { exitCode: EXIT_FAILURE, text: "", sessionId: null };
  }

  const handle = client.current;
  if (handle === null) {
    unsub();
    io.err("dsht: no session attached");
    io.exit(EXIT_FAILURE);
    return { exitCode: EXIT_FAILURE, text: "", sessionId: box.sessionId };
  }

  if (options.outputFormat === "stream-json") {
    io.out(
      JSON.stringify({
        type: "user",
        message: { role: "user", content: [{ type: "text", text: options.task }] },
      }),
    );
  }
  handle.followup({ text: options.task });
  await handle.whenIdle();
  await handle.flush();
  unsub();

  if (options.outputFormat === "text") io.out(box.text);
  else {
    io.out(
      JSON.stringify({
        type: "result",
        subtype: box.reason?.kind === "completed" ? "success" : "error",
        duration_ms: Date.now() - started,
        result: box.text,
        session_id: box.sessionId,
      }),
    );
  }

  const exitCode = box.reason?.kind === "completed" ? EXIT_OK : EXIT_TURN_ERROR;
  if (exitCode !== EXIT_OK && box.reason?.kind === "error") {
    io.err("dsht: " + box.reason.error.code + ": " + box.reason.error.message);
  }
  io.exit(exitCode);
  return { exitCode, text: box.text, sessionId: box.sessionId };
}

/** stream-json protocol: one JSON object per line, close to Claude Code's -p shape. */
function emitStreamJson(io: HeadlessIo, event: SdkEvent, sessionId: string | null): void {
  switch (event.type) {
    case "session/ready":
      io.out(
        JSON.stringify({
          type: "system",
          subtype: "init",
          session_id: sessionId,
          cwd: process.cwd(),
        }),
      );
      break;
    case "user/message":
      io.out(JSON.stringify({ type: "user", message: event.message }));
      break;
    case "assistant/message":
      io.out(JSON.stringify({ type: "assistant", message: event.message, usage: event.usage }));
      break;
    case "tool/call":
      io.out(JSON.stringify({ type: "tool_call", call: event.call }));
      break;
    case "tool/result":
      io.out(
        JSON.stringify({
          type: "tool_result",
          call: event.call,
          ok: event.ok,
          content: event.content,
        }),
      );
      break;
    case "agent/error":
      io.out(JSON.stringify({ type: "error", error: event.error }));
      break;
    default:
      break;
  }
}

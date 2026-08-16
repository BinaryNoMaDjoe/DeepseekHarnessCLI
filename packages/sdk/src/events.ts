/**
 * SDK event vocabulary — the contract between the DSHT driver and every
 * surface (TUI, headless printer, tests).
 *
 * Shapes mirror the audited DSH session event stream (v0.1.0-rc.6) so the
 * bundle adapter translates structurally. See docs/audit/dsh-api-audit.md.
 */
import type { Message, ToolCall, TokenUsage } from "./types.js";

/** Final outcome of a turn (DSH TurnEndReason narrowed for surfaces). */
export type TurnReason =
  | { kind: "completed" }
  | { kind: "cancelled" }
  | { kind: "blocked"; reason?: string }
  | { kind: "error"; error: { code: string; message: string } };

/** A chunk of a streamed assistant message (DSH StreamChunk narrowed). */
export type AssistantChunk =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "tool-call"; call: ToolCall };

export type AgentStatus = { status: "idle" | "running" };

export type SdkEvent =
  | { type: "session/ready"; sessionId: string }
  | { type: "session/model"; selection: { provider: string; model: string } }
  | { type: "turn/start" }
  | { type: "turn/end"; reason: TurnReason }
  | { type: "step/start" }
  | { type: "step/end" }
  | { type: "user/message"; message: Message }
  | { type: "assistant/message"; message: Message; usage?: TokenUsage }
  | { type: "assistant/chunk"; chunk: AssistantChunk }
  | { type: "tool/call"; call: ToolCall }
  | {
      type: "tool/result";
      call: ToolCall;
      ok: boolean;
      content: string;
      error?: { name: string; code: string };
    }
  | {
      type: "todo/write";
      todos: { content: string; status: "pending" | "in_progress" | "completed" }[];
    }
  | { type: "plan/mode"; active: boolean }
  | { type: "agent/status"; detail: AgentStatus }
  | { type: "agent/error"; error: { code: string; message: string } }
  | { type: "surface/exit"; code: number }
  | { type: "surface/local"; text: string }
  | { type: "surface/git"; badge: string | null };

/** Unsubscribe function returned by subscription APIs. */
export type Unsubscribe = () => void;

/** A minimal typed event emitter used across the SDK. */
export interface Emitter<E> {
  emit(event: E): void;
  subscribe(listener: (event: E) => void): Unsubscribe;
}

/** Extract the assistant text from a message's content blocks. */
export function assistantText(message: Message): string {
  return message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
}

/** Extract tool-call blocks from a message. */
export function toolCallsOf(message: Message): ToolCall[] {
  return message.content.filter((block) => block.type === "tool-call").map((block) => block.call);
}

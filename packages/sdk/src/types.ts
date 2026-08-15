/**
 * Shared structural types for the SDK. These are deliberately DSH-free so the
 * SDK (and therefore the TUI) stays testable without a DSH runtime; the
 * bundle adapter translates DSH objects into these shapes.
 */

/** A unique session identifier. */
export type SessionId = string;

/** Content block of a user or assistant message. */
export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "tool-call"; call: ToolCall };

/** A message in the conversation. */
export interface Message {
  role: "user" | "assistant";
  content: ContentBlock[];
}

/** A single tool invocation requested by the model. Arguments stay the raw
 * JSON string DSH records — surfaces render it, models round-trip it. */
export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

/** Token accounting for one assistant message (DSH TokenUsage). */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
}

/** Model selection shown in the status bar and stored in settings. */
export interface ModelSelection {
  provider: string;
  model: string;
}

/** Permission mode for tool execution. */
export type PermissionMode = "read-only" | "workspace-write" | "danger-full-access";

/** Summary of a persisted session, for /resume and session pickers. */
export interface SessionInfo {
  id: SessionId;
  /** Project key the session was recorded under. */
  projectKey?: string;
  title?: string;
  createdAt?: number;
  updatedAt?: number;
  /** Approximate message count, when the store can provide it. */
  messageCount?: number;
}

/** A user prompt submitted to the agent. */
export interface UserInput {
  text: string;
}

/** Options for creating a brand-new session. */
export interface CreateSessionOptions {
  provider?: string;
  model?: string;
  cwd?: string;
}

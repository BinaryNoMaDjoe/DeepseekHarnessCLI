import type { SdkEvent } from "@deepseek-harness/sdk";
import type { ApprovalRequest } from "@deepseek-harness/sdk";

/**
 * Framework-free session store backing the TUI: holds the transcript, the
 * streaming assistant buffer, the running flag, and the pending approval.
 * React subscribes through useSyncExternalStore; tests drive it directly.
 */

export interface TranscriptItem {
  id: number;
  kind: "user" | "assistant" | "local";
  text: string;
  toolCalls: { id: string; name: string; args: string; result?: { ok: boolean; text: string } }[];
  finished: boolean;
}

export interface SessionUiState {
  sessionId: string | null;
  model: { provider: string; model: string } | null;
  items: TranscriptItem[];
  streaming: { text: string; reasoning: string } | null;
  running: boolean;
  error: string | null;
  approval: ApprovalRequest | null;
  tokens: { input: number; output: number } | null;
  exited: { code: number } | null;
}

const initial: SessionUiState = {
  sessionId: null,
  model: null,
  items: [],
  streaming: null,
  running: false,
  error: null,
  approval: null,
  tokens: null,
  exited: null,
};

export class SessionStore {
  private state: SessionUiState = { ...initial };
  private listeners = new Set<() => void>();
  private nextId = 1;

  getState = (): SessionUiState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(partial: Partial<SessionUiState>): void {
    this.state = { ...this.state, ...partial };
    for (const listener of this.listeners) listener();
  }

  /** Feed one SDK event into the store. */
  handle(event: SdkEvent): void {
    switch (event.type) {
      case "session/ready":
        // Full reset: nothing from the previous session may survive the
        // switch (streaming buffers, run state, tokens, approvals).
        this.set({
          sessionId: event.sessionId,
          model: null,
          items: [],
          streaming: null,
          running: false,
          error: null,
          approval: null,
          tokens: null,
        });
        break;
      case "session/model":
        this.set({ model: event.selection });
        break;
      case "user/message": {
        const text = event.message.content
          .filter((block) => block.type === "text")
          .map((block) => block.text)
          .join("");
        this.pushItem("user", text);
        break;
      }
      case "turn/start":
        this.set({ running: true, error: null });
        break;
      case "turn/end":
        this.set({ running: false });
        if (event.reason.kind === "error") {
          this.set({ error: event.reason.error.code + ": " + event.reason.error.message });
        }
        this.finishStreaming();
        break;
      case "assistant/chunk":
        this.applyChunk(event.chunk);
        break;
      case "assistant/message":
        this.finishStreaming();
        if (event.usage !== undefined) {
          this.set({
            tokens: {
              input: event.usage.inputTokens,
              output: event.usage.outputTokens,
            },
          });
        }
        break;
      case "tool/call":
        this.pushToolCall(event.call.id, event.call.name, event.call.arguments);
        break;
      case "tool/result":
        this.setToolResult(event.call.id, event.ok, event.content);
        break;
      case "agent/error":
        this.set({ error: event.error.code + ": " + event.error.message });
        break;
      case "surface/exit":
        this.set({ exited: { code: event.code } });
        break;
      case "surface/local":
        this.pushItem("local", event.text);
        break;
      default:
        break;
    }
  }

  /** Surface an approval request as the current modal. */
  raiseApproval(request: ApprovalRequest): void {
    this.set({ approval: request });
  }

  clearApproval(): void {
    this.set({ approval: null });
  }

  private pushItem(kind: TranscriptItem["kind"], text: string): void {
    const items = [...this.state.items];
    const last = items.at(-1);
    if (last !== undefined && last.kind === kind && !last.finished) {
      last.text += text;
      this.set({ items });
      return;
    }
    items.push({ id: this.nextId++, kind, text, toolCalls: [], finished: true });
    this.set({ items });
  }

  private applyChunk(chunk: Extract<SdkEvent, { type: "assistant/chunk" }>["chunk"]): void {
    const streaming = this.state.streaming ?? { text: "", reasoning: "" };
    if (chunk.type === "text") streaming.text += chunk.text;
    else if (chunk.type === "reasoning") streaming.reasoning += chunk.text;
    else this.pushToolCall(chunk.call.id, chunk.call.name, chunk.call.arguments);
    this.set({ streaming });
  }

  /** Close the streaming buffer into a transcript item. */
  private finishStreaming(): void {
    const streaming = this.state.streaming;
    if (streaming === null) return;
    const items = [...this.state.items];
    const last = items.at(-1);
    if (last !== undefined && last.kind === "assistant" && !last.finished) {
      last.text += streaming.text;
      last.finished = true;
    } else if (streaming.text !== "" || streaming.reasoning !== "") {
      items.push({
        id: this.nextId++,
        kind: "assistant",
        text: streaming.text,
        toolCalls: [],
        finished: true,
      });
    }
    this.set({ items, streaming: null });
  }

  private pushToolCall(id: string, name: string, args: string): void {
    const items = [...this.state.items];
    let last = items.at(-1);
    if (last === undefined || last.kind !== "assistant" || last.finished) {
      last = { id: this.nextId++, kind: "assistant", text: "", toolCalls: [], finished: false };
      items.push(last);
    }
    last.toolCalls.push({ id, name, args });
    this.set({ items });
  }

  private setToolResult(id: string, ok: boolean, text: string): void {
    // Exact id match first. DSH's tool/result carries no callId (the adapter
    // emits an empty id), so fall back to LIFO pairing: the most recent
    // unresolved call. Correct for sequential tool flows; parallel flows
    // with the same tool are a documented limitation.
    const items = this.state.items.map((item) => {
      if (item.kind !== "assistant") return item;
      const exact = item.toolCalls.find((existing) => existing.id === id);
      if (exact !== undefined) {
        return {
          ...item,
          toolCalls: item.toolCalls.map((existing) =>
            existing.id === id ? { ...existing, result: { ok, text } } : existing,
          ),
        };
      }
      return item;
    });
    const exactHit = items.some(
      (item) =>
        item.kind === "assistant" &&
        item.toolCalls.some((call) => call.id === id && call.result !== undefined),
    );
    if (exactHit) {
      this.set({ items });
      return;
    }
    // LIFO fallback: walk from the newest item backwards.
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i]!;
      if (item.kind !== "assistant") continue;
      for (let j = item.toolCalls.length - 1; j >= 0; j--) {
        const call = item.toolCalls[j]!;
        if (call.result !== undefined) continue;
        item.toolCalls[j] = { ...call, result: { ok, text } };
        this.set({ items });
        return;
      }
    }
    this.set({ items });
  }
}

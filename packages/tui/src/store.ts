import type { SdkEvent } from "@deepseek-harness/sdk";
import type { ApprovalRequest } from "@deepseek-harness/sdk";

/**
 * Framework-free session store backing the TUI: holds the transcript, the
 * streaming assistant buffer, the running flag, and the pending approval.
 * React subscribes through useSyncExternalStore; tests drive it directly.
 */

export interface TranscriptItem {
  id: number;
  kind: "user" | "assistant" | "local" | "thinking";
  text: string;
  toolCalls: { id: string; name: string; args: string; result?: { ok: boolean; text: string } }[];
  finished: boolean;
}

export interface DialogItem {
  id: string;
  label: string;
  detail?: string;
  meta?: string[];
  current?: boolean;
  danger?: boolean;
}

export type DialogRequest =
  | {
      kind: "list";
      id: string;
      title: string;
      searchable: boolean;
      multi: boolean;
      items: DialogItem[];
      hint?: string;
    }
  | {
      kind: "fields";
      id: string;
      title: string;
      fields: { key: string; label: string; value: string; placeholder?: string }[];
      hint?: string;
    };

export type DialogResult = string[] | Record<string, string> | null;

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
  /** The tool currently running (status bar spinner label). */
  currentTool: string | null;
  planActive: boolean;
  todos: { content: string; status: "pending" | "in_progress" | "completed" }[];
  /** Expanded tool calls (Ctrl+O toggles) and thinking blocks. */
  expandedCalls: Record<string, boolean>;
  expandedThinking: Record<number, boolean>;
  /** Open modal dialog (searchable list or multi-field input). */
  dialog: DialogRequest | null;
  /** Footer git badge (arrives asynchronously after startup). */
  gitBadge: string | null;
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
  currentTool: null,
  planActive: false,
  todos: [],
  expandedCalls: {},
  expandedThinking: {},
  dialog: null,
  gitBadge: null,
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
        // switch (streaming buffers, run state, tokens, approvals). The
        // open dialog is PRESERVED: a session switch is often triggered
        // from inside a dialog command (/sessions), and clearing it would
        // strand the command's open() promise forever. Approvals are
        // deliberately NOT preserved: they gate a specific turn of the old
        // session and die with it.
        this.set({
          ...initial,
          sessionId: event.sessionId,
          exited: null,
          dialog: this.state.dialog,
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
        this.set({ running: false, currentTool: null });
        if (event.reason.kind === "error") {
          this.set({ error: event.reason.error.code + ": " + event.reason.error.message });
        }
        this.finishStreaming();
        break;
      case "assistant/chunk":
        this.applyChunk(event.chunk);
        break;
      case "assistant/message": {
        // Persist the reasoning buffer as a collapsible thinking block.
        const messageReasoning = event.message.content
          .filter((block) => block.type === "reasoning")
          .map((block) => block.text)
          .join("\n");
        const reasoning = this.state.streaming?.reasoning ?? "";
        this.finishStreaming();
        if (reasoning !== "" || messageReasoning !== "") {
          this.pushThinking(reasoning !== "" ? reasoning : messageReasoning);
        }
        if (event.usage !== undefined) {
          this.set({
            tokens: {
              input: event.usage.inputTokens,
              output: event.usage.outputTokens,
            },
          });
        }
        break;
      }
      case "tool/call":
        this.pushToolCall(event.call.id, event.call.name, event.call.arguments);
        this.set({ currentTool: event.call.name });
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
      case "todo/write":
        this.set({
          todos: event.todos,
          currentTool: this.state.currentTool,
        });
        break;
      case "plan/mode":
        this.set({ planActive: event.active });
        break;
      case "surface/local":
        this.pushItem("local", event.text);
        break;
      case "surface/git":
        this.set({ gitBadge: event.badge });
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

  toggleCall(id: string): void {
    const expandedCalls = { ...this.state.expandedCalls };
    expandedCalls[id] = !(expandedCalls[id] ?? false);
    this.set({ expandedCalls });
  }

  /** Resolver paired with the open dialog (set by the dialog host). */
  dialogResolve: ((result: DialogResult) => void) | null = null;

  openDialog(request: DialogRequest): void {
    // Re-entry safety: settle any still-open dialog before replacing it,
    // so no open() promise is ever stranded (commands are serialized, but
    // a session switch can re-enter through a preserved dialog).
    if (this.state.dialog !== null) this.resolveDialog(null);
    this.set({ dialog: request });
  }

  resolveDialog(result: DialogResult): void {
    const resolve = this.dialogResolve;
    this.dialogResolve = null;
    this.set({ dialog: null });
    resolve?.(result);
  }

  cancelDialog(): void {
    this.resolveDialog(null);
  }

  toggleThinking(id: number): void {
    const expandedThinking = { ...this.state.expandedThinking };
    expandedThinking[id] = !(expandedThinking[id] ?? false);
    this.set({ expandedThinking });
  }

  private pushThinking(text: string): void {
    if (text.trim() === "") return;
    const items = [...this.state.items];
    items.push({
      id: this.nextId++,
      kind: "thinking",
      text,
      toolCalls: [],
      finished: true,
    });
    this.set({ items });
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

import { randomUUID } from "node:crypto";
import { installModelSelection } from "@deepseek-ai/dsh-agent";
import type { Agent } from "@deepseek-ai/dsh-agent";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { SessionId } from "@deepseek-ai/dsh-session";
import type { Session, SessionEvent } from "@deepseek-ai/dsh-session";
import type {} from "@deepseek-ai/dsh-plan-mode";
import type {
  AgentHandle,
  ClientAdapter,
  CreateSessionOptions,
  Message,
  SdkEvent,
  SessionInfo,
  TurnReason,
  UserInput,
} from "@deepseek-harness/sdk";

/**
 * The production ClientAdapter: bridges DSH core services into the SDK's
 * framework-agnostic contracts. This is the only module in the bundle that
 * translates DSH session events into SDK events (docs/design: event-map).
 */

export interface DshAdapterServices {
  agents: {
    create(options: unknown): Promise<{ agent: Agent; dispose(): Promise<void> }>;
    resume(options: unknown): Promise<{ agent: Agent; dispose(): Promise<void> }>;
  };
  sessions: { flush(session: Session): Promise<unknown> };
  agentDefaultModel: {
    currentSelection(): { provider: string; model: string };
    saveSelection(selection: { provider: string; model: string }): Promise<void>;
  };
  sessionQuery?: {
    listSessions(): Promise<unknown[]>;
    readTitle(sessionId: string): Promise<string | undefined>;
  };
}

export interface DshAdapter extends ClientAdapter {
  /** The live handle created or resumed last (dispose target for /new /resume). */
  current(): DshAgentHandle | null;
  /** List persisted sessions as SDK SessionInfo. */
  listSessions(query?: string, limit?: number): Promise<SessionInfo[]>;
}

export interface DshAdapterHooks {
  /** Extra per-session setup (e.g. the scoped approval answerer). */
  onSetup?(agentCtx: unknown): void;
}

export function createDshAdapter(
  services: DshAdapterServices,
  forward: (sessionId: string, event: SdkEvent) => void,
  hooks: DshAdapterHooks = {},
): DshAdapter {
  let current: DshAgentHandle | null = null;

  async function createSession(options: CreateSessionOptions): Promise<AgentHandle> {
    const selection = services.agentDefaultModel.currentSelection();
    const provider = options.provider ?? selection.provider;
    const model = options.model ?? selection.model;
    const sessionId = SessionId("session-" + randomUUID());
    const created = await services.agents.create({
      sessionId,
      meta: { cwd: options.cwd ?? process.cwd() },
      agentOptions: { provider, model },
      setup: (agentCtx: unknown) => {
        (
          installModelSelection as unknown as (
            ctx: unknown,
            sel: { current: { provider: string; model: string }; assembled: undefined },
          ) => void
        )(agentCtx, {
          current: { provider, model },
          assembled: void 0,
        });
        mountForwarders(agentCtx, sessionId, forward);
        hooks.onSetup?.(agentCtx);
      },
    });
    const handle = new DshAgentHandle(created.agent, false, services.sessions, created.dispose);
    current = handle;
    return handle;
  }

  async function resumeSession(
    sessionId: string,
    resumeOptions?: CreateSessionOptions,
  ): Promise<AgentHandle> {
    const sid = SessionId(sessionId);
    const selection = services.agentDefaultModel.currentSelection();
    const provider = resumeOptions?.provider ?? selection.provider;
    const model = resumeOptions?.model ?? selection.model;
    const resumed = await services.agents.resume({
      resumeSessionId: sid,
      agentOptions: { provider, model },
      setup: (agentCtx: unknown) => {
        (
          installModelSelection as unknown as (
            ctx: unknown,
            sel: { current: { provider: string; model: string }; assembled: undefined },
          ) => void
        )(agentCtx, { current: { provider, model }, assembled: void 0 });
        mountForwarders(agentCtx, sid, forward);
        hooks.onSetup?.(agentCtx);
      },
    });
    const handle = new DshAgentHandle(resumed.agent, true, services.sessions, resumed.dispose);
    current = handle;
    return handle;
  }

  async function listSessions(query?: string, limit = 50): Promise<SessionInfo[]> {
    const engine = services.sessionQuery;
    if (engine === undefined) return [];
    // DSH's listSessions returns SessionRecord[] {header:{id, createdAt}, live,
    // persisted} in deterministic newest-first order.
    const rows = await engine.listSessions();
    const out: SessionInfo[] = [];
    for (const row of rows.slice(0, limit)) {
      const header = (row as { header?: { id?: string; createdAt?: number } }).header;
      const id = header?.id;
      if (typeof id !== "string" || id === "") continue;
      const title = (await engine.readTitle(id)) ?? undefined;
      if (
        query !== undefined &&
        query !== "" &&
        !(id.includes(query) || (title?.includes(query) ?? false))
      )
        continue;
      out.push({
        id,
        title: typeof title === "string" ? title : undefined,
        updatedAt: header?.createdAt,
      });
    }
    return out;
  }

  return {
    createSession,
    resumeSession,
    listSessions,
    current: () => current,
  };
}

/** A live DSH agent wrapped in the SDK handle contract. */
export class DshAgentHandle implements AgentHandle {
  constructor(
    readonly agent: Agent,
    readonly resumed: boolean,
    private readonly flushService: DshAdapterServices["sessions"],
    readonly dispose: () => Promise<void>,
  ) {}

  get sessionId(): string {
    return this.agent.id;
  }

  get selection(): { provider: string; model: string } | undefined {
    const options = this.agent.options as { provider?: string; model?: string } | undefined;
    if (options?.provider === undefined || options.model === undefined) return undefined;
    return { provider: options.provider, model: options.model };
  }

  followup(input: UserInput): void {
    this.agent.followup(
      createUserMessage({
        content: [{ type: "text", text: input.text }],
        source: { kind: "user" },
      }),
    );
  }

  async cancel(): Promise<void> {
    this.agent.cancel({ kind: "user" });
  }

  async whenIdle(): Promise<void> {
    await this.agent.whenIdle();
  }

  async flush(): Promise<void> {
    await this.flushService.flush(this.agent.session);
  }

  /** Replay the persisted history into the surface (seed events do not
   * re-fire on the live bus, so cold resume needs this full pass). */
  replayHistory(emit: (event: SdkEvent) => void): void {
    for (const event of this.agent.session.events) {
      const translated = translateSessionEvent(event);
      if (translated !== null) emit(translated);
    }
  }
}

/** Wire per-session live listeners on the agent-scoped context. */
function mountForwarders(
  agentCtx: unknown,
  sessionId: string,
  forward: (sessionId: string, event: SdkEvent) => void,
): void {
  const ctx = agentCtx as {
    on(event: string, listener: (...args: unknown[]) => unknown): () => void;
  };
  ctx.on("session/event", (session, event) => {
    const ses = session as { id: string };
    if (ses.id !== sessionId) return;
    const translated = translateSessionEvent(event as SessionEvent);
    if (translated !== null) forward(ses.id, translated);
  });
  ctx.on("agent/status", (payload) => {
    const p = payload as { agent?: { id: string }; status?: string };
    if (p.agent?.id !== sessionId || p.status === undefined) return;
    if (p.status === "idle" || p.status === "running") {
      forward(sessionId, { type: "agent/status", detail: { status: p.status } });
    }
  });
  ctx.on("agent/error", (payload) => {
    const p = payload as { agent?: { id: string }; error?: { code?: string; message?: string } };
    if (p.agent?.id !== sessionId) return;
    forward(sessionId, {
      type: "agent/error",
      error: { code: p.error?.code ?? "AGENT_ERROR", message: p.error?.message ?? "agent error" },
    });
  });
}

/** Translate one DSH session event into an SDK event (null = not surfaced). */
export function translateSessionEvent(event: SessionEvent): SdkEvent | null {
  switch (event.type) {
    case "turn/start":
      return { type: "turn/start" };
    case "turn/end":
      return { type: "turn/end", reason: mapReason((event.data as { reason: unknown }).reason) };
    case "step/start":
      return { type: "step/start" };
    case "step/end":
      return { type: "step/end" };
    case "user/message":
      // The TUI echoes user prompts locally; the loop's own surface event
      // would double them.
      return null;
    case "assistant/message": {
      const data = event.data as { message: unknown; usage?: never };
      return { type: "assistant/message", message: mapMessage(data.message), usage: data.usage };
    }
    case "assistant/chunk": {
      const chunk = (event.data as { chunk: { type: string; text?: string } }).chunk;
      if (chunk.type === "text-delta")
        return { type: "assistant/chunk", chunk: { type: "text", text: chunk.text ?? "" } };
      if (chunk.type === "reasoning-delta")
        return { type: "assistant/chunk", chunk: { type: "reasoning", text: chunk.text ?? "" } };
      // tool-call deltas surface through tool/call + tool/result cards.
      return null;
    }
    case "tool/call": {
      const data = event.data as { callId: string; name: string; arguments: string };
      return {
        type: "tool/call",
        call: { id: data.callId, name: data.name, arguments: data.arguments },
      };
    }
    case "tool/result": {
      const data = event.data as {
        callId?: string;
        message?: {
          content?: { type: string; text?: string }[];
          toolCallId?: string;
          callId?: string;
        };
        error?: { name: string; code: string };
      };
      const text = (data.message?.content ?? [])
        .filter((block) => block.type === "text")
        .map((block) => block.text ?? "")
        .join("\n");
      return {
        type: "tool/result",
        call: {
          id: data.callId ?? data.message?.toolCallId ?? data.message?.callId ?? "",
          name: "tool",
          arguments: "",
        },
        ok: data.error === undefined,
        content: text,
        error: data.error,
      };
    }
    case "todo/write":
      return { type: "todo/write", todos: (event.data as { todos: never }).todos };
    case "plan/mode":
      return { type: "plan/mode", active: (event.data as { active: boolean }).active };
    default:
      return null;
  }
}

function mapReason(reason: unknown): TurnReason {
  const r = reason as {
    kind: string;
    reason?: string;
    error?: { code?: string; message?: string };
  };
  switch (r.kind) {
    case "completed":
      return { kind: "completed" };
    case "aborted":
      return { kind: "cancelled" };
    case "interrupted":
      return { kind: "cancelled" };
    case "blocked":
      return { kind: "blocked", reason: r.reason };
    case "max-tokens":
      return { kind: "blocked", reason: "max-tokens" };
    case "error":
      return {
        kind: "error",
        error: {
          code: r.error?.code ?? "TURN_ERROR",
          message: r.error?.message ?? "the turn failed",
        },
      };
    default:
      // Fail closed: an unknown terminal reason must not report success.
      return {
        kind: "error",
        error: {
          code: "UNKNOWN_REASON",
          message: "turn ended with unknown reason: " + r.kind,
        },
      };
  }
}

function mapMessage(message: unknown): Message {
  const m = message as {
    content?: { type: string; text?: string; id?: string; name?: string; arguments?: string }[];
  };
  return {
    role: "assistant",
    content: (m.content ?? []).map((block) => {
      if (block.type === "tool-call") {
        return {
          type: "tool-call",
          call: { id: block.id ?? "", name: block.name ?? "", arguments: block.arguments ?? "" },
        };
      }
      if (block.type === "reasoning") return { type: "reasoning", text: block.text ?? "" };
      return { type: "text", text: block.text ?? "" };
    }),
  };
}

import { createEmitter } from "./emitter.js";
import type { Emitter, SdkEvent } from "./events.js";
import type { CreateSessionOptions, SessionId, SessionInfo, UserInput } from "./types.js";

/**
 * A live agent session. The handle is process-local: it wraps one DSH Agent
 * (or a fake in tests) and forwards its lifecycle into the client event bus.
 */
export interface AgentHandle {
  readonly sessionId: SessionId;
  /** Whether this handle resumed a persisted session. */
  readonly resumed: boolean;
  /** Submit one user prompt; safe to call while the agent is busy — DSH
   * queues followups in the agent inbox. */
  followup(input: UserInput): void;
  /** Interrupt the current turn. The turn ends with a cancelled reason. */
  cancel(): Promise<void>;
  /** Resolves once the agent is idle (no pending turns/steers). */
  whenIdle(): Promise<void>;
  /** Persist the session to durable storage. */
  flush(): Promise<void>;
  /** Tear the runtime session down (DSH-backed handles only). */
  dispose?(): Promise<void>;
}

/**
 * The seam between the framework-agnostic SDK and a concrete runtime.
 * The bundle implements this over DSH core services; tests provide a
 * scripted fake. Only the bundle may know about DSH internals — this is the
 * SDK-boundary rule, mirroring how kimi-code keeps its TUI on a client SDK.
 */
export interface ClientAdapter {
  createSession(options: CreateSessionOptions): Promise<AgentHandle>;
  resumeSession(sessionId: SessionId): Promise<AgentHandle>;
  listSessions(query?: string, limit?: number): Promise<SessionInfo[]>;
}

export interface DshClientOptions {
  adapter: ClientAdapter;
}

export interface DshClient {
  readonly events: Emitter<SdkEvent>;
  readonly adapter: ClientAdapter;
  /** The active agent handle, when a session is attached. */
  readonly current: AgentHandle | null;
  attach(handle: AgentHandle): void;
  createSession(options?: CreateSessionOptions): Promise<AgentHandle>;
  resumeSession(sessionId: SessionId): Promise<AgentHandle>;
  listSessions(query?: string, limit?: number): Promise<SessionInfo[]>;
}

/**
 * Compose an SDK client over a runtime adapter. The client owns the event
 * bus: the adapter reports raw lifecycle, and the client emits normalized
 * SDK events for the surfaces.
 */
export function createDshClient(options: DshClientOptions): DshClient {
  const events = createEmitter<SdkEvent>();
  let current: AgentHandle | null = null;

  function attach(handle: AgentHandle): void {
    current = handle;
    events.emit({ type: "session/ready", sessionId: handle.sessionId });
  }

  return {
    events,
    adapter: options.adapter,
    get current() {
      return current;
    },
    attach,
    async createSession(createOptions: CreateSessionOptions = {}): Promise<AgentHandle> {
      const handle = await options.adapter.createSession(createOptions);
      attach(handle);
      return handle;
    },
    async resumeSession(sessionId: SessionId): Promise<AgentHandle> {
      const handle = await options.adapter.resumeSession(sessionId);
      attach(handle);
      return handle;
    },
    listSessions(query?: string, limit?: number): Promise<SessionInfo[]> {
      return options.adapter.listSessions(query, limit);
    },
  };
}

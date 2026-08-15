import type { AgentHandle, ClientAdapter } from "./driver.js";
import type { SdkEvent } from "./events.js";
import type { CreateSessionOptions, SessionId, SessionInfo, UserInput } from "./types.js";

/**
 * Scripted in-memory adapter for tests: the SDK's contract is exercised
 * without any DSH runtime. The bundle adapter is the production twin.
 * Wire the fake into a client with setSink((event) => client.events.emit(event)).
 */

export interface ScriptedTurn {
  /** Events emitted in order after followup(). */
  events: SdkEvent[];
  /** Optional turn-end reason override (defaults to completed). */
  reason?: Extract<SdkEvent, { type: "turn/end" }>["reason"];
}

export class FakeAgentHandle implements AgentHandle {
  readonly sessionId: SessionId;
  readonly resumed: boolean;
  private sink: ((event: SdkEvent) => void) | null = null;
  private turns: ScriptedTurn[] = [];
  private idleWaiters: (() => void)[] = [];
  private idle = true;

  constructor(sessionId: SessionId, resumed: boolean) {
    this.sessionId = sessionId;
    this.resumed = resumed;
  }

  setSink(sink: (event: SdkEvent) => void): void {
    this.sink = sink;
  }

  /** Queue a scripted turn; consumed by the next followup(). */
  enqueueTurn(turn: ScriptedTurn): void {
    this.turns.push(turn);
  }

  followup(_input: UserInput): void {
    const turn = this.turns.shift();
    this.idle = false;
    this.emit({ type: "turn/start" });
    if (turn === undefined) {
      this.emit({ type: "turn/end", reason: { kind: "completed" } });
      this.settle();
      return;
    }
    for (const event of turn.events) this.emit(event);
    this.emit({ type: "turn/end", reason: turn.reason ?? { kind: "completed" } });
    this.settle();
  }

  async cancel(): Promise<void> {
    if (!this.idle) {
      this.emit({ type: "turn/end", reason: { kind: "cancelled" } });
      this.settle();
    }
  }

  async whenIdle(): Promise<void> {
    if (this.idle) return;
    await new Promise<void>((resolve) => this.idleWaiters.push(resolve));
  }

  async flush(): Promise<void> {
    /* no-op in-memory */
  }

  private emit(event: SdkEvent): void {
    this.sink?.(event);
  }

  private settle(): void {
    this.idle = true;
    const waiters = this.idleWaiters.splice(0);
    for (const waiter of waiters) waiter();
  }
}

export interface FakeAdapterOptions {
  /** Scripted turns handed to newly created sessions. */
  script?: ScriptedTurn[];
}

export interface FakeAdapter extends ClientAdapter {
  sessions: Map<SessionId, FakeAgentHandle>;
  /** Bridge fake events into a client bus (typically client.events.emit). */
  setSink(sink: (event: SdkEvent) => void): void;
}

export function createFakeAdapter(options: FakeAdapterOptions = {}): FakeAdapter {
  const sessions = new Map<SessionId, FakeAgentHandle>();
  let sink: ((event: SdkEvent) => void) | null = null;
  let counter = 0;

  function attach(handle: FakeAgentHandle): void {
    handle.setSink((event) => sink?.(event));
  }

  return {
    sessions,
    setSink(next: (event: SdkEvent) => void): void {
      sink = next;
    },
    async createSession(_options: CreateSessionOptions): Promise<AgentHandle> {
      const handle = new FakeAgentHandle("fake-session-" + ++counter, false);
      for (const turn of options.script ?? []) handle.enqueueTurn(turn);
      sessions.set(handle.sessionId, handle);
      attach(handle);
      return handle;
    },
    async resumeSession(sessionId: SessionId): Promise<AgentHandle> {
      const handle = new FakeAgentHandle(sessionId, true);
      sessions.set(sessionId, handle);
      attach(handle);
      return handle;
    },
    async listSessions(_query?: string, _limit?: number): Promise<SessionInfo[]> {
      return [...sessions.values()].map((handle) => ({
        id: handle.sessionId,
        title: "fake session",
      }));
    },
  };
}

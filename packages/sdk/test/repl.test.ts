import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRepl } from "../src/repl.js";
import type { SdkEvent } from "../src/events.js";
import type { AgentHandle } from "../src/driver.js";

function fakeAgent(followup: ReturnType<typeof vi.fn>): AgentHandle {
  return {
    sessionId: "s1",
    resumed: false,
    followup,
    cancel: vi.fn(async () => {}),
    whenIdle: vi.fn(async () => {}),
    flush: vi.fn(async () => {}),
  };
}

function localText(events: SdkEvent[]): string {
  return events
    .filter(
      (event): event is Extract<SdkEvent, { type: "surface/local" }> =>
        event.type === "surface/local",
    )
    .map((event) => event.text)
    .join("");
}

describe("createRepl", () => {
  it("routes plain text to the agent, echoes it, and dispatches slash commands", async () => {
    const followup = vi.fn();
    const agent = fakeAgent(followup);
    const local: SdkEvent[] = [];
    const repl = createRepl({
      agentProvider: () => agent,
      emitLocal: (event) => local.push(event),
    });
    await repl.submit("  fix the bug  ");
    expect(followup).toHaveBeenCalledWith({ text: "fix the bug" });
    expect(local.map((event) => event.type)).toEqual(["user/message"]);

    await repl.submit("/nope");
    expect(local.map((event) => event.type)).toEqual(["user/message", "surface/local"]);

    await repl.submit("/help");
    expect(local.map((event) => event.type)).toEqual([
      "user/message",
      "surface/local",
      "surface/local",
    ]);
  });

  it("tracks running state across turn events", async () => {
    const agent = fakeAgent(vi.fn());
    const repl = createRepl({ agentProvider: () => agent });
    expect(repl.status.state).toBe("idle");
    repl.onEvent({ type: "turn/start" });
    expect(repl.status.state).toBe("running");
    repl.onEvent({ type: "turn/end", reason: { kind: "completed" } });
    expect(repl.status.state).toBe("idle");
  });

  it("keeps a bounded history", async () => {
    const agent = fakeAgent(vi.fn());
    const repl = createRepl({ agentProvider: () => agent, historyLimit: 2 });
    await repl.submit("one");
    await repl.submit("two");
    await repl.submit("three");
    expect(repl.history).toEqual(["two", "three"]);
  });
});

describe("slash resolution", () => {
  const sessions = vi.fn(async () => {});
  const status = vi.fn(async () => {});
  const alpha1 = vi.fn(async () => {});
  const alpha2 = vi.fn(async () => {});
  beforeEach(() => {
    sessions.mockClear();
    status.mockClear();
    alpha1.mockClear();
    alpha2.mockClear();
  });
  function make(emit: SdkEvent[]): ReturnType<typeof createRepl> {
    return createRepl({
      agentProvider: () => fakeAgent(vi.fn()),
      emitLocal: (event) => emit.push(event),
      commands: [
        { name: "sessions", aliases: ["s"], description: "list", run: sessions },
        { name: "status", aliases: ["st"], description: "state", run: status },
        { name: "alpha1", description: "one", run: alpha1 },
        { name: "alpha2", description: "two", run: alpha2 },
      ],
    });
  }

  it("dispatches canonical names and their aliases", async () => {
    const emit: SdkEvent[] = [];
    const repl = make(emit);
    await repl.submit("/sessions");
    expect(sessions).toHaveBeenCalledTimes(1);
    await repl.submit("/s");
    expect(sessions).toHaveBeenCalledTimes(2);
    await repl.submit("/st");
    expect(status).toHaveBeenCalledTimes(1);
  });

  it("resolves a unique prefix to the only matching command", async () => {
    const emit: SdkEvent[] = [];
    const repl = make(emit);
    await repl.submit("/se");
    expect(sessions).toHaveBeenCalledTimes(1);
    await repl.submit("/sta");
    expect(status).toHaveBeenCalledTimes(1);
  });

  it("reports ambiguity instead of guessing", async () => {
    const emit: SdkEvent[] = [];
    const repl = make(emit);
    await repl.submit("/a");
    expect(alpha1).not.toHaveBeenCalled();
    expect(alpha2).not.toHaveBeenCalled();
    expect(localText(emit)).toContain("ambiguous command: /a");
    expect(localText(emit)).toContain("/alpha1, /alpha2");
  });

  it("reports unknown commands with a help hint", async () => {
    const emit: SdkEvent[] = [];
    const repl = make(emit);
    await repl.submit("/zz");
    expect(localText(emit)).toContain("unknown command: /zz — try /help");
  });

  it("treats a bare / as help and lists aliases", async () => {
    const emit: SdkEvent[] = [];
    const repl = make(emit);
    await repl.submit("/");
    const text = localText(emit);
    expect(text).toContain("available commands");
    expect(text).toContain("/sessions");
    expect(text).toContain("(s)");
    expect(text).toContain("(quit q x)");
  });

  it("routes /h and /q through the builtin aliases", async () => {
    const emit: SdkEvent[] = [];
    const repl = make(emit);
    await repl.submit("/h");
    expect(localText(emit)).toContain("available commands");
    await repl.submit("/q");
    expect(repl.status).toEqual({ state: "exited", code: 0 });
  });
});

describe("shell passthrough", () => {
  it("routes !-prefixed input to runShell and keeps it in history", async () => {
    const runShell = vi.fn(async () => {});
    const emit: SdkEvent[] = [];
    const repl = createRepl({
      agentProvider: () => fakeAgent(vi.fn()),
      emitLocal: (event) => emit.push(event),
      runShell,
    });
    await repl.submit("!git status");
    expect(runShell).toHaveBeenCalledWith("git status");
    expect(repl.history).toContain("!git status");
  });

  it("explains when runShell is not available", async () => {
    const emit: SdkEvent[] = [];
    const repl = createRepl({
      agentProvider: () => fakeAgent(vi.fn()),
      emitLocal: (event) => emit.push(event),
    });
    await repl.submit("!ls");
    expect(localText(emit)).toContain("shell passthrough is not available");
  });

  it("shows usage for a bare !", async () => {
    const emit: SdkEvent[] = [];
    const repl = createRepl({
      agentProvider: () => fakeAgent(vi.fn()),
      emitLocal: (event) => emit.push(event),
      runShell: vi.fn(async () => {}),
    });
    await repl.submit("!");
    expect(localText(emit)).toContain("usage: !<command> runs a local shell command");
  });
});

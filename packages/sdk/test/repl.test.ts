import { describe, expect, it, vi } from "vitest";
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
    expect(local.map((event) => event.type)).toEqual(["user/message", "assistant/chunk"]);

    await repl.submit("/help");
    expect(local.map((event) => event.type)).toEqual([
      "user/message",
      "assistant/chunk",
      "assistant/chunk",
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

import { describe, expect, it } from "vitest";
import { SessionStore } from "../src/store.js";

function textEvent(text: string) {
  return { type: "assistant/chunk" as const, chunk: { type: "text" as const, text } };
}

describe("SessionStore", () => {
  it("accumulates streaming chunks into one assistant item", () => {
    const store = new SessionStore();
    store.handle(textEvent("hello "));
    store.handle(textEvent("world"));
    expect(store.getState().streaming).toEqual({ text: "hello world", reasoning: "" });
    store.handle({ type: "assistant/message", message: { role: "assistant", content: [] } });
    const item = store.getState().items.at(-1);
    expect(item?.kind).toBe("assistant");
    expect(item?.text).toBe("hello world");
    expect(item?.finished).toBe(true);
  });

  it("attaches tool results to the matching call", () => {
    const store = new SessionStore();
    store.handle({
      type: "tool/call",
      call: { id: "c1", name: "read", arguments: JSON.stringify({ path: "a.txt" }) },
    });
    store.handle({
      type: "tool/result",
      call: { id: "c1", name: "read", arguments: "{}" },
      ok: true,
      content: "hi",
    });
    const item = store.getState().items.at(-1);
    expect(item?.toolCalls[0]?.result).toEqual({ ok: true, text: "hi" });
  });

  it("records token usage from assistant messages", () => {
    const store = new SessionStore();
    store.handle({
      type: "assistant/message",
      message: { role: "assistant", content: [] },
      usage: { inputTokens: 10, outputTokens: 4 },
    });
    expect(store.getState().tokens).toEqual({ input: 10, output: 4 });
  });

  it("records surface exit codes", () => {
    const store = new SessionStore();
    store.handle({ type: "surface/exit", code: 0 });
    expect(store.getState().exited).toEqual({ code: 0 });
  });

  it("keeps the pending approval until cleared", () => {
    const store = new SessionStore();
    const request = { id: "a1", kind: "tool-use" as const, toolName: "bash", prompt: "run?" };
    store.raiseApproval(request);
    expect(store.getState().approval).toBe(request);
    store.clearApproval();
    expect(store.getState().approval).toBeNull();
  });
});

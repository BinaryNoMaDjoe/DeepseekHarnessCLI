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

  it("attaches tool results by LIFO when the call id is empty", () => {
    const store = new SessionStore();
    store.handle({
      type: "tool/call",
      call: { id: "c1", name: "read", arguments: JSON.stringify({ path: "a.txt" }) },
    });
    // DSH's tool/result carries no callId: the adapter emits an empty id.
    store.handle({
      type: "tool/result",
      call: { id: "", name: "tool", arguments: "" },
      ok: true,
      content: "file contents",
    });
    const item = store.getState().items.at(-1);
    expect(item?.toolCalls[0]?.result).toEqual({ ok: true, text: "file contents" });
  });

  it("resets every field when a new session attaches", () => {
    const store = new SessionStore();
    store.handle({ type: "turn/start" });
    store.handle(textEvent("leftover"));
    store.handle({
      type: "assistant/message",
      message: { role: "assistant", content: [] },
      usage: { inputTokens: 3, outputTokens: 1 },
    });
    const request = { id: "a1", kind: "tool-use" as const, toolName: "bash", prompt: "allow?" };
    store.raiseApproval(request);
    store.handle({ type: "session/ready", sessionId: "s2" });
    const state = store.getState();
    expect(state.streaming).toBeNull();
    expect(state.running).toBe(false);
    expect(state.tokens).toBeNull();
    expect(state.approval).toBeNull();
    expect(state.items).toEqual([]);
  });

  it("appends surface/local messages as transcript items", () => {
    const store = new SessionStore();
    store.handle({ type: "surface/local", text: "resume failed" });
    expect(store.getState().items.at(-1)).toMatchObject({ kind: "local", text: "resume failed" });
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

  it("tracks the session model from session/model events", () => {
    const store = new SessionStore();
    store.handle({ type: "session/ready", sessionId: "s1" });
    store.handle({ type: "session/model", selection: { provider: "mock", model: "mock-v1" } });
    expect(store.getState().model).toEqual({ provider: "mock", model: "mock-v1" });
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

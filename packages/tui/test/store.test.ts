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

  it("replaces an open dialog by settling the previous one first", () => {
    const store = new SessionStore();
    const first = {
      kind: "list" as const,
      id: "d1",
      title: "one",
      searchable: false,
      multi: false,
      items: [],
    };
    const second = {
      kind: "list" as const,
      id: "d2",
      title: "two",
      searchable: false,
      multi: false,
      items: [],
    };
    let settled: unknown = "unset";
    store.openDialog(first, (result) => {
      settled = result;
    });
    store.openDialog(second, () => {});
    expect(settled).toBeNull();
    expect(store.getState().dialog?.id).toBe("d2");
  });

  it("pairs each open dialog with its own resolver (regression: zombie dialogs)", () => {
    const store = new SessionStore();
    const make = (id: string) => ({
      kind: "list" as const,
      id,
      title: id,
      searchable: false,
      multi: false,
      items: [],
    });
    const first: unknown[] = [];
    const second: unknown[] = [];
    store.openDialog(make("d1"), (result) => first.push(result));
    store.openDialog(make("d2"), (result) => second.push(result));
    // The re-entry guard settles the OLD resolver, not the new one.
    expect(first).toEqual([null]);
    expect(second).toEqual([]);
    // Selecting in the still-open dialog resolves the NEW promise.
    store.resolveDialog(["picked"]);
    expect(second).toEqual([["picked"]]);
  });

  it("preserves the open dialog across session switches", () => {
    const store = new SessionStore();
    store.openDialog(
      {
        kind: "list",
        id: "d1",
        title: "pick",
        searchable: true,
        multi: false,
        items: [],
      },
      () => {},
    );
    store.handle({ type: "session/ready", sessionId: "s2" });
    expect(store.getState().dialog?.id).toBe("d1");
    expect(store.getState().items).toEqual([]);
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

  it("does not overwrite a settled call with a duplicated id", () => {
    const store = new SessionStore();
    // Turn 1: c1 settles, then text closes the item.
    store.handle({
      type: "tool/call",
      call: { id: "c1", name: "read", arguments: "{}" },
    });
    store.handle({
      type: "tool/result",
      call: { id: "c1", name: "read", arguments: "{}" },
      ok: true,
      content: "first",
    });
    store.handle(textEvent("done"));
    store.handle({ type: "assistant/message", message: { role: "assistant", content: [] } });
    // Turn 2: a degenerate duplicate id arrives and settles afterwards.
    store.handle({
      type: "tool/call",
      call: { id: "c1", name: "read", arguments: "{}" },
    });
    store.handle({
      type: "tool/result",
      call: { id: "c1", name: "read", arguments: "{}" },
      ok: false,
      content: "second",
    });
    const state = store.getState();
    const first = state.items[0]!.toolCalls[0];
    const second = state.items.at(-1)!.toolCalls[0];
    expect(first?.result).toEqual({ ok: true, text: "first" });
    expect(second?.result).toEqual({ ok: false, text: "second" });
  });

  it("never mutates the previous state snapshot when pairing results", () => {
    const store = new SessionStore();
    store.handle({
      type: "tool/call",
      call: { id: "c1", name: "read", arguments: "{}" },
    });
    const before = store.getState();
    store.handle({
      type: "tool/result",
      call: { id: "", name: "tool", arguments: "" },
      ok: true,
      content: "content",
    });
    expect(before.items.at(-1)?.toolCalls[0]?.result).toBeUndefined();
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

  it("surfaces error and blocked turn reasons", () => {
    const store = new SessionStore();
    store.handle({
      type: "turn/end",
      reason: { kind: "error", error: { code: "X", message: "boom" } },
    });
    expect(store.getState().error).toBe("X: boom");
    store.handle({ type: "turn/end", reason: { kind: "blocked" } });
    expect(store.getState().error).toBe("blocked");
  });

  it("persists streamed reasoning as a thinking block on a cancelled turn", () => {
    const store = new SessionStore();
    store.handle({
      type: "assistant/chunk",
      chunk: { type: "reasoning", text: "private deliberation" },
    });
    store.handle({ type: "turn/end", reason: { kind: "cancelled" } });
    const state = store.getState();
    expect(state.streaming).toBeNull();
    expect(state.items.at(-1)?.kind).toBe("thinking");
    expect(state.items.at(-1)?.text).toBe("private deliberation");
  });
});

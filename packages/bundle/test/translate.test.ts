import { describe, expect, it } from "vitest";
import { translateSessionEvent } from "../src/dsh-adapter.js";

function event(type: string, data: unknown) {
  return { type, seq: 1, time: 0, data } as unknown as Parameters<typeof translateSessionEvent>[0];
}

describe("translateSessionEvent", () => {
  it("maps turn lifecycle events", () => {
    expect(translateSessionEvent(event("turn/start", { turn: 1 }))).toEqual({ type: "turn/start" });
    expect(
      translateSessionEvent(event("turn/end", { turn: 1, reason: { kind: "completed" } })),
    ).toEqual({
      type: "turn/end",
      reason: { kind: "completed" },
    });
  });

  it("maps error turns to error reasons", () => {
    const translated = translateSessionEvent(
      event("turn/end", {
        turn: 1,
        reason: { kind: "error", error: { code: "X", message: "boom" } },
      }),
    );
    expect(translated).toEqual({
      type: "turn/end",
      reason: { kind: "error", error: { code: "X", message: "boom" } },
    });
  });

  it("maps tool calls with raw arguments", () => {
    expect(
      translateSessionEvent(
        event("tool/call", { turn: 1, step: 1, callId: "c1", name: "read", arguments: '{"a":1}' }),
      ),
    ).toEqual({ type: "tool/call", call: { id: "c1", name: "read", arguments: '{"a":1}' } });
  });

  it("maps tool results to ok/content shape (real ToolResultMessage)", () => {
    const translated = translateSessionEvent(
      event("tool/result", {
        turn: 1,
        step: 1,
        message: {
          role: "user",
          content: [
            {
              type: "tool-result",
              toolCallId: "c1",
              content: [
                { type: "text", text: "file contents" },
                { type: "text", text: "tail" },
              ],
            },
          ],
        },
      }),
    );
    expect(translated).toEqual({
      type: "tool/result",
      call: { id: "c1", name: "tool", arguments: "" },
      ok: true,
      content: "file contents\ntail",
    });
  });

  it("marks tool results with errors and keeps the call id", () => {
    const translated = translateSessionEvent(
      event("tool/result", {
        turn: 1,
        step: 1,
        message: {
          role: "user",
          content: [{ type: "tool-result", toolCallId: "c2", content: [] }],
        },
        error: { name: "ToolError", code: "E_FAIL" },
      }),
    );
    expect(translated).toMatchObject({
      type: "tool/result",
      call: { id: "c2" },
      ok: false,
      content: "",
      error: { name: "ToolError", code: "E_FAIL" },
    });
  });

  it("drops user messages (the TUI echoes them locally)", () => {
    expect(
      translateSessionEvent(
        event("user/message", {
          role: "user",
          content: [{ type: "text", text: "hi" }],
          source: { kind: "user" },
        }),
      ),
    ).toBeNull();
  });

  it("ignores unknown event types", () => {
    expect(
      translateSessionEvent(event("request/header", { header: {}, reason: "initial" })),
    ).toBeNull();
  });
});

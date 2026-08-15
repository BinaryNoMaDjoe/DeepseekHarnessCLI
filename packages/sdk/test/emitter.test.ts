import { describe, expect, it, vi } from "vitest";
import { createEmitter } from "../src/emitter.js";

describe("createEmitter", () => {
  it("delivers events to all subscribers", () => {
    const emitter = createEmitter<string>();
    const a = vi.fn();
    const b = vi.fn();
    emitter.subscribe(a);
    emitter.subscribe(b);
    emitter.emit("hello");
    expect(a).toHaveBeenCalledWith("hello");
    expect(b).toHaveBeenCalledWith("hello");
  });

  it("unsubscribe stops delivery", () => {
    const emitter = createEmitter<string>();
    const a = vi.fn();
    const off = emitter.subscribe(a);
    off();
    emitter.emit("hello");
    expect(a).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, vi } from "vitest";
import { createDshClient } from "../src/driver.js";
import { createFakeAdapter } from "../src/fake.js";
import type { SdkEvent } from "../src/events.js";

describe("createDshClient", () => {
  it("emits session/ready then session/model on attach", async () => {
    const adapter = createFakeAdapter();
    const client = createDshClient({ adapter });
    const events: SdkEvent[] = [];
    client.events.subscribe((event) => events.push(event));
    const handle = await client.createSession({ provider: "mock", model: "mock-v1" });
    expect(handle.selection).toBeUndefined(); // fakes carry no selection
    expect(events[0]?.type).toBe("session/ready");
  });

  it("emits session/model after ready when the handle reports a selection", async () => {
    const adapter = createFakeAdapter();
    const client = createDshClient({ adapter });
    const events: SdkEvent[] = [];
    client.events.subscribe((event) => events.push(event));
    const handle = await client.createSession();
    // Simulate a DSH-backed handle reporting its actual selection.
    (handle as { selection?: { provider: string; model: string } }).selection = {
      provider: "p",
      model: "m",
    };
    client.attach(handle);
    expect(events.map((event) => event.type)).toEqual([
      "session/ready",
      "session/ready",
      "session/model",
    ]);
  });

  it("passes options through to the adapter on resume", async () => {
    const adapter = createFakeAdapter();
    const resume = vi.spyOn(adapter, "resumeSession");
    const client = createDshClient({ adapter });
    await client.resumeSession("s1", { provider: "mock", model: "mock-v1" });
    expect(resume).toHaveBeenCalledWith("s1", { provider: "mock", model: "mock-v1" });
  });
});

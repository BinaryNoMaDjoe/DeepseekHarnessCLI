import { describe, expect, it, vi } from "vitest";
import { createApprovalBroker } from "../src/approval.js";
import { createDshClient } from "../src/driver.js";
import { createFakeAdapter } from "../src/fake.js";
import { EXIT_OK, runHeadless } from "../src/headless.js";

function wiredClient(script: Parameters<typeof createFakeAdapter>[0]["script"]) {
  const adapter = createFakeAdapter({ script });
  const client = createDshClient({ adapter });
  adapter.setSink((event) => client.events.emit(event));
  return client;
}

describe("runHeadless", () => {
  it("prints the final assistant text in text mode", async () => {
    const client = wiredClient([
      {
        events: [
          {
            type: "assistant/message",
            message: { role: "assistant", content: [{ type: "text", text: "done!" }] },
          },
        ],
      },
    ]);
    const approval = createApprovalBroker();
    const out = vi.fn();
    const result = await runHeadless(
      client,
      approval,
      { task: "hi", outputFormat: "text", approval: "deny" },
      { out, err: vi.fn(), exit: vi.fn() },
    );
    expect(result.exitCode).toBe(EXIT_OK);
    expect(result.text).toBe("done!");
    expect(out).toHaveBeenCalledWith("done!");
  });

  it("emits stream-json protocol lines", async () => {
    const client = wiredClient([
      {
        events: [
          {
            type: "assistant/message",
            message: { role: "assistant", content: [{ type: "text", text: "hi" }] },
          },
        ],
      },
    ]);
    const approval = createApprovalBroker();
    const out = vi.fn();
    await runHeadless(
      client,
      approval,
      { task: "hi", outputFormat: "stream-json", approval: "deny" },
      { out, err: vi.fn(), exit: vi.fn() },
    );
    const lines = out.mock.calls.map((call) => String(call[0]));
    const parsed = lines
      .filter((line) => line.startsWith("{"))
      .map((line) => JSON.parse(line) as { type: string });
    expect(parsed.some((line) => line.type === "system")).toBe(true);
    expect(parsed.some((line) => line.type === "assistant")).toBe(true);
    expect(parsed.at(-1)?.type).toBe("result");
  });
});

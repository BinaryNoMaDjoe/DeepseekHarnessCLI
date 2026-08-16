import { describe, expect, it, vi } from "vitest";
import { createApprovalBroker } from "../src/approval.js";
import { createDshClient } from "../src/driver.js";
import { createFakeAdapter } from "../src/fake.js";
import { EXIT_FAILURE, runHeadless } from "../src/headless.js";

function io() {
  return { out: vi.fn(), err: vi.fn(), exit: vi.fn() };
}

describe("runHeadless error paths", () => {
  it("exits 2 and reports the failure when resume rejects", async () => {
    const adapter = createFakeAdapter();
    adapter.resumeSession = vi.fn(async () => {
      throw new Error("no such session");
    }) as unknown as typeof adapter.resumeSession;
    const client = createDshClient({ adapter });
    const approval = createApprovalBroker();
    const out = io();
    const result = await runHeadless(
      client,
      approval,
      { task: "hi", resume: "missing", outputFormat: "text", approval: "deny" },
      out,
    );
    expect(result.exitCode).toBe(EXIT_FAILURE);
    expect(result.sessionId).toBeNull();
    expect(out.err.mock.calls.some((call) => String(call[0]).includes("no such session"))).toBe(
      true,
    );
  });

  it("keeps the caller-installed answerer for approval=ask", async () => {
    const adapter = createFakeAdapter({
      script: [
        {
          events: [
            {
              type: "assistant/message",
              message: { role: "assistant", content: [{ type: "text", text: "ok" }] },
            },
          ],
        },
      ],
    });
    const client = createDshClient({ adapter });
    adapter.setSink((event) => client.events.emit(event));
    const approval = createApprovalBroker({
      answerer: { answer: async () => ({ action: "deny" }) },
    });
    const spy = vi.spyOn(approval.answerer, "answer");
    await runHeadless(
      client,
      approval,
      { task: "hi", outputFormat: "text", approval: "ask" },
      io(),
    );
    expect(spy).not.toHaveBeenCalled(); // no approval raised by this flow
    expect(approval.answerer.answer).toBe(approval.answerer.answer);
  });
});

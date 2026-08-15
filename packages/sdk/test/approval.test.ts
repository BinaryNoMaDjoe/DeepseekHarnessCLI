import { describe, expect, it } from "vitest";
import { createApprovalBroker, type ApprovalDecision, type Answerer } from "../src/approval.js";

function request(id: string) {
  return { id, kind: "tool-use" as const, toolName: "bash", prompt: "allow?" };
}

describe("createApprovalBroker", () => {
  it("serializes concurrent requests (no resolver overwrite)", async () => {
    const seen: string[] = [];
    const answerer: Answerer = {
      answer: async (req) => {
        seen.push(req.id);
        // The second request arrives while the first is still open:
        // the broker must queue it behind the first.
        if (req.id === "a1") {
          await new Promise((resolve) => setTimeout(resolve, 20));
          return { action: "allow" };
        }
        return { action: "deny" };
      },
    };
    const broker = createApprovalBroker({ answerer });
    const [first, second] = await Promise.all([
      broker.request(request("a1")),
      broker.request(request("a2")),
    ]);
    expect(first).toEqual({ action: "allow" });
    expect(second).toEqual({ action: "deny" });
    expect(seen).toEqual(["a1", "a2"]);
  });

  it("resolves to deny when the answerer throws", async () => {
    const broker = createApprovalBroker({
      answerer: {
        answer: async () => {
          throw new Error("boom");
        },
      },
    });
    await expect(broker.request(request("a1"))).resolves.toEqual({ action: "deny" });
  });

  it("cancelCurrent settles only the active request", async () => {
    let resolveAnswer: ((decision: ApprovalDecision) => void) | null = null;
    const broker = createApprovalBroker({
      answerer: {
        answer: async () =>
          await new Promise<ApprovalDecision>((resolve) => {
            resolveAnswer = resolve;
          }),
      },
    });
    const pending = broker.request(request("a1"));
    await new Promise((resolve) => setTimeout(resolve, 10));
    broker.cancelCurrent({ action: "deny" });
    await expect(pending).resolves.toEqual({ action: "deny" });
    expect(resolveAnswer).not.toBeNull();
  });
});

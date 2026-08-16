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

  it("emits an approval/cancelled event when cancelCurrent forces settlement", async () => {
    const broker = createApprovalBroker({
      answerer: {
        answer: async () => await new Promise<ApprovalDecision>(() => {}),
      },
    });
    const cancelled: string[] = [];
    broker.events.subscribe((event) => {
      if (event.type === "approval/cancelled") cancelled.push(event.request.id);
    });
    const pending = broker.request(request("a1"));
    await new Promise((resolve) => setTimeout(resolve, 10));
    broker.cancelCurrent({ action: "deny" });
    await pending;
    expect(cancelled).toEqual(["a1"]);
  });

  it("cancelCurrent with nothing active is a no-op (no event)", async () => {
    const broker = createApprovalBroker();
    const events: string[] = [];
    broker.events.subscribe((event) => events.push(event.type));
    broker.cancelCurrent({ action: "deny" });
    expect(events).toEqual([]);
  });

  it("a queued request's abort does not force-deny the active queue head", async () => {
    let resolveA: ((decision: ApprovalDecision) => void) | null = null;
    const seen: string[] = [];
    const broker = createApprovalBroker({
      answerer: {
        answer: async (req) => {
          if (req.id === "a1")
            return await new Promise<ApprovalDecision>((resolve) => {
              resolveA = resolve;
            });
          return { action: "allow" };
        },
      },
    });
    broker.events.subscribe((event) => {
      if (event.type === "approval/request") seen.push(event.request.id);
    });
    const controller = new AbortController();
    const first = broker.request(request("a1"));
    await new Promise((resolve) => setTimeout(resolve, 10));
    const second = broker.request(request("a2"), controller.signal);
    controller.abort(); // B aborts while still queued behind A
    resolveA!({ action: "allow" });
    await expect(first).resolves.toEqual({ action: "allow" });
    await expect(second).resolves.toEqual({ action: "deny" });
    // B never surfaced a prompt; A was answered by the human, not the abort.
    expect(seen).toEqual(["a1"]);
  });

  it("an active request's own abort settles it with deny and emits cancelled", async () => {
    const broker = createApprovalBroker({
      answerer: {
        answer: async () => await new Promise<ApprovalDecision>(() => {}),
      },
    });
    const cancelled: string[] = [];
    broker.events.subscribe((event) => {
      if (event.type === "approval/cancelled") cancelled.push(event.request.id);
    });
    const controller = new AbortController();
    const pending = broker.request(request("a1"), controller.signal);
    await new Promise((resolve) => setTimeout(resolve, 10));
    controller.abort();
    await expect(pending).resolves.toEqual({ action: "deny" });
    expect(cancelled).toEqual(["a1"]);
  });
});

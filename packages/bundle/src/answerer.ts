import type { ApprovalBroker } from "@deepseek-harness/sdk";

/**
 * Bridges DSH's human-decision seams into the SDK approval broker:
 *  - the approval/request waterfall (per-tool permissions), and
 *  - the single userQuestions provider (ask_user_question tool).
 *
 * Abort signals settle the broker fail-closed so the TUI modal always
 * clears even when the owning step dies first.
 */

export interface AnswererBridge {
  dispose(): void;
}

export function mountAnswererBridge(ctx: unknown, broker: ApprovalBroker): AnswererBridge {
  let counter = 0;
  const alwaysAllow = new Set<string>();

  const c = ctx as {
    on(event: string, listener: (...args: unknown[]) => unknown): () => void;
    get(name: string): unknown;
  };

  const offApproval = c.on("approval/request", (req, next) => {
    const request = req as { toolName: string; reason?: string; signal?: AbortSignal };
    const fallthrough = next as () => Promise<string>;
    if (alwaysAllow.has(request.toolName)) return "allowed-once";

    const approvalRequest = {
      id: "approval-" + ++counter,
      kind: "tool-use" as const,
      toolName: request.toolName,
      prompt: request.reason ?? "Allow the " + request.toolName + " tool to run?",
    };

    request.signal?.addEventListener("abort", () => {
      broker.cancelCurrent({ action: "deny" });
    });

    return broker
      .request(approvalRequest)
      .then((decision) => {
        switch (decision.action) {
          case "allow":
            return "allowed-once";
          case "allow-always":
            alwaysAllow.add(request.toolName);
            return "allowed-once";
          case "deny":
            return "rejected";
          case "answer":
            return "rejected";
        }
      })
      .catch(() => fallthrough());
  });

  interface Question {
    id: string;
    question: string;
    header?: string;
    options?: { label: string; description?: string }[];
    multiSelect?: boolean;
  }
  interface QuestionRequest {
    questions: Question[];
    signal?: AbortSignal;
  }

  const userQuestions = c.get("userQuestions") as
    | {
        registerProvider(provider: {
          ask(request: QuestionRequest): Promise<{ answers: { id: string; selected: string[] }[] }>;
        }): () => void;
      }
    | undefined;

  const offQuestions = userQuestions?.registerProvider({
    ask: async (request: QuestionRequest) => {
      const req = request;
      const first = req.questions[0];
      req.signal?.addEventListener("abort", () => {
        broker.cancelCurrent({ action: "deny" });
      });
      const decision = await broker.request({
        id: "question-" + ++counter,
        kind: "question",
        prompt: first?.question ?? "The model asked a question",
        question:
          first !== undefined
            ? {
                id: first.id,
                question: first.question,
                header: first.header,
                options: (first.options ?? []).map((option) => ({
                  label: option.label,
                  description: option.description,
                })),
                multiSelect: first.multiSelect ?? false,
              }
            : undefined,
      });
      if (decision.action !== "answer") {
        return {
          answers: req.questions.map((question) => ({ id: question.id, selected: [] as string[] })),
        };
      }
      return {
        answers: req.questions.map((question) => ({
          id: question.id,
          selected: decision.selected.filter((label) =>
            (question.options ?? []).some((option) => option.label === label),
          ),
        })),
      };
    },
  });

  return {
    dispose(): void {
      offApproval();
      offQuestions?.();
    },
  };
}

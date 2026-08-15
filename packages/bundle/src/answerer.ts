import type { ApprovalBroker, UserQuestion } from "@deepseek-harness/sdk";

/**
 * Bridges DSH's human-decision seams into the SDK approval broker:
 *  - the approval/request waterfall (per-tool permissions), and
 *  - the single userQuestions provider (ask_user_question tool).
 *
 * Abort signals settle the broker fail-closed so the TUI modal always
 * clears even when the owning step dies first. allow-always is scoped to
 * the asking session (not process-wide).
 */

export interface AnswererBridge {
  dispose(): void;
}

export function mountAnswererBridge(ctx: unknown, broker: ApprovalBroker): AnswererBridge {
  let counter = 0;
  const alwaysAllow = new Map<string, Set<string>>();

  const c = ctx as {
    on(event: string, listener: (...args: unknown[]) => unknown): () => void;
    get(name: string): unknown;
  };

  const offApproval = c.on("approval/request", (req, next) => {
    const request = req as {
      agent?: { id?: string };
      toolName: string;
      reason?: string;
      signal?: AbortSignal;
    };
    const fallthrough = next as () => Promise<string>;
    const agentId = request.agent?.id ?? "";
    const allowed = alwaysAllow.get(agentId);
    if (allowed !== undefined && allowed.has(request.toolName)) return "allowed-once";

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
          case "allow-always": {
            let tools = alwaysAllow.get(agentId);
            if (tools === undefined) {
              tools = new Set();
              alwaysAllow.set(agentId, tools);
            }
            tools.add(request.toolName);
            return "allowed-once";
          }
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
      request.signal?.addEventListener("abort", () => {
        broker.cancelCurrent({ action: "deny" });
      });
      // The broker serializes: ask the human once per question, in order.
      const answers: { id: string; selected: string[] }[] = [];
      for (const question of request.questions) {
        const sdkQuestion: UserQuestion = {
          id: question.id,
          question: question.question,
          header: question.header,
          options: (question.options ?? []).map((option) => ({
            label: option.label,
            description: option.description,
          })),
          multiSelect: question.multiSelect ?? false,
        };
        const decision = await broker.request({
          id: "question-" + ++counter,
          kind: "question",
          prompt: question.question,
          question: sdkQuestion,
        });
        const selected =
          decision.action === "answer"
            ? decision.selected.filter((label) =>
                (question.options ?? []).some((option) => option.label === label),
              )
            : [];
        answers.push({ id: question.id, selected });
      }
      return { answers };
    },
  });

  return {
    dispose(): void {
      offApproval();
      offQuestions?.();
    },
  };
}

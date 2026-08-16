import type { ApprovalBroker, UserQuestion } from "@deepseek-harness/sdk";

/**
 * Bridges DSH's human-decision seams into the SDK approval broker.
 *
 * Scope discipline (audited): the approval/request waterfall is
 * Scoped<Agent>-dispatched, so the answerer must be registered on each
 * agent's own scoped context — a root-scope listener would receive
 * nothing and every ask would fail closed with 'unavailable'. The
 * userQuestions provider, in contrast, is a process singleton on the
 * root context.
 */

export interface AnswererBridge {
  dispose(): void;
}

/**
 * Mount the approval waterfall answerer on ONE agent's scoped context.
 * allow-always is scoped to that agent's session.
 */
export function mountApprovalAnswerer(agentCtx: unknown, broker: ApprovalBroker): () => void {
  let counter = 0;
  const alwaysAllow = new Set<string>();

  const ctx = agentCtx as {
    on(event: string, listener: (...args: unknown[]) => unknown): () => void;
  };

  return ctx.on("approval/request", (req, next) => {
    const request = req as { toolName: string; reason?: string; signal?: AbortSignal };
    const fallthrough = next as () => Promise<string>;
    if (alwaysAllow.has(request.toolName)) return "allowed-once";

    return broker
      .request(
        {
          id: "approval-" + ++counter,
          kind: "tool-use",
          toolName: request.toolName,
          prompt: request.reason ?? "Allow the " + request.toolName + " tool to run?",
        },
        // Per-request signal: the broker settles THIS request on abort, so a
        // concurrent abort can never force-deny a different queue head.
        request.signal,
      )
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
}

/** Mount the process-singleton userQuestions provider on the root ctx. */
export function mountQuestionProvider(rootCtx: unknown, broker: ApprovalBroker): () => void {
  let counter = 0;

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

  const userQuestions = (rootCtx as { get(name: string): unknown }).get("userQuestions") as
    | {
        registerProvider(provider: {
          ask(request: QuestionRequest): Promise<{ answers: { id: string; selected: string[] }[] }>;
        }): () => void;
      }
    | undefined;

  return (
    userQuestions?.registerProvider({
      ask: async (request: QuestionRequest) => {
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
          const decision = await broker.request(
            {
              id: "question-" + ++counter,
              kind: "question",
              prompt: question.question,
              question: sdkQuestion,
            },
            // Per-request signal: settles THIS question on abort without
            // touching the queue head (concurrent-ask race).
            request.signal,
          );
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
    }) ?? (() => undefined)
  );
}

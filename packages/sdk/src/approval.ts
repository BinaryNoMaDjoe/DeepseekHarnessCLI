import { createEmitter } from "./emitter.js";
import type { Emitter } from "./events.js";

/**
 * Approval model for the SDK. DSH executes tools under a permission system;
 * whenever the runtime needs a human decision it raises a request, which the
 * active surface (TUI prompt, headless policy) answers through the broker.
 * The bundle bridges DSH's approval/request waterfall into this broker.
 */

/** What the runtime is asking permission for. */
export type ApprovalKind = "tool-use" | "question" | "other";

export interface ApprovalRequest {
  /** Stable request id within one session. */
  id: string;
  kind: ApprovalKind;
  /** Tool name for tool-use approvals. */
  toolName?: string;
  /** Human-readable prompt to show the user. */
  prompt: string;
  /** Structured question payload (question kind only). */
  question?: UserQuestion;
}

/** A multiple-choice question the model asked the user. */
export interface UserQuestion {
  id: string;
  question: string;
  header?: string;
  options: { label: string; description?: string }[];
  multiSelect: boolean;
}

export type ApprovalDecision =
  | { action: "allow" }
  | { action: "deny" }
  | { action: "allow-always" }
  | { action: "answer"; selected: string[]; custom?: string };

/** The surface-side contract every UI (TUI, headless policy) implements. */
export interface Answerer {
  /** Block until the human decides. Must resolve for every request. */
  answer(request: ApprovalRequest): Promise<ApprovalDecision>;
}

/** Fail-closed default: never grant without a human. */
export const denyAll: Answerer = {
  answer: async () => ({ action: "deny" }),
};

export interface ApprovalBrokerOptions {
  answerer?: Answerer;
}

export interface ApprovalBroker {
  readonly events: Emitter<{ type: "approval/request"; request: ApprovalRequest }>;
  answerer: Answerer;
  setAnswerer(answerer: Answerer): void;
  /** Route a runtime request to the current answerer. */
  request(request: ApprovalRequest): Promise<ApprovalDecision>;
  /**
   * Settle the in-flight request with a decision from outside the answerer
   * (abort signals, surface teardown). No-op when nothing is pending.
   */
  cancelCurrent(decision: ApprovalDecision): void;
}

interface Pending {
  request: ApprovalRequest;
  resolve(decision: ApprovalDecision): void;
}

/**
 * Single-threaded broker: one request at a time, fail-closed by default.
 */
export function createApprovalBroker(options: ApprovalBrokerOptions = {}): ApprovalBroker {
  const events = createEmitter<{ type: "approval/request"; request: ApprovalRequest }>();
  let pending: Pending | null = null;
  const broker: ApprovalBroker = {
    events,
    answerer: options.answerer ?? denyAll,
    setAnswerer(answerer: Answerer): void {
      broker.answerer = answerer;
    },
    async request(request: ApprovalRequest): Promise<ApprovalDecision> {
      events.emit({ type: "approval/request", request });
      return await new Promise<ApprovalDecision>((resolve) => {
        pending = { request, resolve };
        void broker.answerer.answer(request).then(resolve);
      });
    },
    cancelCurrent(decision: ApprovalDecision): void {
      if (pending === null) return;
      const current = pending;
      pending = null;
      current.resolve(decision);
    },
  };
  return broker;
}

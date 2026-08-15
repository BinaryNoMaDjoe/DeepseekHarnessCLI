import { CallId, LlmAdapter } from "@deepseek-ai/dsh-llm";
import type { GenerateOptions, StreamChunk } from "@deepseek-ai/dsh-llm";

/**
 * Scripted mock LLM adapter for e2e tests and demos. Registered on the
 * "mock" provider route when the bundle mockLlm config is enabled
 * (DSH_MOCK_LLM=1), mirroring how dsh-llm-deepseek registers itself.
 *
 * Script controls (read at each request):
 *  - DSH_MOCK_LLM_REPLY: assistant text (default: a deterministic echo).
 *  - DSH_MOCK_LLM_TOOL: JSON {name, arguments} — when set, the reply is a
 *    single tool call instead of text.
 */

export const MOCK_PROVIDER = "mock";
export const MOCK_MODEL = "mock-v1";

export interface MockLlmConfig {
  enabled: boolean;
}

export const name = "tui-mock-llm";
export const inject = ["llm"];

export class MockLlmAdapter extends LlmAdapter {
  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const tool = readToolScript();
    const text = tool === null ? readReply(options) : "";
    const index = 0;
    const callId = CallId("mock-call");
    if (tool !== null) {
      yield { type: "block-start", index, blockType: "tool-call" };
      yield {
        type: "tool-call-delta",
        index,
        id: callId,
        name: tool.name,
        argumentsDelta: tool.arguments,
      };
      yield {
        type: "block-end",
        index,
        block: { type: "tool-call", id: callId, name: tool.name, arguments: tool.arguments },
      };
    } else {
      yield { type: "block-start", index, blockType: "text" };
      yield { type: "text-delta", index, text };
      yield { type: "block-end", index, block: { type: "text", text } };
    }
    yield { type: "usage", usage: { inputTokens: 1, outputTokens: 1 } };
    yield { type: "finish", reason: { kind: tool !== null ? "tool-calls" : "stop" } };
  }
}

export function apply(ctx: unknown, config: MockLlmConfig): void {
  if (!config.enabled) return;
  const runtime = (
    ctx as { llm: { registerAdapter(providers: string[], adapter: LlmAdapter): unknown } }
  ).llm;
  runtime.registerAdapter([MOCK_PROVIDER], new MockLlmAdapter());
  (ctx as { logger?: { info(msg: string): void } }).logger?.info(
    "tui-mock-llm: registered the mock provider route",
  );
}

function readReply(options: GenerateOptions): string {
  const override = process.env.DSH_MOCK_LLM_REPLY;
  if (override !== undefined) return override;
  // The human task is the last user message with source kind "user";
  // injected context messages also travel as user-role and must be skipped.
  let userText = "";
  for (let i = options.messages.length - 1; i >= 0; i--) {
    const message = options.messages[i] as {
      role: string;
      source?: { kind?: string };
      content: { type: string; text?: string }[];
    };
    if (message.role !== "user" || message.source?.kind !== "user") continue;
    userText = message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join(" ");
    break;
  }
  return "mock reply: " + (userText.slice(0, 120) || "(no user input)");
}

function readToolScript(): { name: string; arguments: string } | null {
  const raw = process.env.DSH_MOCK_LLM_TOOL;
  if (raw === undefined || raw === "") return null;
  try {
    const parsed = JSON.parse(raw) as { name: string; arguments: unknown };
    if (typeof parsed.name !== "string") return null;
    // One-shot: consume the script so the next turn answers with text
    // instead of looping on the same tool call forever.
    delete process.env.DSH_MOCK_LLM_TOOL;
    return { name: parsed.name, arguments: JSON.stringify(parsed.arguments ?? {}) };
  } catch {
    return null;
  }
}

import type { SdkEvent } from "./events.js";
import type { AgentHandle } from "./driver.js";

/**
 * Interactive REPL controller: owns the input loop state machine and slash
 * command dispatch. Rendering is delegated to the TUI; this module is pure
 * logic so it can be unit-tested headlessly.
 */

export type ReplStatus =
  | { state: "idle" }
  | { state: "running" }
  | { state: "awaiting-approval" }
  | { state: "exited"; code: number };

export interface SlashCommandContext {
  agent: AgentHandle | null;
  repl: ReplController;
  /** Print a local (non-model) message into the surface transcript. */
  emitLocal(text: string): void;
}

export interface SlashCommand {
  name: string;
  description: string;
  usage?: string;
  run(args: string[], context: SlashCommandContext): Promise<void>;
}

/** Returns the currently attached agent (wired to the client by the surface). */
export type AgentProvider = () => AgentHandle | null;

export interface ReplControllerOptions {
  commands?: SlashCommand[];
  historyLimit?: number;
  /** Emits local (non-model) messages into the surface's event stream. */
  emitLocal?: (event: SdkEvent) => void;
  agentProvider?: AgentProvider;
}

export interface ReplController {
  status: ReplStatus;
  history: string[];
  commands: Map<string, SlashCommand>;
  submit(text: string): Promise<void>;
  cancel(): Promise<void>;
  onEvent(event: SdkEvent): void;
  registerCommand(command: SlashCommand): void;
  exit(code: number): void;
}

/**
 * Create the REPL state machine. It never renders — the TUI observes
 * {@link SdkEvent}s and {@link ReplController.status} to draw itself.
 */
export function createRepl(options: ReplControllerOptions = {}): ReplController {
  const history: string[] = [];
  const historyLimit = options.historyLimit ?? 1000;
  const commands = new Map<string, SlashCommand>();
  let status: ReplStatus = { state: "idle" };

  const local = (text: string): void => {
    options.emitLocal?.({ type: "assistant/chunk", chunk: { type: "text", text: text + "\n" } });
  };

  const repl: ReplController = {
    get status() {
      return status;
    },
    history,
    commands,
    registerCommand(command: SlashCommand): void {
      commands.set(command.name, command);
    },
    exit(code: number): void {
      status = { state: "exited", code };
      options.emitLocal?.({ type: "surface/exit", code });
    },
    async submit(text: string): Promise<void> {
      const trimmed = text.trim();
      if (trimmed === "") return;
      history.push(trimmed);
      if (history.length > historyLimit) history.shift();
      if (trimmed.startsWith("/")) {
        await runSlash(trimmed.slice(1));
        return;
      }
      const agent = options.agentProvider?.() ?? null;
      if (agent === null) {
        local("no session attached — use /resume or /new");
        return;
      }
      options.emitLocal?.({
        type: "user/message",
        message: { role: "user", content: [{ type: "text", text: trimmed }] },
      });
      status = { state: "running" };
      try {
        agent.followup({ text: trimmed });
      } catch (error) {
        status = { state: "idle" };
        local("submit failed: " + (error instanceof Error ? error.message : String(error)));
      }
    },
    async cancel(): Promise<void> {
      await options.agentProvider?.()?.cancel();
      status = { state: "idle" };
    },
    onEvent(event: SdkEvent): void {
      switch (event.type) {
        case "turn/start":
          status = { state: "running" };
          break;
        case "turn/end":
          status = { state: "idle" };
          break;
        case "agent/status":
          if (event.detail.status === "idle") status = { state: "idle" };
          break;
        default:
          break;
      }
    },
  };

  async function runSlash(body: string): Promise<void> {
    const [rawName, ...args] = body.split(/\s+/);
    const name = rawName ?? "";
    const command = commands.get(name);
    if (command === undefined) {
      local("unknown command: /" + name + " — try /help");
      return;
    }
    try {
      await command.run(args, {
        agent: options.agentProvider?.() ?? null,
        repl,
        emitLocal: (text: string) => local(text),
      });
    } catch (error) {
      local("command failed: " + (error instanceof Error ? error.message : String(error)));
    }
  }

  const builtins: SlashCommand[] = [
    {
      name: "help",
      description: "list available slash commands",
      async run() {
        const rows = [...commands.values()]
          .map((command) => "  /" + command.name.padEnd(14) + " " + command.description)
          .join("\n");
        local("available commands:\n" + rows);
      },
    },
    {
      name: "exit",
      description: "end the session and quit",
      async run() {
        repl.exit(0);
      },
    },
    {
      name: "quit",
      description: "alias of /exit",
      async run() {
        repl.exit(0);
      },
    },
  ];
  for (const command of builtins) commands.set(command.name, command);
  for (const command of options.commands ?? []) commands.set(command.name, command);

  return repl;
}

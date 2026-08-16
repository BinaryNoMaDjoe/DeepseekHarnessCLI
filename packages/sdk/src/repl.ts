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
  /**
   * Short alternate names, resolved with the same priority as the canonical
   * name (an alias wins over a merely-prefix-matching canonical name).
   */
  aliases?: string[];
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
  /**
   * Executes a shell-prefixed input (default prefix "!") as a local shell
   * command. When omitted, shell-prefixed input is rejected with a hint.
   */
  runShell?: (command: string) => Promise<void>;
  /** Input prefix that routes to {@link ReplControllerOptions.runShell}. */
  shellPrefix?: string;
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
  const shellPrefix = options.shellPrefix ?? "!";
  let status: ReplStatus = { state: "idle" };

  const local = (text: string): void => {
    // Local command output is a transcript item, NOT a streamed assistant
    // chunk: emitting assistant/chunk leaks it into the streaming buffer
    // and prefixes the next real assistant message (contract: surface/local).
    options.emitLocal?.({ type: "surface/local", text: text + "\n" });
  };

  const repl: ReplController = {
    get status() {
      return status;
    },
    history,
    commands,
    registerCommand(command: SlashCommand): void {
      commands.set(command.name, command);
      for (const alias of command.aliases ?? []) commands.set(alias, command);
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
      if (trimmed.startsWith(shellPrefix)) {
        await runShellInput(trimmed.slice(shellPrefix.length).trim());
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
    if (name === "") {
      await printHelp();
      return;
    }
    const command = resolveCommand(name);
    if (command === undefined) {
      local("unknown command: /" + name + " — try /help");
      return;
    }
    if (command === "ambiguous") {
      local("ambiguous command: /" + name + " — matches " + listAmbiguous(name));
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

  /**
   * Exact name/alias first, then unique-prefix matching, then ambiguity.
   * Prefixes are matched against every registered key (names and aliases),
   * so /se resolves /sessions and /qu resolves /quit.
   */
  function resolveCommand(name: string): SlashCommand | "ambiguous" | undefined {
    const exact = commands.get(name);
    if (exact !== undefined) return exact;
    const matches: SlashCommand[] = [];
    for (const [key, command] of commands) {
      if (!key.startsWith(name)) continue;
      if (!matches.includes(command)) matches.push(command);
    }
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) return "ambiguous";
    return undefined;
  }

  function listAmbiguous(prefix: string): string {
    const names: string[] = [];
    for (const [key, command] of commands) {
      if (!key.startsWith(prefix)) continue;
      if (!names.includes(command.name)) names.push(command.name);
    }
    return names.map((name) => "/" + name).join(", ");
  }

  async function printHelp(): Promise<void> {
    const listed = [...new Set(commands.values())].sort((a, b) => a.name.localeCompare(b.name));
    const rows = listed.map((command) => {
      const aliases = command.aliases === undefined ? "" : " (" + command.aliases.join(" ") + ")";
      return "  /" + command.name.padEnd(14) + command.description + aliases;
    });
    local("available commands (prefixes work too: /se → /sessions):\n" + rows.join("\n"));
  }

  async function runShellInput(body: string): Promise<void> {
    if (body === "") {
      local(
        "usage: " +
          shellPrefix +
          "<command> runs a local shell command (" +
          shellPrefix +
          "git status)",
      );
      return;
    }
    if (options.runShell === undefined) {
      local("shell passthrough is not available in this surface");
      return;
    }
    try {
      await options.runShell(body);
    } catch (error) {
      local("shell failed: " + (error instanceof Error ? error.message : String(error)));
    }
  }

  const builtins: SlashCommand[] = [
    {
      name: "help",
      description: "list available slash commands",
      aliases: ["h", "?"],
      async run() {
        await printHelp();
      },
    },
    {
      name: "exit",
      description: "end the session and quit",
      aliases: ["quit", "q", "x"],
      async run() {
        repl.exit(0);
      },
    },
  ];
  for (const command of builtins) repl.registerCommand(command);
  for (const command of options.commands ?? []) repl.registerCommand(command);

  return repl;
}

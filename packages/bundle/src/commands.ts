import { writeFileSync } from "node:fs";
import type { DshClient, SlashCommand } from "@deepseek-harness/sdk";
import { DshAgentHandle, type DshAdapter } from "./dsh-adapter.js";
import type { ThemeManager } from "./theme-manager.js";

/**
 * Bundle-provided slash commands. TUI-local commands are implemented here
 * (they act on the surface, not the model transcript); the agent-facing
 * built-ins (/plan /goal /compact /feedback) delegate to ctx.commands so
 * they keep their audit trail and model visibility.
 */

export interface CommandDeps {
  ctx: {
    get(name: string): unknown;
  };
  client: DshClient;
  adapter: DshAdapter;
  currentModel(): { provider: string; model: string };
  saveModel(selection: { provider: string; model: string }): Promise<void>;
  permissionMode: string;
  themes: ThemeManager;
}

export function buildCommands(deps: CommandDeps): SlashCommand[] {
  const delegate = (name: string, args: string[], emitLocal: (text: string) => void): void => {
    const handle = deps.client.current;
    if (handle === null || !(handle instanceof DshAgentHandle)) {
      emitLocal("no session attached");
      return;
    }
    const commands = deps.ctx.get("commands") as
      | {
          execute(
            agent: unknown,
            line: string,
            signal?: AbortSignal,
          ): Promise<{ kind: string; text?: string } | undefined>;
        }
      | undefined;
    if (commands === undefined) {
      emitLocal("commands service is not mounted");
      return;
    }
    void commands
      .execute(handle.agent, "/" + name + " " + args.join(" "), undefined)
      .then((result) => {
        if (result?.kind === "error" && result.text !== undefined) emitLocal(result.text);
      })
      .catch((error: unknown) => {
        emitLocal(error instanceof Error ? error.message : String(error));
      });
  };

  return [
    {
      name: "model",
      description: "show or set the default model (provider model)",
      async run(args, context) {
        if (args.length === 0) {
          const current = deps.currentModel();
          context.emitLocal("model: " + current.provider + "/" + current.model);
          return;
        }
        const [provider, model] = parseModelArgs(args);
        if (provider === null || model === null) {
          context.emitLocal("usage: /model [provider model]");
          return;
        }
        await deps.saveModel({ provider, model });
        context.emitLocal(
          "default model set to " + provider + "/" + model + " (applies to new sessions)",
        );
      },
    },
    {
      name: "sessions",
      description: "list persisted sessions (resume with /resume <id>)",
      async run(_args, context) {
        const sessions = await deps.adapter.listSessions(undefined, 20);
        if (sessions.length === 0) {
          context.emitLocal("no persisted sessions");
          return;
        }
        context.emitLocal(
          sessions
            .map((session) => "  " + session.id + "  " + (session.title ?? "(untitled)"))
            .join("\n"),
        );
      },
    },
    {
      name: "resume",
      description: "switch to a persisted session (/resume <id>)",
      async run(args, context) {
        const id = args[0];
        if (id === undefined || id === "") {
          context.emitLocal("usage: /resume <session-id> — list ids with /sessions");
          return;
        }
        try {
          const previous = deps.client.current;
          // Dispose the old handle first: its live events must not leak into
          // the new session's transcript (store resets on session/ready).
          await previous?.dispose?.();
          const handle = await deps.client.resumeSession(id);
          (handle as DshAgentHandle).replayHistory((event) => deps.client.events.emit(event));
          context.emitLocal("resumed " + id);
        } catch (error) {
          context.emitLocal(error instanceof Error ? error.message : String(error));
        }
      },
    },
    {
      name: "new",
      description: "start a fresh session (disposes the current one)",
      async run(_args, context) {
        try {
          const previous = deps.client.current;
          await previous?.dispose?.();
          const handle = await deps.client.createSession();
          (handle as DshAgentHandle).replayHistory((event) => deps.client.events.emit(event));
          context.emitLocal("new session: " + handle.sessionId.slice(0, 12));
        } catch (error) {
          context.emitLocal(error instanceof Error ? error.message : String(error));
        }
      },
    },
    {
      name: "export",
      description: "write this session log to ./dsht-session-<id>.jsonl",
      async run(_args, context) {
        const handle = deps.client.current;
        if (handle === null || !(handle instanceof DshAgentHandle)) {
          context.emitLocal("no session attached");
          return;
        }
        const lines = handle.agent.session.events.map((event) => JSON.stringify(event));
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        const path = "./dsht-session-" + handle.sessionId.slice(0, 12) + "-" + stamp + ".jsonl";
        writeFileSync(path, lines.join("\n") + "\n", "utf8");
        context.emitLocal("wrote " + path + " (" + lines.length + " events)");
      },
    },
    {
      name: "status",
      description: "show session, model, and permission mode",
      async run(_args, context) {
        const handle = deps.client.current;
        const model = deps.currentModel();
        context.emitLocal(
          "session: " +
            (handle?.sessionId.slice(0, 12) ?? "none") +
            "\nmodel: " +
            model.provider +
            "/" +
            model.model +
            "\npermission mode: " +
            deps.permissionMode,
        );
      },
    },
    {
      name: "theme",
      description: "list themes, or switch with /theme <name>",
      async run(args, context) {
        const name = args[0];
        if (name === undefined || name === "") {
          const current = deps.themes.current();
          const rows = deps.themes
            .available()
            .map((entry) => {
              const marker = entry.name === current ? " *" : "  ";
              return (
                marker +
                " " +
                entry.name +
                (entry.builtin ? " (builtin)" : "") +
                " [" +
                entry.mode +
                "]"
              );
            })
            .join("\n");
          context.emitLocal(
            "themes:\n" + rows + "\ncurrent: " + current + " — switch with /theme <name>",
          );
          return;
        }
        if (!deps.themes.set(name)) {
          context.emitLocal(
            "unknown theme: " +
              name +
              " — built-ins: deepseek-dark, deepseek-light; custom themes live in $DSH_HOME/themes/<name>.json",
          );
          return;
        }
        context.emitLocal("theme set to " + name + " (applies to new sessions)");
      },
    },
    {
      name: "plan",
      description: "enter plan mode (delegates to the dsh plan-mode command)",
      async run(args, context) {
        delegate("plan", args, context.emitLocal);
      },
    },
    {
      name: "goal",
      description: "manage the current goal (delegates to the dsh goal command)",
      async run(args, context) {
        delegate("goal", args, context.emitLocal);
      },
    },
    {
      name: "compact",
      description: "compact the context (delegates to the dsh compact command)",
      async run(args, context) {
        delegate("compact", args, context.emitLocal);
      },
    },
    {
      name: "feedback",
      description: "record feedback on the session (delegates to dsh)",
      async run(args, context) {
        delegate("feedback", args, context.emitLocal);
      },
    },
  ];
}

function parseModelArgs(args: string[]): [string, string] | [null, null] {
  if (args.length === 2) {
    return [args[0]!, args[1]!];
  }
  const joined = args.join(" ");
  const slash = joined.indexOf("/");
  if (slash > 0) {
    return [joined.slice(0, slash), joined.slice(slash + 1)];
  }
  return [null, null];
}

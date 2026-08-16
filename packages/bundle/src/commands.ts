import { writeFileSync } from "node:fs";
import type { DshClient, SlashCommand } from "@deepseek-harness/sdk";
import type { DialogHost } from "@deepseek-harness/tui";
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
  /** Lazily resolves the dialog host (the TUI instance owns it). */
  dialogs: () => DialogHost;
}

/** Replay history through any handle that offers it (duck-typed). */
function replayHistory(
  handle: unknown,
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports -- local inline type
  emit: (event: import("@deepseek-harness/sdk").SdkEvent) => void,
): void {
  const replay = (handle as { replayHistory?: (emitFn: typeof emit) => void }).replayHistory;
  // Bound call: the detached reference would lose `this` (ESM strict mode),
  // crashing DshAgentHandle.replayHistory on the first session event.
  replay?.call(handle, emit);
}

/** Attach a session handle and dispose the previous one, replaying history. */
async function attachSession(
  deps: CommandDeps,
  emitLocal: (text: string) => void,
  id: string,
): Promise<void> {
  // Capture the OLD handle before attaching: the client's current switches
  // to the new handle inside resumeSession, so disposing client.current
  // afterwards would tear down the freshly attached session (and leak the
  // old one). Attach first (failure keeps the old one alive), then dispose
  // the captured old handle; late old-session events are gated by the
  // adapter's session filter.
  const previous = deps.client.current;
  const handle = await deps.client.resumeSession(id);
  replayHistory(handle, (event) => deps.client.events.emit(event));
  await previous?.dispose?.();
  emitLocal("resumed " + id);
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
    // A live signal is required: DSH command handlers read it during
    // narration injection (undefined crashed the plan command).
    void commands
      .execute(handle.agent, "/" + name + " " + args.join(" "), new AbortController().signal)
      .then((result) => {
        if (result?.text !== undefined) emitLocal(result.text);
      })
      .catch((error: unknown) => {
        emitLocal(error instanceof Error ? error.message : String(error));
      });
  };

  return [
    {
      name: "model",
      aliases: ["m"],
      description: "show or set the default model (dialog)",
      async run(args, context) {
        if (args.length > 0) {
          const [provider, model] = parseModelArgs(args);
          if (provider === null || model === null) {
            context.emitLocal("usage: /model [provider model]");
            return;
          }
          await deps.saveModel({ provider, model });
          context.emitLocal(
            "default model set to " + provider + "/" + model + " (applies to new sessions)",
          );
          return;
        }
        const current = deps.currentModel();
        const result = await deps.dialogs().open({
          kind: "fields",
          id: "model-dialog",
          title: "Set default model",
          fields: [
            {
              key: "provider",
              label: "provider",
              value: current.provider,
              placeholder: "deepseek-official",
            },
            {
              key: "model",
              label: "model",
              value: current.model,
              placeholder: "deepseek-v4-flash",
            },
          ],
        });
        if (result === null || Array.isArray(result)) {
          context.emitLocal("cancelled");
          return;
        }
        const provider = result["provider"] ?? current.provider;
        const model = result["model"] ?? current.model;
        await deps.saveModel({ provider, model });
        context.emitLocal(
          "default model set to " + provider + "/" + model + " (applies to new sessions)",
        );
      },
    },
    {
      name: "sessions",
      aliases: ["s"],
      description: "pick a persisted session (resumes it)",
      async run(_args, context) {
        let sessions;
        try {
          sessions = await deps.adapter.listSessions(undefined, 100);
        } catch (error) {
          context.emitLocal(error instanceof Error ? error.message : String(error));
          return;
        }
        if (sessions.length === 0) {
          context.emitLocal("no persisted sessions");
          return;
        }
        const selected = await deps.dialogs().open({
          kind: "list",
          id: "sessions-dialog",
          title: "Resume a session",
          searchable: true,
          multi: false,
          items: sessions.map((session) => ({
            id: session.id,
            label: session.title ?? "(untitled)",
            detail: session.id.slice(0, 12),
          })),
        });
        if (selected === null || !Array.isArray(selected) || selected.length === 0) {
          context.emitLocal("cancelled");
          return;
        }
        const id = selected[0]!;
        try {
          await attachSession(deps, context.emitLocal, id);
        } catch (error) {
          context.emitLocal(error instanceof Error ? error.message : String(error));
        }
      },
    },
    {
      name: "resume",
      aliases: ["r"],
      description: "switch to a persisted session (/resume <id-or-prefix>)",
      async run(args, context) {
        const id = args[0];
        if (id === undefined || id === "") {
          context.emitLocal("usage: /resume <session-id> — list ids with /sessions");
          return;
        }
        // Exact id first (fast path); on failure fall back to prefix search.
        try {
          await attachSession(deps, context.emitLocal, id);
          return;
        } catch (exactError) {
          const message = exactError instanceof Error ? exactError.message : String(exactError);
          let sessions;
          try {
            sessions = await deps.adapter.listSessions(undefined, 100);
          } catch {
            context.emitLocal(message);
            return;
          }
          const matches = sessions.filter((session) => session.id.startsWith(id));
          if (matches.length === 1) {
            try {
              await attachSession(deps, context.emitLocal, matches[0]!.id);
              return;
            } catch (error) {
              context.emitLocal(error instanceof Error ? error.message : String(error));
              return;
            }
          }
          if (matches.length === 0) {
            context.emitLocal(message);
            return;
          }
          const rows = matches
            .slice(0, 8)
            .map((session) => "  " + session.id + "  " + (session.title ?? "(untitled)"));
          context.emitLocal(
            "multiple sessions match /resume " +
              id +
              ":\n" +
              rows.join("\n") +
              (matches.length > 8 ? "\n  … " + String(matches.length - 8) + " more" : ""),
          );
        }
      },
    },
    {
      name: "new",
      aliases: ["n"],
      description: "start a fresh session (disposes the current one)",
      async run(_args, context) {
        try {
          // Dispose the captured previous handle, not client.current: after
          // createSession the client's current IS the new handle.
          const previous = deps.client.current;
          const handle = await deps.client.createSession();
          replayHistory(handle, (event) => deps.client.events.emit(event));
          await previous?.dispose?.();
          context.emitLocal("new session: " + handle.sessionId.slice(0, 12));
        } catch (error) {
          context.emitLocal(error instanceof Error ? error.message : String(error));
        }
      },
    },
    {
      name: "export",
      aliases: ["e"],
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
      aliases: ["st"],
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
      aliases: ["t"],
      description: "pick or switch the theme (dialog)",
      async run(args, context) {
        const name = args[0];
        if (name !== undefined && name !== "") {
          if (!deps.themes.set(name)) {
            context.emitLocal(
              "unknown theme: " +
                name +
                " — built-ins: auto, deepseek-dark, deepseek-light, daltonized variants; custom themes live in $DSH_HOME/themes/<name>.json",
            );
            return;
          }
          context.emitLocal("theme set to " + name + " (applies to new sessions)");
          return;
        }
        const current = deps.themes.current();
        let entries;
        try {
          entries = deps.themes.available();
        } catch (error) {
          context.emitLocal(error instanceof Error ? error.message : String(error));
          return;
        }
        const selected = await deps.dialogs().open({
          kind: "list",
          id: "theme-dialog",
          title: "Select a theme",
          searchable: false,
          multi: false,
          items: entries.map((entry) => ({
            id: entry.name,
            label: entry.displayName,
            detail: entry.mode,
            current: entry.name === current,
          })),
        });
        if (selected === null || !Array.isArray(selected) || selected.length === 0) {
          context.emitLocal("cancelled");
          return;
        }
        const picked = selected[0]!;
        if (!deps.themes.set(picked)) {
          context.emitLocal("unknown theme: " + picked);
          return;
        }
        context.emitLocal("theme set to " + picked + " (applies to new sessions)");
      },
    },
    {
      name: "plan",
      aliases: ["p"],
      description: "enter plan mode (delegates to the dsh plan-mode command)",
      async run(args, context) {
        delegate("plan", args, context.emitLocal);
      },
    },
    {
      name: "goal",
      aliases: ["g"],
      description: "manage the current goal (delegates to the dsh goal command)",
      async run(args, context) {
        delegate("goal", args, context.emitLocal);
      },
    },
    {
      name: "compact",
      aliases: ["c"],
      description: "compact the context (delegates to the dsh compact command)",
      async run(args, context) {
        delegate("compact", args, context.emitLocal);
      },
    },
    {
      name: "feedback",
      aliases: ["f"],
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

import { createInterface } from "node:readline/promises";
import z from "@deepseek-ai/schemastery";
import {
  createApprovalBroker,
  createDshClient,
  runHeadless,
  type AgentHandle,
  type Answerer,
  type SdkEvent,
} from "@deepseek-harness/sdk";
import {
  DEEPSEEK_DARK,
  DEEPSEEK_LIGHT,
  detectTerminalScheme,
  startTui,
} from "@deepseek-harness/tui";
import { gitBadge } from "./git-badge.js";
import { createDshAdapter, type DshAdapterServices } from "./dsh-adapter.js";
import type { DshAgentHandle } from "./dsh-adapter.js";
import { mountAnswererBridge } from "./answerer.js";
import { buildCommands } from "./commands.js";
import { apply as applyMockLlm } from "./mock-llm.js";
import { ThemeManager } from "./theme-manager.js";
import { TUI_STARTUP_SERVICE, type TuiStartup } from "./startup.js";

/**
 * The tui-runner plugin: the whole DSHT surface. It composes the SDK
 * client over DSH core services, mounts the answerer bridge, and routes
 * the startup mode into print / list-sessions / interactive.
 */

export const name = "tui-runner";
export const inject = [
  "agentDefaultModel",
  "agents",
  "sessions",
  "llm",
  "commands",
  "approval",
  "userQuestions",
  "sessionQuery",
  "loader",
];
export const Config = z.object({ mockLlm: z.boolean().default(false) });

export function apply(ctx: unknown, config: { mockLlm: boolean }): void {
  void run(ctx, config).catch((error: unknown) => {
    process.stderr.write(
      "dsht: " + (error instanceof Error ? error.message : String(error)) + "\n",
    );
    // Route through the launcher's bounded shutdown when available: it
    // drains the tree (telemetry, session flush, PTY cleanup).
    const exit = (ctx as { get(name: string): unknown }).get("appExit") as
      ((code: number) => void) | undefined;
    if (exit !== undefined) exit(1);
    else process.exit(1);
  });
}

async function run(ctx: unknown, config: { mockLlm: boolean }): Promise<void> {
  const c = ctx as {
    get(name: string): unknown;
  };
  const loader = c.get("loader") as { await(): Promise<unknown> } | undefined;
  await loader?.await().catch(() => undefined);

  const startup = c.get(TUI_STARTUP_SERVICE) as TuiStartup | undefined;
  if (startup === undefined) {
    throw new Error("tui-runner: tuiStartup missing — the tui-startup row must inject it");
  }
  const exit = c.get("appExit") as ((code: number) => void) | undefined;
  const io = {
    out: (line: string) => process.stdout.write(line + "\n"),
    err: (line: string) => process.stderr.write(line + "\n"),
    exit: (code: number) => {
      if (exit !== undefined) exit(code);
      else process.exit(code);
    },
  };

  applyMockLlm(ctx, { enabled: config.mockLlm });

  const services = c as unknown as DshAdapterServices;
  const forward = (event: SdkEvent): void => {
    client.events.emit(event);
  };
  const adapter = createDshAdapter(services, forward);
  const client = createDshClient({ adapter });
  const broker = createApprovalBroker();
  const bridge = mountAnswererBridge(ctx, broker);

  const modelService = services.agentDefaultModel;
  const permissionMode = process.env.DSH_PERMISSION_MODE ?? "workspace-write";
  const themes = new ThemeManager();

  if (startup.mode === "list-sessions") {
    const sessions = await adapter.listSessions(undefined, 50);
    for (const session of sessions) {
      io.out(session.id + "\t" + (session.title ?? ""));
    }
    bridge.dispose();
    io.exit(0);
    return;
  }

  if (startup.mode === "print") {
    if (startup.approval === "ask") {
      broker.setAnswerer(createStdinAnswerer());
    }
    await runHeadless(
      client,
      broker,
      {
        task: startup.task,
        resume: startup.resume ?? undefined,
        model: startup.model ?? undefined,
        provider: startup.provider ?? undefined,
        outputFormat: startup.outputFormat,
        approval: startup.approval,
      },
      io,
    );
    // runHeadless already requested exit through io.exit (appExit), which
    // starts the launcher's tree disposal — touching services again here
    // would double-dispose a draining tree.
    return;
  }

  // interactive
  const themeName = startup.theme ?? themes.current();
  let themeSpec: import("@deepseek-harness/tui").ThemeSpec | undefined; // eslint-disable-line @typescript-eslint/consistent-type-imports -- local inline type
  if (themeName === "auto") {
    const scheme = await detectTerminalScheme();
    themeSpec = scheme === "light" ? DEEPSEEK_LIGHT : DEEPSEEK_DARK;
  } else {
    themeSpec = themes.load(themeName) ?? undefined;
  }

  const tui = startTui({
    client,
    approval: broker,
    commands: [],
    fallbackModel: modelService.currentSelection(),
    permissionMode,
    themeSpec,
    gitBadge: await gitBadge(process.cwd()),
  });

  const commands = buildCommands({
    ctx: c,
    client,
    adapter,
    currentModel: () => modelService.currentSelection(),
    saveModel: (selection) => modelService.saveSelection(selection),
    permissionMode,
    themes,
    dialogs: () => tui.dialogs,
  });
  for (const command of commands) tui.repl.registerCommand(command);

  try {
    await attachInitial(client, adapter, startup);
  } catch (error) {
    client.events.emit({
      type: "agent/error",
      error: {
        code: "ATTACH_FAILED",
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }

  const code = await tui.waitForExit();
  await client.current?.dispose?.();
  bridge.dispose();
  io.exit(code);
}

/** Attach the initial session per the startup flags, replaying history. */
async function attachInitial(
  client: ReturnType<typeof createDshClient>,
  adapter: ReturnType<typeof createDshAdapter>,
  startup: TuiStartup,
): Promise<void> {
  const replay = (handle: AgentHandle): void => {
    (handle as DshAgentHandle).replayHistory((event) => client.events.emit(event));
  };

  if (startup.newSession) {
    replay(
      await client.createSession({
        model: startup.model ?? undefined,
        provider: startup.provider ?? undefined,
      }),
    );
    return;
  }

  let target = startup.resume;
  if (target === null && startup.useContinue) {
    // DSH's listSessions is deterministic newest-first (audit §3.3), so the
    // first entry is the most recently created session.
    const sessions = await adapter.listSessions(undefined, 5);
    target = sessions[0]?.id ?? null;
  }

  if (target !== null) {
    try {
      replay(await client.resumeSession(target));
      return;
    } catch {
      client.events.emit({
        type: "surface/local",
        text: "resume failed — starting a fresh session",
      });
    }
  }
  replay(
    await client.createSession({
      model: startup.model ?? undefined,
      provider: startup.provider ?? undefined,
    }),
  );
}
/** y/n/a approval answerer over stdin for headless --approval ask runs. */
function createStdinAnswerer(): Answerer {
  return {
    answer: async (request) => {
      if (!process.stdin.isTTY) return { action: "deny" };
      if (request.question !== undefined) {
        process.stderr.write("[dsht] " + request.question.question + "\n");
        const options = request.question.options;
        for (let i = 0; i < options.length; i++) {
          const option = options[i]!;
          process.stderr.write("  " + (i + 1) + ") " + option.label + "\n");
        }
        process.stderr.write("[dsht] select numbers (comma-separated): ");
        const line = await readLine();
        const parts = line.split(",");
        const picks: number[] = [];
        for (const part of parts) {
          const trimmed = part.trim();
          if (trimmed === "") continue;
          const index = Number.parseInt(trimmed, 10);
          if (Number.isFinite(index)) picks.push(index);
        }
        const selected = picks
          .filter((index) => index >= 1 && index <= options.length)
          .map((index) => options[index - 1]!.label);
        return { action: "answer", selected };
      }
      process.stderr.write("[dsht] " + request.prompt + " [y]es/[a]llow always/[n]o: ");
      const line = (await readLine()).trim().toLowerCase();
      if (line.startsWith("a")) return { action: "allow-always" };
      if (line.startsWith("y")) return { action: "allow" };
      return { action: "deny" };
    },
  };
}

let lineReader: ReturnType<typeof createInterface> | null = null;
async function readLine(): Promise<string> {
  lineReader ??= createInterface({ input: process.stdin, terminal: false });
  return await lineReader.question("");
}

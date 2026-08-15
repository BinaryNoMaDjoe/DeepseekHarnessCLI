import { Command } from "commander";
import { parseCmdline } from "@deepseek-ai/dsh-cmdline";
import type { HeadlessApproval } from "@deepseek-harness/sdk";

/**
 * The tui app's command-line provider: parses the interactive/print mode
 * flags and publishes {@link TUI_STARTUP_SERVICE}. The runner is an ordinary
 * consumer whose lazy config waits for that service.
 * @module @deepseek-harness/tui-bundle/startup
 */

/** Stable Cordis plugin name. */
export const name = "tui-startup";
/** Services required before the invocation can be resolved. */
export const inject = ["cmdlineArgs"];
/** Service provided by this plugin and injected by the runner row. */
export const TUI_STARTUP_SERVICE = "tuiStartup";

export interface TuiStartup {
  mode: "interactive" | "print" | "list-sessions";
  task: string;
  resume: string | null;
  useContinue: boolean;
  newSession: boolean;
  model: string | null;
  provider: string | null;
  outputFormat: "text" | "stream-json";
  approval: HeadlessApproval;
}

/**
 * This app's command. Rebuildable per invocation so tests can parse more
 * than once per process.
 */
export function tuiCommand(): Command {
  return new Command()
    .name("dsh --profile tui")
    .description(
      "DSHT — the DeepSeek Harness terminal agent. Interactive by default; " +
        "with --print it answers one task and exits.",
    )
    .helpOption("-h, --help", "show this help")
    .argument("[task...]", "the task text (required with --print)")
    .option("-p, --print [task...]", "print mode: answer one task and exit (alias of --prompt)")
    .option("--prompt [task...]", "alias of --print")
    .option("--output-format <format>", "print output format: text or stream-json", "text")
    .option("--json", "shortcut for --output-format stream-json")
    .option("-r, --resume <session>", "resume this session id")
    .option("-c, --continue", "continue the most recently updated session")
    .option("-n, --new", "start a fresh session (ignore --continue defaults)")
    .option("-m, --model <model>", "model id for this session")
    .option("--provider <provider>", "provider route for this session")
    .option("--approval <policy>", "headless approval policy: deny | ask | allow", "deny")
    .option(
      "--dangerously-skip-approvals",
      "grant every approval in headless mode (same as --approval allow)",
    )
    .option("--list-sessions", "list persisted sessions and exit")
    .addHelpText(
      "after",
      [
        "",
        "Examples:",
        "  dsh --profile tui                          start the interactive terminal UI",
        '  dsh --profile tui --print "run the tests"  answer one task and exit',
        '  dsh --profile tui -p "fix the bug" --json  machine-readable transcript',
        "  dsh --profile tui --resume abc123          resume an existing session",
        "",
      ].join("\n"),
    );
}

/** Parse and provide the invocation as an ordinary Cordis service. */
export function apply(ctx: unknown): void {
  const program = tuiCommand();
  const provider = (ctx as { provide(name: string, value: TuiStartup): void }).provide.bind(ctx);
  program.action(() => {
    const options = program.opts<Record<string, unknown>>();
    const printArgs = asTask(options["print"]) ?? asTask(options["prompt"]);
    const positionals = program.args;
    let mode: TuiStartup["mode"] = "interactive";
    let task = "";
    if (options["listSessions"] === true) {
      mode = "list-sessions";
    } else if (printArgs !== null) {
      mode = "print";
      task = printArgs;
    }
    if (mode === "print" && task === "") {
      task = positionals.join(" ");
      if (task.trim() === "")
        program.error(
          'error: a task is required with --print, for example: --print "run the tests"',
        );
    }
    const outputFormat =
      options["json"] === true ? "stream-json" : validateFormat(options["outputFormat"], program);
    const approval =
      options["dangerouslySkipApprovals"] === true
        ? "allow"
        : validateApproval(options["approval"], program);
    provider(TUI_STARTUP_SERVICE, {
      mode,
      task,
      resume: typeof options["resume"] === "string" ? options["resume"] : null,
      useContinue: options["continue"] === true,
      newSession: options["new"] === true,
      model: typeof options["model"] === "string" ? options["model"] : null,
      provider: typeof options["provider"] === "string" ? options["provider"] : null,
      outputFormat,
      approval,
    });
  });
  (parseCmdline as unknown as (ctx: unknown, program: Command) => void)(ctx, program);
}

function asTask(value: unknown): string | null {
  if (value === undefined || value === null || value === false) return null;
  if (value === true) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.join(" ");
  return String(value);
}

function validateFormat(value: unknown, program: Command): "text" | "stream-json" {
  if (value === "text" || value === "stream-json") return value;
  program.error("error: --output-format must be text or stream-json");
}

function validateApproval(value: unknown, program: Command): HeadlessApproval {
  if (value === "deny" || value === "ask" || value === "allow") return value;
  program.error("error: --approval must be deny, ask, or allow");
}

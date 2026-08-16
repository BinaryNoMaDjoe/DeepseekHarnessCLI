import { Command } from "commander";
import { installProfile, isInstalled, profileDirOf, uninstallProfile } from "./install.js";
import { runDsht } from "./run.js";

/**
 * dsht — the DSHT launcher. Owns install/uninstall/doctor; every other
 * invocation forwards to dsh --profile tui verbatim.
 */

export function main(argv: string[]): void {
  const program = new Command();
  program
    .name("dsht")
    .description("DSHT — the DeepSeek Harness terminal agent (a dsh tui profile).")
    .version("0.1.0", "-V, --version")
    .helpOption("-h, --help");

  program
    .command("install")
    .description("provision the tui profile under $DSH_HOME and install its bundle")
    .option("--link <path>", "install the bundle from a local checkout via link: (dev workflow)")
    .action((options: { link?: string }) => {
      try {
        const result = installProfile({ linkPath: options.link });
        console.log("dsht: tui profile installed at " + result.profileDir);
        console.log("dsht: run it with: dsht   (or: dsh --profile tui)");
      } catch (error) {
        console.error("dsht: " + (error instanceof Error ? error.message : String(error)));
        process.exitCode = 1;
      }
    });

  program
    .command("uninstall")
    .description("remove the tui profile from $DSH_HOME")
    .action(() => {
      uninstallProfile();
      console.log("dsht: tui profile removed");
    });

  program
    .command("doctor")
    .description("report the installation facts")
    .action(() => {
      console.log("profile dir: " + profileDirOf());
      console.log("installed:   " + (isInstalled() ? "yes" : "no"));
    });

  // Everything else (including no subcommand) forwards to the dsh launcher.
  program.argument(
    "[args...]",
    'arguments forwarded to dsh --profile tui (for example --print "task")',
  );
  program.action((args: string[]) => {
    const forwarded = forwardMockArgs(args);
    runDsht({ args: forwarded.args, env: forwarded.env })
      .then((code) => {
        process.exitCode = code;
      })
      .catch((error: unknown) => {
        console.error("dsht: " + (error instanceof Error ? error.message : String(error)));
        process.exitCode = 1;
      });
  });

  program.parse(argv);
}

/**
 * `--mock` is a launcher-level shortcut: the mock LLM route must be enabled
 * by env before dsh boots (the bundle reads DSH_MOCK_LLM at config time), so
 * the launcher strips the flag, sets the env for the spawned dsh, and fills
 * in the mock provider/model defaults when they were not given explicitly.
 */
export function forwardMockArgs(args: string[]): {
  args: string[];
  env?: Record<string, string>;
} {
  if (!args.includes("--mock")) return { args };
  const rest = args.filter((arg) => arg !== "--mock");
  const hasModel = hasExplicitValue(rest, ["--model", "-m"]);
  const hasProvider = hasExplicitValue(rest, ["--provider"]);
  const filled = [
    ...rest,
    ...(hasProvider ? [] : ["--provider", "mock"]),
    ...(hasModel ? [] : ["--model", "mock-v1"]),
  ];
  return { args: filled, env: { DSH_MOCK_LLM: "1" } };
}

/** True when one of the flags carries a real value (`--model x` / `--model=x`). */
function hasExplicitValue(rest: string[], flags: string[]): boolean {
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;
    if (flags.includes(arg)) {
      const next = rest[i + 1];
      return next !== undefined && !next.startsWith("-");
    }
    const eq = flags.find((flag) => flag.startsWith("--") && arg.startsWith(flag + "="));
    if (eq !== undefined) return arg.length > eq.length + 1;
  }
  return false;
}

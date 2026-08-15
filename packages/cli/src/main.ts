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
    runDsht({ args })
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

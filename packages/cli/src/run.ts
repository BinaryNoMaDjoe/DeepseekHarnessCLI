import { spawn } from "node:child_process";
import { isInstalled, isNestedHarnessSession, installProfile, PROFILE_NAME } from "./install.js";

/**
 * dsht execution: ensure the tui profile exists, then hand the invocation
 * to the dsh launcher verbatim (dsh --profile tui <args>). Output is
 * inherited — dsht is a forwarder, not a re-implementer.
 */

export interface RunOptions {
  args: string[];
  dshBin?: string;
  provision?: boolean;
  linkPath?: string;
  /** Extra variables merged over the inherited (possibly scrubbed) env. */
  env?: Record<string, string>;
}

export async function runDsht(options: RunOptions): Promise<number> {
  if (options.provision !== false && !isInstalled()) {
    installProfile({ linkPath: options.linkPath });
  }
  const bin = options.dshBin ?? "dsh";
  // Scrub the host session's DSH_* variables when nested: the spawned dsh
  // must resolve its own profile home, not the host's.
  const scrubbed = isNestedHarnessSession()
    ? Object.fromEntries(
        Object.entries(process.env).filter(
          ([key]) => !key.startsWith("DSH_") && !key.startsWith("XDG_"),
        ),
      )
    : undefined;
  const env =
    options.env === undefined ? scrubbed : { ...(scrubbed ?? process.env), ...options.env };
  // On Windows dsh is a .cmd shim and cannot be spawned directly; route
  // through cmd.exe instead of shell:true (spawn args + shell:true is the
  // deprecated DEP0190 pattern).
  const child =
    process.platform === "win32"
      ? spawn("cmd.exe", ["/d", "/s", "/c", bin, "--profile", PROFILE_NAME, ...options.args], {
          stdio: "inherit",
          env,
        })
      : spawn(bin, ["--profile", PROFILE_NAME, ...options.args], {
          stdio: "inherit",
          env,
        });
  return await new Promise<number>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
}

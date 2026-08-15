import { spawn } from "node:child_process";
import { isInstalled, installProfile, PROFILE_NAME } from "./install.js";

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
}

export async function runDsht(options: RunOptions): Promise<number> {
  if (options.provision !== false && !isInstalled()) {
    installProfile({ linkPath: options.linkPath });
  }
  const bin = options.dshBin ?? "dsh";
  const child = spawn(bin, ["--profile", PROFILE_NAME, ...options.args], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  return await new Promise<number>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
}

import { execFile } from "node:child_process";

type Exec = typeof execFile;

/**
 * Git badge for the footer: current branch plus a dirty marker.
 * Best effort: any failure resolves to null (not a git repo, no git
 * binary, or a timeout). The exec function is injectable for tests.
 */
export function gitBadge(
  cwd: string,
  options: { timeoutMs?: number; exec?: Exec } = {},
): Promise<string | null> {
  const exec = options.exec ?? execFile;
  const timeoutMs = options.timeoutMs ?? 3000;
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    exec(
      "git",
      ["-C", cwd, "rev-parse", "--abbrev-ref", "HEAD"],
      { timeout: timeoutMs },
      (error, stdout) => {
        clearTimeout(timer);
        if (error !== null) {
          resolve(null);
          return;
        }
        const branch = stdout.trim();
        if (branch === "" || branch === "HEAD") {
          resolve(null);
          return;
        }
        exec(
          "git",
          ["-C", cwd, "status", "--porcelain"],
          { timeout: timeoutMs },
          (statusError, statusOut) => {
            clearTimeout(timer);
            const dirty = statusError === null && statusOut.trim() !== "" ? "●" : "";
            resolve("git:" + branch + dirty);
          },
        );
      },
    );
  });
}

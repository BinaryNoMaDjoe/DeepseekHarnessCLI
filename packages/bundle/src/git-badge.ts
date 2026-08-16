import { execFile } from "node:child_process";

/**
 * Git badge for the footer: current branch plus a dirty marker.
 * Best effort: any failure resolves to null (not a git repo, no git
 * binary, or a timeout).
 */
export function gitBadge(cwd: string, timeoutMs = 3000): Promise<string | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    execFile(
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
        execFile(
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

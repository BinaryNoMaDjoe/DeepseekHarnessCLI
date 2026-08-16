import { spawn } from "node:child_process";

/** Output cap for a local shell command (longer runs are truncated). */
export const MAX_SHELL_OUTPUT = 8000;

/**
 * The platform shell invocation for a user-typed command: cmd.exe on
 * Windows (ComSpec overridable), otherwise $SHELL with an sh fallback.
 */
export function shellInvocation(command: string): [string, string[]] {
  if (process.platform === "win32") {
    return [process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", command]];
  }
  return [process.env.SHELL ?? "/bin/sh", ["-c", command]];
}

/**
 * Run a local shell command and stream its combined output into the
 * transcript through emit. The command line is echoed first, and a
 * non-zero exit is reported as [exit N].
 */
export function runLocalShell(command: string, emit: (text: string) => void): Promise<void> {
  emit("$ " + command);
  return new Promise((resolve) => {
    const [file, args] = shellInvocation(command);
    let child;
    try {
      child = spawn(file, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    } catch (error) {
      emit(error instanceof Error ? error.message : String(error));
      resolve();
      return;
    }
    let output = "";
    let truncated = false;
    const collect = (chunk: Buffer): void => {
      if (truncated) return;
      output += chunk.toString("utf8");
      if (output.length > MAX_SHELL_OUTPUT) {
        output = output.slice(0, MAX_SHELL_OUTPUT);
        truncated = true;
      }
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("error", (error: Error) => {
      emit(error.message);
      resolve();
    });
    child.on("close", (code: number | null) => {
      const text = output.replace(/\r\n/g, "\n").replace(/\n+$/, "");
      if (text !== "") emit(text);
      if (truncated) emit("[output truncated]");
      if (code !== 0) emit("[exit " + String(code ?? 1) + "]");
      resolve();
    });
  });
}

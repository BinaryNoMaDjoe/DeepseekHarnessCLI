// Dev tool: interactive TUI smoke test over a pseudo-terminal.
// Spawns `dsh --profile tui` with the mock LLM, checks the /help output,
// submits one prompt, asserts the reply renders, then quits via /exit.
//
// Requirements: node-pty resolvable at DSH_NPX_ROOT (defaults to the
// dsh npx cache), a provisioned tui profile at .tmp/dsh-home (run
// scripts/e2e-install.mjs first), and the dsh launcher on the path.
import { fileURLToPath, pathToFileURL } from "node:url";

const NPX_ROOT =
  process.env.DSH_NPX_ROOT ?? "C:/Users/chubb/AppData/Local/npm-cache/_npx/1e7f6d9597241db0";
const DSH_CMD = process.env.DSH_BIN ?? NPX_ROOT + "/node_modules/.bin/dsh.cmd";
const DSH_HOME =
  process.env.E2E_DSH_HOME ?? fileURLToPath(new URL("../.tmp/dsh-home", import.meta.url));

// The host may itself run inside a DSH session and inject DSH_* variables;
// scrub them so the spawned dsh boots from our own profile home.
const hostEnv = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key]) => key === "DSH_INPUT_LOG" || (!key.startsWith("DSH_") && !key.startsWith("XDG_")),
  ),
);

const { default: pty } = await import(
  pathToFileURL(NPX_ROOT + "/node_modules/node-pty/lib/index.js").href
);

const term = pty.spawn(
  "cmd.exe",
  ["/d", "/s", "/c", DSH_CMD + " --profile tui --provider mock --model mock-v1"],
  {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: { ...hostEnv, DSH_HOME, DSH_MOCK_LLM: "1" },
    cols: 120,
    rows: 40,
    name: "xterm-256color",
  },
);

let output = "";
let exited = false;
let exitCode = null;
term.onData((data) => (output += data));
term.onExit(({ exitCode: code }) => {
  exited = true;
  exitCode = code;
});

const waitFor = (predicate, timeoutMs = 30000) =>
  new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (predicate(output)) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        reject(new Error("timeout waiting for output"));
      }
    }, 100);
  });

let pass = false;
try {
  await waitFor((text) => text.includes("dsht"));
  console.log("[e2e] TUI booted");
  term.write("/help\r");
  await waitFor((text) => text.includes("available commands"), 20000);
  console.log("[e2e] /help rendered — submit path works");
  term.write("/theme\r");
  await waitFor((text) => text.includes("DeepSeek Dark") && text.includes("DeepSeek Light"), 20000);
  console.log("[e2e] /theme dialog listed the built-in themes");
  term.write("\x1b");
  await waitFor((text) => text.includes("cancelled"), 20000);
  console.log("[e2e] Esc cancelled the dialog");
  // Selection path: open again and confirm the first entry (auto).
  term.write("/theme\r");
  await waitFor((text) => text.includes("Select a theme"), 20000);
  term.write("\r");
  await waitFor((text) => text.includes("theme set to auto"), 20000);
  console.log("[e2e] Enter selected a theme from the dialog");
  term.write("/theme deepseek-light\r");
  await waitFor((text) => text.includes("theme set to deepseek-light"), 20000);
  console.log("[e2e] theme switch persisted");
  term.write("hello tui\r");
  await waitFor((text) => text.includes("mock reply: hello tui"), 60000);
  console.log("[e2e] reply rendered in the TUI");
  // Shell passthrough: !-prefixed input runs locally, not through the model.
  term.write("!echo dsht-shell-ok\r");
  await waitFor((text) => text.includes("dsht-shell-ok"), 30000);
  console.log("[e2e] ! shell passthrough executed locally");
  // Short alias and status shortcut.
  term.write("/h\r");
  await waitFor((text) => text.includes("available commands"), 20000);
  console.log("[e2e] /h alias rendered the help list");
  term.write("/st\r");
  await waitFor((text) => text.includes("permission mode"), 20000);
  console.log("[e2e] /st alias rendered the status");
  // /q quits through the exit alias.
  term.write("/q\r");
  await waitFor(() => exited, 15000);
  console.log("[e2e] exited with code " + String(exitCode));
  if (exitCode !== 0) {
    throw new Error("unexpected exit code " + String(exitCode));
  }
  console.log("[e2e] PASS");
  pass = true;
} catch (error) {
  console.error("[e2e] FAIL: " + (error instanceof Error ? error.message : String(error)));
  console.error(output.slice(-4000));
} finally {
  term.kill();
}
process.exit(pass ? 0 : 1);

// Dev tool: approval-flow e2e. The mock LLM calls the pwsh tool, which
// raises a real permission ask under the default workspace-write policy;
// the TUI shows the approval modal, we answer y, and the turn completes.
import { fileURLToPath, pathToFileURL } from "node:url";

const NPX_ROOT =
  process.env.DSH_NPX_ROOT ?? "C:/Users/chubb/AppData/Local/npm-cache/_npx/1e7f6d9597241db0";
const DSH_CMD = process.env.DSH_BIN ?? NPX_ROOT + "/node_modules/.bin/dsh.cmd";
const DSH_HOME =
  process.env.E2E_DSH_HOME ?? fileURLToPath(new URL("../.tmp/dsh-home", import.meta.url));

const hostEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith("DSH_") && !key.startsWith("XDG_")),
);

const { default: pty } = await import(
  pathToFileURL(NPX_ROOT + "/node_modules/node-pty/lib/index.js").href
);

// The sandbox_permissions escalation path raises a real approval ask
// through ctx.approval — exactly the seam this e2e exercises.
const TOOL = JSON.stringify({
  name: "pwsh",
  arguments: {
    command: "Write-Output hello-from-pwsh",
    description: "print hello",
    sandbox_permissions: "danger-full-access",
    justification: "e2e approval test",
  },
});

const term = pty.spawn(
  "cmd.exe",
  ["/d", "/s", "/c", DSH_CMD + " --profile tui --provider mock --model mock-v1"],
  {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: { ...hostEnv, DSH_HOME, DSH_MOCK_LLM: "1", DSH_MOCK_LLM_TOOL: TOOL },
    cols: 110,
    rows: 32,
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
        reject(new Error("timeout"));
      }
    }, 100);
  });

let pass = false;
try {
  await waitFor((t) => t.includes("dsht"), 20000);
  term.write("run it\r");
  await waitFor((t) => t.includes("escalate sandbox"), 45000);
  console.log("[e2e-approval] approval modal appeared");
  term.write("y\r");
  await waitFor((t) => t.includes("mock reply"), 45000);
  console.log("[e2e-approval] approval granted, turn completed");
  term.write("/exit\r");
  await waitFor(() => exited, 15000);
  console.log("[e2e-approval] exited with code " + String(exitCode));
  if (exitCode !== 0) throw new Error("unexpected exit code " + String(exitCode));
  console.log("[e2e-approval] PASS");
  pass = true;
} catch (error) {
  console.error("[e2e-approval] FAIL: " + (error instanceof Error ? error.message : String(error)));
  console.error(output.slice(-4000));
} finally {
  term.kill();
}
process.exit(pass ? 0 : 1);

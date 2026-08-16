// Dev tool: cross-process resume and session listing over headless mode.
// 1) --print --json creates a session and reports its session_id;
// 2) --resume <id> --print continues the same session;
// 3) --list-sessions shows both runs under one id.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const NPX_ROOT =
  process.env.DSH_NPX_ROOT ?? "C:/Users/chubb/AppData/Local/npm-cache/_npx/1e7f6d9597241db0";
const DSH_CMD = process.env.DSH_BIN ?? NPX_ROOT + "/node_modules/.bin/dsh.cmd";
const DSH_HOME =
  process.env.E2E_DSH_HOME ?? fileURLToPath(new URL("../.tmp/dsh-home", import.meta.url));

const hostEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith("DSH_") && !key.startsWith("XDG_")),
);

function runDsh(args) {
  const base = ["--profile", "tui", ...args];
  const result =
    process.platform === "win32"
      ? spawnSync("cmd.exe", ["/d", "/s", "/c", DSH_CMD, ...base], {
          cwd: fileURLToPath(new URL("..", import.meta.url)),
          env: { ...hostEnv, DSH_HOME, DSH_MOCK_LLM: "1" },
          encoding: "utf8",
        })
      : spawnSync(DSH_CMD, base, {
          cwd: fileURLToPath(new URL("..", import.meta.url)),
          env: { ...hostEnv, DSH_HOME, DSH_MOCK_LLM: "1" },
          encoding: "utf8",
        });
  return result;
}

let pass = true;
function check(label, condition, detail) {
  if (condition) console.log("[e2e-resume] PASS: " + label);
  else {
    pass = false;
    console.error("[e2e-resume] FAIL: " + label);
    if (detail !== undefined) console.error(String(detail).slice(-2000));
  }
}

const first = runDsh([
  "--print",
  "first task",
  "--provider",
  "mock",
  "--model",
  "mock-v1",
  "--json",
]);
check("first run exits 0", first.status === 0, first.stderr);
const resultLine = (first.stdout ?? "")
  .split(/\r?\n/)
  .find((line) => line.includes('"type":"result"'));
let sessionId = null;
if (resultLine !== undefined) {
  try {
    sessionId = JSON.parse(resultLine).session_id;
  } catch {
    sessionId = null;
  }
}
check(
  "first run reports a session_id",
  typeof sessionId === "string" && sessionId !== null,
  first.stdout,
);
check("first reply rendered", (first.stdout ?? "").includes("mock reply: first task"));

if (sessionId !== null) {
  const second = runDsh([
    "--print",
    "second task",
    "--provider",
    "mock",
    "--model",
    "mock-v1",
    "--resume",
    sessionId,
  ]);
  check("resume run exits 0", second.status === 0, second.stderr);
  check(
    "resume reply rendered",
    (second.stdout ?? "").includes("mock reply: second task"),
    second.stdout,
  );

  const list = runDsh(["--list-sessions"]);
  check("list-sessions exits 0", list.status === 0, list.stderr);
  check(
    "list-sessions contains the session id",
    (list.stdout ?? "").includes(sessionId.slice(0, 12)),
    list.stdout,
  );
}

process.exit(pass ? 0 : 1);

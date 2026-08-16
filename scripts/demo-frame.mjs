// Dev tool: capture a cleaned frame of the interactive TUI for demos.
// Runs the mock LLM with a rich markdown reply + one todo_write tool
// call, then strips ANSI and saves the terminal frame.
import { fileURLToPath, pathToFileURL } from "node:url";
import { writeFileSync } from "node:fs";

const NPX_ROOT =
  process.env.DSH_NPX_ROOT ?? "C:/Users/chubb/AppData/Local/npm-cache/_npx/1e7f6d9597241db0";
const DSH_CMD = process.env.DSH_BIN ?? NPX_ROOT + "/node_modules/.bin/dsh.cmd";
const DSH_HOME =
  process.env.E2E_DSH_HOME ?? fileURLToPath(new URL("../.tmp/dsh-home", import.meta.url));
const OUT = fileURLToPath(new URL("../.tmp/demo-frame.txt", import.meta.url));

const hostEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith("DSH_") && !key.startsWith("XDG_")),
);

const { default: pty } = await import(
  pathToFileURL(NPX_ROOT + "/node_modules/node-pty/lib/index.js").href
);

const REPLY = [
  "## 修复完成 ✓",
  "",
  "已定位 **根因**：`session/event` 的作用域过滤导致转发器收不到事件。",
  "",
  "- 修复 *forwarder* 注册位置",
  "- 补回放逻辑与回归测试",
  "- 更新设计文档",
  "",
  "> 提醒：改动后请运行 `pnpm test`。",
  "",
  "| 项目 | 状态 |",
  "| --- | --- |",
  "| 单元测试 | 45/45 |",
  "| e2e | PASS |",
  "",
  "```ts",
  "const done = true;",
  "```",
].join("\n");

const TOOL = JSON.stringify({
  name: "todo_write",
  arguments: { todos: [{ content: "写测试", status: "completed" }] },
});

const term = pty.spawn(
  "cmd.exe",
  ["/d", "/s", "/c", DSH_CMD + " --profile tui --provider mock --model mock-v1"],
  {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: {
      ...hostEnv,
      DSH_HOME,
      DSH_MOCK_LLM: "1",
      DSH_MOCK_LLM_TOOL: TOOL,
      DSH_MOCK_LLM_REPLY: REPLY,
      // Force the default dark theme regardless of the persisted selection.
      DSH_TUI_THEME: "deepseek-dark",
    },
    cols: 100,
    rows: 30,
    name: "xterm-256color",
  },
);

let output = "";
term.onData((data) => (output += data));

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

try {
  await waitFor((t) => t.includes("dsht"), 20000);
  term.write("请帮我展示一下新界面\r");
  await waitFor((t) => t.includes("修复完成"), 45000);
  // let the turn settle
  await new Promise((resolve) => setTimeout(resolve, 1200));
  console.log("[demo] frame captured");
} catch (error) {
  console.error("[demo] FAIL: " + (error instanceof Error ? error.message : String(error)));
} finally {
  const cleaned = output
    .replace(/\u001b\[[0-9;?]*[a-zA-Z]/g, "")
    .replace(/\u001b\][^\u0007]*\u0007/g, "")
    .replace(/\u001b\(B/g, "")
    .split(/\r?\n/)
    .join("\n");
  writeFileSync(OUT, cleaned, "utf8");
  term.kill();
}
process.exit(0);

# DSHT 命令 UX 优化设计（04）

> 状态：已实现（2026-08）。依据：`_research/claude-code-src`（社区源码镜像）与
> `_research/kimi-code`（官方仓库）的命令面源码/文档；本仓库实现见
> `packages/sdk/src/repl.ts`、`packages/bundle/src/{commands,startup,local-shell,index}.ts`、
> `packages/cli/src/{main,run}.ts`。

## 1. 问题

用户反馈：指令太长、使用不方便。逐条核对后，痛点集中在三个面：

1. **斜杠命令只能打全名**：`/sessions`、`/compact`、`/feedback` 每个都是 5–8 个字符，
   没有别名、没有前缀补全，打错一个字母就报 unknown command；
2. **会话 id 必须完整输入**：`/resume` 要求完整会话 id，长 id 只能去 `/sessions`
   列表里复制；
3. **想跑一条本地命令必须先退到 shell**：Claude Code 与 Kimi Code 都有 `!` 前缀的
   shell 直通，DSHT 没有；CLI 面也缺少 `-y` 之类的短旗标。

## 2. 三方命令面事实对照

### 2.1 Claude Code（`src/commands/*`、`src/keybindings/`、`utils/inputModes.ts`）

- **斜杠命令**：40+ 内置命令（/clear /compact /config /context /cost /doctor /help
  /init /login /memory /mcp /model /permissions /plan /resume /review /rewind /status
  /theme /usage /agents /add-dir /commit /export /rename /copy …），命令定义
  （`satisfies Command`）**没有 aliases 字段**——Claude 靠 `/` 触发的输入补全菜单
  和 `!`/`#`/`@` 前缀，而不是短别名；
- **`!` shell 直通**：输入以 `!` 开头即进入 bash 输入模式，命令在本地执行、输出
  回显在 transcript（`inputModes.ts`）；
- **快捷键**：`ctrl+c` 打断、`ctrl+d` 退出（双击确认）、`ctrl+l` 重绘、`ctrl+o`
  折叠展开 transcript、`ctrl+r` 历史搜索、`ctrl+t` todo 面板、`shift+tab` 循环权限
  模式、`meta+p` 模型选择器、`up/down` 输入历史；
- **CLI 短旗标**：`-p/--print`、`-c/--continue`、`-r/--resume`、`--dangerously-skip-permissions`、
  `--permission-mode <mode>`、`--model`、`--output-format`。

### 2.2 Kimi Code（`tui/commands/registry.ts`、`docs/en/reference/*.md`）

- **斜杠命令带别名**（`BUILTIN_SLASH_COMMANDS` 的 `aliases` 字段）：`/yolo → /yes`、
  `/settings → /config`、`/help → /h /?`、`/new → /clear`、`/sessions → /resume`、
  `/title → /rename`、`/feedback → /bug`、`/logout → /disconnect`、`/export-md → /export`、
  `/exit → /quit /q`、`/effort → /thinking`、`/provider → /providers`。解析是**精确匹配**
  （名字或别名），**没有前缀匹配**（`findBuiltInSlashCommand` 是精确查表）；
- **输入体验**：打 `/` 即弹出实时过滤的补全列表，别名同样参与匹配；未命中的 `/`
  输入会作为普通消息发给 agent；
- **`!` shell 模式**：空输入框敲 `!` 进入 bash 模式（`!` 变成模式提示符，不进缓冲区），
  `Ctrl-X` 切换；命令执行时 `Ctrl-B` 可转后台任务；
- **快捷键**：`shift+tab` 切换 Plan 模式、`ctrl-g` 外部编辑器、`ctrl-s` 注入 steer、
  `ctrl-o` 折叠展开工具输出、`ctrl-c` 打断、`ctrl-d` 退出（双击确认）、`ctrl--` undo；
- **CLI 短旗标**：`-p/--prompt`、`-c/--continue`、`-S/--session`（隐藏别名 `-r/--resume`）、
  `-y/--yolo`（隐藏别名 `--yes`/`--auto-approve`）、`--auto`、`--plan`、`-m/--model`、
  `--output-format`、`--add-dir`。

### 2.3 DSHT 优化前

- 斜杠命令 `/sessions /resume /new /export /status /theme /model /plan /goal /compact`
  `/feedback /help /exit /quit` 全部只能打全名；
- `/resume` 只接受完整会话 id；没有 `!` shell 直通；
- CLI 已有 `-p -r -c -n -m --provider --approval --dangerously-skip-approvals --theme`
  但没有 `-y`/plan 类短旗标，mock 环境需要手工拼 `DSH_MOCK_LLM=1 --provider mock --model mock-v1`。

## 3. 优化方案

取两家之长：**Kimi 的短别名思路 + Claude 的 `!` shell 直通 + 自研的唯一前缀解析**
（两家都没有前缀解析，这是 DSHT 的差异化）。三条硬约束：黑白色调不变；SDK 边界不变
（所有解析逻辑留在 `sdk/repl.ts` 纯函数层，可单测）；DSH agent 面命令（/plan /goal
/compact /feedback）仍走委托，别名只是入口。

### 3.1 斜杠命令：短别名 + 唯一前缀解析（sdk/repl.ts）

`SlashCommand` 增加 `aliases?: string[]`；`registerCommand` 同时注册名字与别名。
`/help` 里每个命令显示 `(别名)`。

解析优先级（`resolveCommand`）：

1. **精确匹配名字或别名**（`/s` 命中 sessions 的别名，即使 status 也以 s 开头）；
2. **唯一前缀匹配**：对所有已注册键（名字+别名）做 `startsWith`，恰好一条 → 执行
   （`/se` → `/sessions`、`/ex` → `/exit`）；
3. **歧义**：多于一条 → 报 `ambiguous command: /a — matches /alpha1, /alpha2`；
4. **未命中**：报 `unknown command: /x — try /help`。

裸 `/`（无名字）直接打印帮助列表——对齐 Kimi 敲 `/` 有反馈的体验。

别名总表（全部为 1–2 字符，互不冲突）：

| 命令        | 别名             | 前缀示例     |
| ----------- | ---------------- | ------------ |
| `/help`     | `h`, `?`         | —            |
| `/exit`     | `quit`, `q`, `x` | —            |
| `/model`    | `m`              | —            |
| `/sessions` | `s`              | `/se`        |
| `/resume`   | `r`              | —            |
| `/new`      | `n`              | —            |
| `/export`   | `e`              | `/ex` → exit |
| `/status`   | `st`             | `/sta`       |
| `/theme`    | `t`              | —            |
| `/plan`     | `p`              | —            |
| `/goal`     | `g`              | —            |
| `/compact`  | `c`              | —            |
| `/feedback` | `f`              | —            |

`/export` 用别名 `e`（精确匹配优先于前缀），所以 `/e` 导出、`/ex` 退出——与
Kimi `/export`、`/exit` 的指法一致。

### 3.2 `/resume` 会话 id 前缀匹配（bundle/commands.ts）

`/resume <片段>` 先按完整 id 直连（快路径）；失败后列出会话做 `id.startsWith` 过滤：
恰好一个 → 恢复；零个 → 回显原始错误；多个 → 列出前 8 个匹配（id + 标题）。
沿用先 attach 后 dispose 的顺序不变。

### 3.3 `!` shell 直通（sdk/repl.ts + bundle/local-shell.ts）

- SDK：`createRepl` 增加 `runShell` 回调与 `shellPrefix`（默认 `!`）；输入以 `!` 开头时
  剥离前缀交给 `runShell`，无回调则提示不可用（headless/纯 SDK 面不受影响）；
- Bundle：`local-shell.ts` 的 `runLocalShell` 用平台 shell 执行（Windows `ComSpec`/
  `cmd.exe /d /s /c`，POSIX `$SHELL` 或 `/bin/sh -c`），合并 stdout/stderr，回显
  `$ <command>`，非零退出报 `[exit N]`，输出上限 8KB（超限截断并标注）；
- 执行期间 REPL 状态不变，输出经 `surface/local` 事件进入 transcript；`!` 输入同样进
  输入历史（↑ 可召回）。

设计取舍：不复制 Kimi 的独立 shell 模式（需要编辑器级状态机改动），用 Claude 的
前缀直通——零 UI 改动、逻辑全部在可单测的 SDK 层。

### 3.4 CLI 短旗标与捷径

| 新增             | 行为                                                         | 对标             |
| ---------------- | ------------------------------------------------------------ | ---------------- |
| `-y`             | `--dangerously-skip-approvals` 的短形式                      | Kimi `-y/--yolo` |
| `-P, --plan`     | 初始会话挂载后自动执行 DSH 的 `/plan`（仅交互模式）          | Kimi `--plan`    |
| `--mock`（dsht） | 启动器拦截：注入 `DSH_MOCK_LLM=1` 并补 provider/model 默认值 | 无（开发捷径）   |

`--mock` 必须在 dsh **启动前**设置环境变量（bundle 在 config 求值时读 `DSH_MOCK_LLM`），
所以放在 `packages/cli` 启动器里拦截（`forwardMockArgs`），而不是 startup 插件里。

### 3.6 顺带修复：委托命令必须传活 signal

实测 `-P` 时发现 DSH 的 `/plan` 处理器在 narration 注入阶段读取执行上下文信号，
传入 `undefined` 会抛 `Cannot read properties of undefined (reading 'aborted')`——
即 `/plan` 命令自 0.3.0 以来的既有缺陷（委托路径传 `undefined`）。修复：
`commands.execute(agent, line, signal)` 一律传 `new AbortController().signal`，
`-P` 与 `/plan` 均验证通过（`▌ PLAN MODE` 横幅出现、无报错）。委托结果现在
同时回显 success 文本（`Plan mode on. Use /plan off to leave.`）。

### 3.5 明确不做（路线图）

- 敲 `/` 的实时补全选择器（需要编辑器级改动，列入路线图）；
- Kimi 式独立 shell 模式与 `Ctrl-X` 切换；
- 插件/技能命名空间命令（`plugin:name/sub` 语法）。

## 4. 测试与验收

- SDK 单测：别名派发、唯一前缀、歧义报错、裸 `/` 帮助、`!` 路由/无回调提示/裸 `!` 用法；
- Bundle 单测：别名注册表、`/resume` 前缀恢复与歧义列表、`runLocalShell` 输出回显与
  非零退出码；
- e2e（`scripts/e2e-tui.mjs`）：`!echo` 直通、`/h`、`/st`、`/q` 全链路；
- 门禁：`pnpm build && typecheck && lint && test` 全绿 + 三个 e2e 脚本退出码 0。

## 5. 与竞品的最终差异

| 面                | Claude Code  | Kimi Code     | DSHT（本次后）        |
| ----------------- | ------------ | ------------- | --------------------- |
| 短别名            | ➖（靠补全） | ✅ 精确别名   | ✅ 别名 + 唯一前缀    |
| `!` shell 直通    | ✅           | ✅ shell 模式 | ✅ 前缀直通           |
| 会话 id 前缀      | ➖           | ➖            | ✅ `/resume <prefix>` |
| `-y` 类短旗标     | ➖           | ✅ `-y`       | ✅ `-y`               |
| `--plan` 启动旗标 | ➖           | ✅            | ✅ `-P`（交互）       |

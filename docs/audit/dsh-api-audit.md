# DSH API 审计报告

> 证据版本：`@deepseek-ai/*` **v0.1.0-rc.6**（npx 安装产物 `lib/*.js` + `lib/types/*.d.ts`）。
> 根目录：npx 缓存 `node_modules/` 下（下文缩写 `@deepseek-ai/…`）。
> 方法：全部结论直接读产物，路径可回溯。DSHT 的所有 DSH 集成点以此文为事实基准。

## 1. Launcher 与参数流

- `dsh` bin（`@deepseek-ai/dsh/lib/bin.js`）：launcher 只解析自己的旗标
  （`--profile/--patch/--dump-config/--dump-default-config/plugin/web`），**其余参数原样**
  交给 boot 后的树（`ctx.cmdlineArgs`）。`dsh --profile tui --resume abc` → 内部参数 `['--resume','abc']`。
- `runProfile`（`dsh/lib/profile-boot-*.js`）：组合 patch 层 = bundle 层（bundles 顺序）
  → profile `cordis.patch.yml` → home 层（`$DSH_HOME/cordis.patch.yml`）→ `--patch` 覆盖 → 遥测开关。
  SIGINT/SIGTERM → 有界 shutdown（dispose 树，5s 强制退出）。
- `ctx.cmdlineArgs.get()` / `ctx.appExit(code)`（`dsh-cmdline/lib/types/index.d.ts`）；
  `provideCmdline(ctx, {args, exit})`、`parseCmdline(ctx, program)`。

## 2. Profile / bundle 机制

（`@deepseek-ai/dsh-app-boot/lib/types/profile.d.ts` + `dsh/lib/profile-boot-*.js` + `dsh-base/cordis.patch.yml`）

- profile 目录 = `$DSH_HOME/profiles/<name>/`：`package.json` 带 `dsh.profile.bundles: string[]`
  （有序 bundle 层）+ 用户层 `cordis.patch.yml`；根配置 `cordis.yml`（每次 boot 重写为空列表 `[]`）。
- bundle = npm 包，manifest 声明 dsh.bundle.patch 指向其 cordis.patch.yml。
- patch 行格式：`{id, name, config?, disabled?, inject?}` 的 YAML 列表；`- insert:` 组添加新行；
  `!!js` 表达式支持（注意：`!!js !!x` 会触发 YAML 双标签错误——实测，须写成 `!!js (!!x)`）。
  **按行 id 寻址、整行 config 替换（不合并）、后写胜出**。
- bundle 模块解析双锚点：dsh 安装优先，profile 目录次之；`$DSH_HOME/profiles/node_modules` 是
  安装闭包的平铺 symlink 回退（`healProfilesModuleFallback` 自动维护）。
- `PROFILE_TEMPLATES = {web: [dsh-base, dsh-web-app], headless: [dsh-base, dsh-headless]}`；
  **未知 profile 无 manifest 时报错退出**，提示用 `dsh plugin --profile <name> add <pkg>`。
  `dsh plugin` = 转发 pnpm 到 profile 目录；`initProfile` 写入 manifest + 空用户层 +
  pnpm-workspace.yaml（`packages: [.]`、`nodeLinker: hoisted`、`autoInstallPeers: false`）。
- 插件契约（`dsh-headless` 范式）：模块导出 `{name, inject, Config?, apply(ctx, config)}`；
  `ctx.provide(name, value)` 提供服务，`ctx.get(name)` 注入；行级 `inject` 可注入自定义服务。
- `dsh-base/cordis.patch.yml`（451 行）是一个 insert 组，含全部共享核心行
  （agent/session/tools/sandbox/approval/permission/settings/…），TUI bundle 在其上按 id 覆盖
  或追加 insert（我们追加 `ask-user-tool` + `tui-startup` + `tui-runner`，禁用 `hmr`）。

## 3. Agent 与 Session

（`dsh-agent/lib/types/index.d.ts`、`dsh-session/lib/types/{index,types}.d.ts`）

- `ctx.agents.create(options)`：`sessionId`（唯一必需，agent/session 同 id）+ `meta:{cwd,…}` +
  `agentOptions:{provider, model, maxTokens?}` + `setup(agentCtx)`（发布前作用域组合；
  **作用域事件监听要注册在这里**）。返回 `{agent, dispose()}`（dispose 是能力凭证）。
- `ctx.agents.resume({resumeSessionId})`：持久化加载 = seed 回放；`request/header` 事件 reason='resume'。
- `Agent`：`followup/steer/inject/send/cancel({kind:'user'|…})/whenIdle()/runMaintenance/status/session/id`。
- `Session`：`events`（append-only，envelope `{type,seq,time,data,surfaceOp?}`）、`seq`、`append`、
  `deriveMessages`、`firstLiveSeq`。`SessionStore`（ctx.sessions）：`prepare/enter/announce/flush/get/list`；
  **flush 是持久化唯一入口**。
- 事件 firehose：cordis 总线 `session/event`（post-commit，`Scoped<Session>` 作用域过滤，
  **seed 回放不 emit**——冷恢复必须读 `session.events` 全量）。
- 事件词汇表：`turn/start|end`、`step/start|end`、`user/message`（含 source 分类）、
  `assistant/chunk`、`assistant/message`（含 `usage: TokenUsage`）、`tool/call`（`{callId,name,arguments:string}`）、
  `tool/result`（`{message: ToolResultMessage, error?, meta?}`，**无 callId**）、`todo/write`、
  `request/header|context`、`session/end-seed`；扩充：`approval/asked|decided|policy`、
  `command/run|done`、`plan/mode`（dsh-plan-mode）、`goal/change`。
- 持久化：`$DSH_HOME/sessions/<projectKey>/<encodeSegment(id)>/session.jsonl(.zstd)`；
  projectKey 对路径字符转义；首行 header；`SESSION_FORMAT_VERSION=0`。
- 查询：`ctx.sessionQuery`（`dsh-session-query`）：`listSessions/readTitle/searchSessions/readSurface`；
  SQLite 后端 FTS 默认关（`path: ':memory:'`, `openAt: never`）——搜索需 overlay。

## 4. 审批与提问 seam

（`dsh-user-approval/lib/types/index.d.ts`、`dsh-user-questions/lib/types/index.d.ts`）

- 审批 answerer = **`approval/request` waterfall 监听器**：返回 outcome 认领，否则 `next()`；
  outcome ∈ `allowed-once | rejected | cancelled | unavailable`；无 answerer 时 ask fail-closed → unavailable。
- 策略 `ask|never`（never=确定拒绝）；默认 `DSH_PERMISSION_MODE==='danger-full-access' ? never : ask`；
  `setApprovalPolicy`/`effectiveApprovalPolicy`；每次 ask 写 `approval/asked` + `approval/decided` 审计对；
  `req.signal` abort → cancelled。**没有内置超时**。
- 提问：`ctx.userQuestions.registerProvider({ask})` **进程内单例**（重复注册抛 DUPLICATE_PROVIDER）；
  无 provider 时工具调用报 NO_PROVIDER；只有 registry exact live 根 agent 可以问人。
- 答案形状：`AskUserQuestionItem {id, question, detail?, header?, options?[{label,description?}], multiSelect?, intent?}`；
  `AskUserQuestionAnswer {answers: [{id, selected: string[], custom?}]}`。
- Web 端对照实现：`dsh-host-apiproxy/lib/index.js`（审批桥 ~:1955、提问桥 ~:1913）。

## 5. 斜杠命令

- `ctx.commands.register({name, description, input?, recordInput?, handler(invocation)})`；
  `parseCommand(line)` / `execute(agent, line, signal)`（自动写 `command/run|done` 审计）。
- 内置：`/goal`（dsh-command-goal）、`/compact`（dsh-command-compact）、`/feedback`（dsh-command-feedback）、
  `/plan`（dsh-plan-mode）、`/permission`、`/model`、`/export`（后三者为 Web 客户端命令）。
- 我们的策略：TUI 本地命令走 SDK REPL；agent 面命令（plan/goal/compact/feedback）委托 `ctx.commands.execute`。

## 6. 工具运行时

（`dsh-tools/lib/types/index.d.ts` + `presentation.d.ts`）

- `ToolRuntime.register({name, description, parameters, output:{schema, render, presentationMeta?}, execute, timeoutMs?, isConcurrencySafe?, finalizeContent?, presentCall?, presentResult?})`；
  `restrict/guard/presentAs/executionMode/get`；调度器 `TOOL_RUNTIME_SCHEDULER` 为 @internal。
- 呈现契约：`presentCall(args) → ToolCallView`（generic/terminal/diff 卡）、`presentResult → ToolResultView`；
  `meta` 经 `tool/result.meta` 持久化回放同一条路——**TUI 工具卡片应走 `ctx.tools.get(name, agent)`**
  （v0.1 的简化渲染读原始文本；升级点已记录）。
- Code Mode：`run_code` 保留工具名；`presentAs('native'|'code'|'both')`；`DSH_TOOLS_MODE` 由 patch 层注入 tools 行。
- base 未挂载、TUI bundle 自行追加的行：`dsh-tool-ask-user`（我们已追加 + provider）；
  未追加：`dsh-tool-bash-persistent`、`dsh-schedule`。

## 7. Llm 与 Settings

- `ctx.llm`（LlmRuntime）：`registerAdapter(providers, adapter)` / `registerConfigurableProviders` /
  `prepareCall` / `stream`；`LlmAdapter` 抽象唯一必须实现 `stream(options): AsyncIterable<StreamChunk>`；
  注册需 `attributionHeaders()`。`StreamChunk`：block-start/text-delta/reasoning-delta/tool-call-delta/
  block-end/usage/finish（`reason: {kind:'stop'|'tool-calls'|'max-tokens'}`）；`CallId(id)` 品牌构造器。
- `dsh-llm-deepseek` 自注册模式（`lib/index.js:627-778`）：插件行 + `settingsNamespace('llm-deepseek')` +
  `ctx.credentials` 引用 `apiKeyEnv` + 热改。我们的 mock 适配器照此注册 provider `mock`。
- `agentDefaultModel`：`currentSelection()` / `saveSelection(next)`；settings 命名空间 `agent-default-model`。
- `ctx.settings`（dsh-settings）：命名空间视图 `{get(), watch(), update(), replace()}`；文件后端
  `$DSH_HOME/settings.yaml` 热重载（watch=true, 100ms debounce）；事件 `settings/updated`。
- 命名空间清单：agent-default-model / agent-loop / llm-deepseek / llm-pi-ai / permission / shell / web-search-deepseek。

## 8. 终端与可复用服务

- `ctx.terminals.spawn(owner, {type}, signal?)` + `startSend/read/signal/kill/list`——内嵌 shell 面板的完整 API；
  `dsh-terminal-bash` + node-pty（`dsh-subprocess-local`）。
- `ctx.goals`（GoalService，CAS `GoalRef{id,revision}`）；`ctx.jobs`（JobRegistry + jobs-local）；
  `ctx.skills`（SkillRegistry）；`sessionProjections.onChanged/snapshot`（sessionStats/goal 单元）；
  `ctx.tokenMeter.measure`；spill（`maxInlineBytes: 50000`）。

## 9. 审计后修正的设计假设（实现前 vs 审计后）

| 初版假设                  | 审计事实                                        | 落地                           |
| ------------------------- | ----------------------------------------------- | ------------------------------ |
| 审批 = 设置 answerer 对象 | answerer 是 `approval/request` waterfall 监听器 | answerer.ts 按 waterfall 实现  |
| 提问 provider 可多注册    | 进程内单例                                      | 桥只注册一次                   |
| 工具调用参数已解析        | `tool/call.arguments` 为原始 JSON 字符串        | SDK ToolCall 用 string         |
| 工具结果带 callId         | 不带（只有 message/error/meta）                 | LIFO 配对 + 已记录限制         |
| 恢复时 live 事件会重放    | seed 回放不 emit `session/event`                | replayHistory 全量回放         |
| 根作用域能收到 agent 事件 | Scoped 过滤                                     | 转发器注册在 `setup(agentCtx)` |
| 自定义 profile 自动初始化 | 未知 profile 直接报错                           | cli 安装器自建 manifest + pnpm |
| `!!js !!expr` 可用        | YAML 双标签报错（实测）                         | `!!js (!!expr)`                |
| CallId 是 string          | 品牌类型 + 构造器                               | `CallId(...)`                  |
| FinishReason 是字符串     | 对象 `{kind}`                                   | `{kind:'stop'}`                |
| headless 输出即退出       | 需经 appExit → shutdown                         | 全部退出路径走 io.exit/appExit |

## 10. 已知缺口（本仓库未覆盖的 DSH 能力）

- ACP server（DSH 本体无此面；需自建 `dsh acp`）；MCP server 模式（现有 mcp-client 仅消费方向）。
- hooks 面（DSH 的 hook 机制经 cordis 事件可映射，未接面）；skills 目录约定未接 TUI 展示。
- `tool/result` 并行配对（DSH 事件缺 callId）；会话全文搜索（session-query overlay `openAt`）。
- `presentCall/presentResult` 语义化卡片（当前渲染原始文本 + diff 启发式）。

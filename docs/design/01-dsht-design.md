# DSHT 设计文档

> 状态：已实现（v0.1.0）。本文档是代码契约：事件表、协议与流程以本文为准，
> 实现位于 packages/{sdk,tui,bundle,cli}；全部 DSH 集成事实见 docs/audit/dsh-api-audit.md。

## 1. 目标与非目标

**目标**：在 DSH 之上提供对标 Claude Code / Kimi Code CLI 的终端 agent 面：

- 交互式全屏 TUI（流式渲染、工具卡片、diff、审批交互）；
- headless 打印模式（text / stream-json），CI 与脚本可用；
- 会话持久化、跨进程恢复与历史回放；
- 与 DSH 共享同一套 agent 核心、工具、权限与存储（**零 fork**）。

**非目标（v0.1.0）**：ACP server、MCP server 模式、git checkpoints、hooks 面、
内嵌 shell 面板、会话全文搜索、单二进制分发。这些在 §11 列为后续路线。

## 2. 总体架构

```
┌─────────────────────────── dsht（转发器）───────────────────────────┐
│  dsh --profile tui <args>   （profile 供给：manifest + pnpm install）│
└─────────────────────────────────────────────────────────────────────┘
                              │ launcher 组合 patch 层
                              ▼
┌─────────────────── cordis 树（dsh-base + tui-bundle）────────────────┐
│  tui-startup（commander）──提供──▶ tuiStartup 服务                     │
│  tui-runner：DshAdapter ──▶ createDshClient ──▶ SDK 事件总线          │
│            │ 审批桥（approval/request waterfall + userQuestions）     │
│            │ mock LLM（可选，provider=mock）                          │
│            ▼                                                        │
│  startTui（React + Ink）◀──事件── SessionStore ──▶ App/组件树         │
└─────────────────────────────────────────────────────────────────────┘

              print 模式：同一 client/事件流 → runHeadless → text/stream-json
```

分层职责与依赖方向（**SDK 边界铁律**，见 AGENTS.md）：

| 层   | 包       | 依赖                       | 职责                                                   |
| ---- | -------- | -------------------------- | ------------------------------------------------------ |
| UI   | `tui`    | sdk                        | 渲染与输入，只消费 SDK 事件                            |
| 驱动 | `sdk`    | 无                         | 事件契约、DshClient、审批 broker、REPL、headless、Fake |
| 胶水 | `bundle` | sdk/tui + `@deepseek-ai/*` | DSH 服务 → SDK 契约的翻译与接线（唯一 DSH 接触点）     |
| 分发 | `cli`    | 无（node 内置）            | 启动器与 profile 供给                                  |

## 3. 启动流程

1. `dsht` 确保 `$DSH_HOME/profiles/tui/package.json` 存在（缺失则自动供给），
   然后 spawn dsh 并追加 `--profile tui`，stdio 直接继承。
2. dsh launcher：解析自己的旗标（--profile/--patch/--dump-config），其余参数原样交给树；
   `runProfile` 组合 patch 层：bundle 层（按 `dsh.profile.bundles` 顺序）→ profile 用户层
   → home 层 → --patch 覆盖；未知 profile 未初始化时报错退出（见审计 §2）。
3. 树挂载后，`tui-startup` 用 `parseCmdline` 解析内部参数并 `provide(tuiStartup)`；
   `tui-runner` 注入该服务，按 `mode` 分派：
   - `list-sessions`：打印 `id\ttitle` 后退出；
   - `print`：`runHeadless`（§7），结束后 `appExit`；
   - `interactive`：`startTui` + 初始会话挂接（§5），`waitForExit` 后退出。

## 4. 事件契约

DSH 会话事件（`session/event`，作用域过滤，seed 不重放）经 `bundle/src/dsh-adapter.ts`
翻译为 SDK 事件。**冷恢复**：`attach` 发出 `session/ready` 后，runner 用
`DshAgentHandle.replayHistory` 全量回放 `session.events`（seed 不再 firehose 重发）。

| DSH 事件                                  | SDK 事件                        | 说明                                                                                                                                                                                        |
| ----------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `turn/start`                              | `turn/start`                    | 状态栏进入 running                                                                                                                                                                          |
| `turn/end`                                | `turn/end`                      | reason 映射：completed→completed；aborted/interrupted→cancelled；blocked/max-tokens→blocked；error→error{code,message}                                                                      |
| `step/start` / `step/end`                 | 同名                            | 保留（统计/未来渲染）                                                                                                                                                                       |
| `user/message`                            | **丢弃**                        | 循环自己会写；TUI 本地回显，避免双份                                                                                                                                                        |
| `assistant/chunk`（text/reasoning-delta） | `assistant/chunk`               | 流式缓冲进 SessionStore.streaming                                                                                                                                                           |
| `assistant/chunk`（tool-call-delta）      | 丢弃                            | 工具卡片由 tool/call + tool/result 渲染                                                                                                                                                     |
| `assistant/message`                       | `assistant/message`（含 usage） | 结束流式缓冲、记录 token                                                                                                                                                                    |
| `tool/call`                               | `tool/call`                     | `arguments` 为模型原始 JSON 字符串                                                                                                                                                          |
| `tool/result`                             | `tool/result`                   | ok = 无 error；content 为 ToolResultBlock 内层文本块拼接；callId 取自 `message.source.callId` / `content[0].toolCallId`（真实可恢复）；id 缺失时按最近未决调用 LIFO 配对（旧日志/回放兜底） |
| `todo/write`                              | `todo/write`                    | 保留                                                                                                                                                                                        |
| `plan/mode`                               | `plan/mode`                     | 需 import dsh-plan-mode 类型以加载事件扩充                                                                                                                                                  |
| `agent/status`（Scoped<Agent> 总线）      | `agent/status`                  | 在 agent 作用域 setup 里订阅                                                                                                                                                                |
| `agent/error`                             | `agent/error`                   | 同上                                                                                                                                                                                        |
| （surface 自有）                          | `surface/exit`                  | REPL /exit → store.exited → App unmount                                                                                                                                                     |
| （surface 自有）                          | `surface/local` / `surface/git` | 本地提示直接渲染为 transcript 项；git 徽标异步更新 footer                                                                                                                                   |
| （surface 自有）                          | `session/ready`                 | client.attach 发出，全量重置 store（保留打开的对话框）                                                                                                                                      |
| （surface 自有）                          | `session/model`                 | attach 时跟随 ready 发出，状态栏显示会话实际模型                                                                                                                                            |

## 5. 会话生命周期

- **新建**：`agents.create({sessionId: SessionId(...), meta:{cwd}, agentOptions:{provider,model},
setup: installModelSelection + 作用域转发器})`；provider/model 默认取 `agentDefaultModel`。
- **恢复**：`agents.resume({resumeSessionId})`（持久化加载即 seed 回放）；`--continue` 取
  `listSessions` 最近一条；恢复失败回退新建并提示。
- **切换**：`/new`、`/resume <id>` 先创建/恢复新句柄 → attach（session/ready 清屏）→
  历史回放 → 再 dispose 旧句柄（失败时旧会话存活）；旧句柄的迟到事件被适配器按会话 id 过滤。
- **退出**：`/exit`（或 ctrl-c）→ `surface/exit` → App unmount → runner dispose 句柄 →
  `appExit(code)` → launcher 的有界 shutdown（5s 强制）。

## 6. 审批与提问流

- **审批**：DSH 的 answerer 是 `approval/request` **waterfall 监听器**（不是 setter）。
  桥：监听 → 转 `broker.request`（SDK）→ 决策映射 allow→`allowed-once`、
  allow-always→记住工具名后 `allowed-once`、deny/answer→`rejected`；
  `req.signal` abort → `broker.cancelCurrent(deny)`，保证弹窗收敛。
- **提问**：`userQuestions.registerProvider`（进程内单例）桥到 broker；
  answer 决策按选项 label 过滤映射回 `AskUserQuestionAnswer`；deny → 空答案。
- **TUI 弹窗**：`ApprovalPrompt`（y/a/n/esc；问题表单 ↑↓/空格/回车）。
- **headless**：deny=一律拒绝；allow=一律放行（--dangerously-skip-approvals）；
  ask=TTY 时 stdin 问答（`createStdinAnswerer`），非 TTY 拒绝。

## 7. Headless 协议

退出码：0 完成；1 turn 错误；2 启动/用法错误。

`--output-format text`：只打印最终 assistant 文本。

`--json`（stream-json，一行一个 JSON 对象，兼容管道逐行消费）：

```json
{"type":"system","subtype":"init","session_id":"...","cwd":"..."}
{"type":"user","message":{...}}
{"type":"assistant","message":{...},"usage":{...}}
{"type":"tool_call","call":{"id":"...","name":"...","arguments":"..."}}
{"type":"tool_result","call":{...},"ok":true,"content":"..."}
{"type":"result","subtype":"success|error","duration_ms":76,"result":"...","session_id":"..."}
```

## 8. 斜杠命令

| 命令                           | 类型 | 行为                                                 |
| ------------------------------ | ---- | ---------------------------------------------------- |
| /help                          | 本地 | 列出命令                                             |
| /exit /quit                    | 本地 | surface/exit                                         |
| /model [provider model]        | 本地 | 显示/保存默认模型（agentDefaultModel.saveSelection） |
| /sessions                      | 本地 | 列出持久化会话                                       |
| /resume <id>                   | 本地 | 切换会话 + 回放                                      |
| /new                           | 本地 | 新建会话并 dispose 旧的                              |
| /export                        | 本地 | 写出当前会话 JSONL                                   |
| /status                        | 本地 | 会话/模型/权限模式                                   |
| /plan /goal /compact /feedback | 委托 | `ctx.commands.execute(agent, line)`，保留审计事件    |

## 9. mock LLM 适配器

provider `mock` / model `mock-v1`，`DSH_MOCK_LLM=1` 启用（bundle config mockLlm）。
`DSH_MOCK_LLM_REPLY` 指定回复文本（默认回显最后一条 `source.kind==="user"` 的消息）；
`DSH_MOCK_LLM_TOOL`（JSON `{name, arguments}`）让模型走一次工具调用。
e2e/演示无需 API key；`CallId`/`FinishReason` 用 DSH 品牌构造器。

## 10. profile 供给

`$DSH_HOME/profiles/tui/`：`package.json`（`dsh.profile.bundles: [dsh-base, tui-bundle]` +
依赖声明）、`cordis.patch.yml`（用户层，`[]`）、`pnpm-workspace.yaml`（hoisted）。
bundle 解析双锚点：安装优先、profile 次之；`dsh-base` 来自安装闭包，
`tui-bundle` 来自 profile node_modules（`pnpm add link:<checkout>` 或 registry）。

## 10.5 主题系统

- 契约：`ColorPalette` 27 语义 token（四级灰度文字层级、行级+词级 diff、子代理 8 色、
  shimmer 变体；黑白=品牌，彩色仅功能性语义）；`buildTheme` 编译为可调用 token。
- 内置主题：`auto`（OSC11/OSC997 探测）+ `deepseek-dark`/`deepseek-light` +
  `deepseek-dark-daltonized`/`deepseek-light-daltonized`（色弱友好）。
- 自定义 schema v2：`{name, displayName?, base: dark|light, colors: 部分覆盖}`（#RRGGBB
  严格校验，未指定 token 回退 base；v1 11 键 schema 兼容）；非法主题回退默认，绝不崩溃。
- 选择优先级：`--theme` > `DSH_TUI_THEME` > `$DSH_HOME/tui.json`（`/theme` 写入）> `auto`。
- 组件经 `ThemeProvider`/`useTheme()` 消费主题（React context），根容器应用背景色。
- 用户手册：`docs/manual.md` §6。

## 11. 竞品对标与后续路线

| 能力                   | Claude Code | Kimi Code CLI | DSHT v0.1          | 计划                                         |
| ---------------------- | ----------- | ------------- | ------------------ | -------------------------------------------- |
| 交互 TUI               | React+Ink   | pi-tui 自研   | React+Ink          | —                                            |
| headless + stream-json | ✅          | ✅            | ✅                 | —                                            |
| 会话恢复/继续          | ✅          | ✅            | ✅                 | 会话搜索（overlay session-query openAt）     |
| 审批/提问              | ✅          | ✅            | ✅                 | allow-always 持久化                          |
| 斜杠命令               | ✅          | ✅            | ✅                 | 自定义命令目录                               |
| skills/hooks           | ✅          | ✅            | 复用 DSH（未接面） | hooks 映射 cordis 事件；skills 目录约定      |
| MCP client             | ✅          | ✅            | 复用 DSH           | MCP server 模式（反向）                      |
| ACP                    | ✅          | ✅            | —                  | `dsh acp` 子命令（@agentclientprotocol/sdk） |
| checkpoints/undo       | ✅          | —             | —                  | session 事件溯源 + git checkpoint            |
| 内嵌 shell 面板        | —           | Ctrl-X 模式   | —                  | ctx.terminals.spawn/startSend/read           |
| 单二进制分发           | Bun 原生    | Node SEA      | —                  | Bun bundle 或 Node SEA                       |

## 12. 风险与缓解（已在实现中落地的部分）

- **行缓冲终端**：部分环境（cmd/conpty 链）按行投递输入块，Ink 单块到达（实测）。
  缓解：InputBox 按换行符分割提交，同时兼容真实终端 key.return 与多行粘贴。
- **工具结果配对**：DSH `tool/result` 的 callId 在 `message.source.callId` 与
  `content[0].toolCallId`（审计后修正，见 docs/audit §9）。适配器透传真实 id，
  store 精确匹配；id 缺失（旧日志/回放）时 LIFO 回退并仅在 id 为空时生效，
  并行场景的歧义保留为已知限制。
- **session/event 作用域**：根作用域收不到 agent 作用域事件；转发器必须在
  `agents.create` 的 `setup(agentCtx)` 里订阅（已实现），resume 后补挂。
- **`workspace:*` 依赖**：profile 外部无法解析 → 跨包依赖用相对 `link:`（发布前换版本）。
- **审批默认 fail-closed**：DSH 无 answerer 时 ask → `unavailable`/reject；headless 默认 deny。
- **启动前订阅**：headless 先订阅事件再创建会话，避免丢 `session/ready`（init 行）。

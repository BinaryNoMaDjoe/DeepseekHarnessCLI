# DSHT vs Claude Code CLI vs Kimi Code CLI — 功能 diff

> 生成时间：2026-08-16。依据：本仓库实现与测试（`packages/*`）、DSH 安装产物审计
> （`docs/audit/dsh-api-audit.md`），以及对手产品的公开源码/分发物实测
> （Claude Code：npm 分发物 + 社区源码分析镜像；Kimi Code CLI：MoonshotAI/kimi-cli、
> MoonshotAI/kimi-code 仓库直接阅读）。

图例：✅ 完整支持 · 🟡 部分/受限 · ➖ 未提供 · 🔜 本仓库路线图

## 1. 交付面（surface）

| 能力                            | Claude Code          | Kimi Code CLI              | DSHT                                 | 说明                                       |
| ------------------------------- | -------------------- | -------------------------- | ------------------------------------ | ------------------------------------------ |
| 交互式全屏 TUI                  | ✅ React+Ink         | ✅ 自研 pi-tui（差分渲染） | ✅ React+Ink                         | 三家都选组件化终端渲染                     |
| headless 打印（-p/--print）     | ✅                   | ✅ print 模式              | ✅ `--print`                         | 三家一致                                   |
| stream-json 输出                | ✅                   | ✅                         | ✅ `--json`                          | DSHT 行协议见 docs/manual.md               |
| 会话续接（--resume/--continue） | ✅                   | ✅                         | ✅ `--resume`/`--continue`           | 跨进程恢复 + 历史回放（实测 e2e）          |
| 会话列表                        | ✅ /resume 选择器    | ✅ 会话选择器              | 🟡 `--list-sessions`、`/sessions`    | 交互式选择器为路线图                       |
| IDE 扩展                        | ✅ VS Code+JetBrains | ✅ VS Code                 | ➖                                   | ACP 接入后自动覆盖 Zed/JetBrains           |
| Web 面                          | ✅ claude.ai/code    | ✅ 内置 Web（可切换）      | 🟡 复用 DSH Web profile              | 与 DSH 共享存储，可 Web↔TUI 互切（路线图） |
| 桌面 App                        | ✅                   | ➖                         | ➖                                   | —                                          |
| SDK                             | ✅ Agent SDK         | ✅ node-sdk/klient         | 🟡 `@deepseek-harness/sdk`（本仓库） | 已用于 TUI 自身；对外 API 待发布           |
| ACP（编辑器协议）               | ✅                   | ✅ acp-server              | 🔜                                   | 计划 `dsh acp` 子命令                      |
| MCP server 模式（被调用）       | ✅                   | ➖                         | 🔜                                   | DSH 现有 mcp-client 仅消费方向             |
| MCP client                      | ✅                   | ✅                         | ✅（复用 DSH mcp-client）            | 无需自建                                   |
| CI/GitHub Action                | ✅                   | ➖                         | 🟡                                   | headless 已可进管道；官方 Action 未发      |

## 2. 会话与上下文

| 能力                        | Claude Code                        | Kimi Code CLI               | DSHT                           | 说明                                             |
| --------------------------- | ---------------------------------- | --------------------------- | ------------------------------ | ------------------------------------------------ |
| 持久化                      | ✅ 原生会话文件                    | ✅ 会话目录（子代理可寻址） | ✅ DSH JSONL(zstd) 事件溯源    | 事件即状态，可导出/审计                          |
| 冷恢复历史回放              | ✅                                 | ✅                          | ✅                             | seed 不重发事件，需显式回放（已实现）            |
| 自动压缩（auto-compact）    | ✅                                 | ✅                          | ✅（复用 DSH compaction）      | `/compact` 委托 DSH                              |
| checkpoints / undo / rewind | ✅ git checkpoints + /undo /rewind | ➖                          | ➖                             | 🔜 事件溯源 + git checkpoint                     |
| 会话全文搜索                | ✅                                 | ✅                          | 🟡 DSH FTS 默认关              | 需 overlay `session-query` 的 `openAt`（路线图） |
| 会话导出                    | ✅ /export                         | ✅                          | ✅ `/export`（JSONL）          | 时间戳文件名                                     |
| 记忆文件                    | ✅ CLAUDE.md 层级                  | ✅ AGENTS.md/KIMI_* 注入    | ✅ 复用 DSH agent-instructions | —                                                |
| 任务列表（todo）            | ✅                                 | ✅                          | ✅（复用 DSH tool-todo）       | 事件已翻译到 TUI                                 |
| 计划模式（plan mode）       | ✅                                 | ✅                          | ✅（复用 DSH plan-mode）       | `/plan` 委托                                     |

## 3. 工具面

| 能力                             | Claude Code             | Kimi Code CLI               | DSHT                                                        | 说明              |
| -------------------------------- | ----------------------- | --------------------------- | ----------------------------------------------------------- | ----------------- |
| Shell 执行                       | ✅ Bash（沙箱）         | ✅ Shell（沙箱/远程）       | ✅ bash/pwsh + DSH 沙箱                                     | Windows 一等公民  |
| 文件读写/编辑                    | ✅ Edit/Write/Read      | ✅ file 工具                | ✅（复用 DSH tool-fs + str-replace）                        | —                 |
| 搜索                             | ✅ Glob/Grep（ripgrep） | ✅                          | ✅（复用 DSH fs-search）                                    | —                 |
| Web 搜索/抓取                    | ✅                      | ✅                          | ✅（复用 DSH web + deepseek 搜索）                          | 需 provider 配置  |
| 子代理（subagents）              | ✅ Task 工具            | ✅ Agent 工具（可寻址恢复） | ✅ spawn/fork/send_message/list（DSH 独有 fork 继承上下文） | 差异化点          |
| 工作流编排                       | ✅ Workflow 工具        | 🟡                          | ✅ workflow + ralph（DSH 独有）                             | 差异化点          |
| 长目标（goal）                   | ✅ ProposeGoal/任务管理 | 🟡                          | ✅ goal 服务（DSH 独有 CAS 目标）                           | 差异化点          |
| ask_user_question                | ✅                      | ✅                          | ✅（bundle 追加挂载 + 终端表单）                            | 含多选/选项描述   |
| 后台任务                         | ✅                      | ✅                          | ✅（复用 DSH jobs）                                         | —                 |
| 定时/提醒                        | ✅ Cron                 | 🟡                          | 🟡 DSH schedule 未挂载                                      | 路线图：追加行    |
| 代码执行模式（模型写代码调工具） | ➖                      | ➖                          | ✅ DSH run_code（独有）                                     | 最强差异化点      |
| Notebook 编辑                    | ✅                      | ➖                          | ➖                                                          | 依赖 DSH 未来工具 |

## 4. 审批、权限与安全

| 能力              | Claude Code                 | Kimi Code CLI | DSHT                                                        | 说明                           |
| ----------------- | --------------------------- | ------------- | ----------------------------------------------------------- | ------------------------------ |
| 交互审批弹窗      | ✅                          | ✅            | ✅ y/a/n + esc；问题表单                                    | 并发请求串行化（已修复 C1）    |
| 权限模式          | ✅ allow/deny/ask 规则      | ✅            | ✅ DSH 三档（read-only/workspace-write/danger-full-access） | 环境变量切换                   |
| 跳过审批          | ✅ bypassPermissions        | ✅            | ✅ `--dangerously-skip-approvals`/`--approval allow`        | —                              |
| headless 审批策略 | ✅（-p 下默认拒绝）         | ✅            | ✅ deny/ask(stdin)/allow                                    | ask 在 TTY 下交互问答          |
| 沙箱              | ✅ seatbelt/bubblewrap      | ✅            | ✅ DSH sandbox（含 Windows ACL 模式）                       | —                              |
| 工具级 allow 规则 | ✅ permissions.allowedTools | ➖            | 🟡                                                          | 路线图：DSH approval policy 面 |

## 5. 扩展面与自定义

| 能力         | Claude Code                  | Kimi Code CLI         | DSHT                                              | 说明                  |
| ------------ | ---------------------------- | --------------------- | ------------------------------------------------- | --------------------- |
| 斜杠命令     | ✅ 内置 + 自定义             | ✅ 内置 + skills 注册 | ✅ 内置 + SDK 注册 API                            | 见 manual             |
| skills       | ✅ SKILL.md                  | ✅ 内置 skills/klips  | ✅ 复用 DSH skill 系统                            | 目录约定待接 TUI      |
| hooks        | ✅ 生命周期 hooks            | ✅ hooks 引擎         | 🟡 DSH cordis 事件面未包装                        | 路线图                |
| 插件市场     | ✅ plugins                   | ✅ plugin marketplace | 🟡 DSH profile 插件体系（cordis）                 | 结构更底层，无市场 UI |
| **主题系统** | ✅ 内置主题 + 自定义（JSON） | ✅ 主题 + 自定义      | ✅ **deepseek-dark/deepseek-light + 自定义 JSON** | 详见下节              |

## 6. 主题系统对比

| 维度       | Claude Code        | Kimi Code CLI | DSHT                                                                                         |
| ---------- | ------------------ | ------------- | -------------------------------------------------------------------------------------------- |
| 内置主题   | ✅（多套 + 亮/暗） | ✅            | ✅ 2 套基础（深浅）                                                                          |
| 设计语言   | Anthropic 品牌     | Moonshot 品牌 | **DSH：克制、高级、高对比度**（黑白文字主体 + 语义色点缀：diff 绿/红、状态色、提示符强调色） |
| 自定义格式 | JSON 主题文件      | JSON/配置     | JSON（`$DSH_HOME/themes/<name>.json`，chalk 颜色名或 #hex）                                  |
| 切换方式   | /theme + 设置      | /theme        | `/theme`、`--theme`、`DSH_TUI_THEME`、`tui.json` 持久化                                      |
| 校验与回退 | 内置               | 内置          | 严格校验，非法主题回退默认（不崩溃）                                                         |
| 实时生效   | ✅                 | ✅            | 🟡 持久化后新会话生效（同 Kimi 行为）                                                        |

## 7. 模型与配置

| 能力           | Claude Code                       | Kimi Code CLI       | DSHT                                           | 说明                          |
| -------------- | --------------------------------- | ------------------- | ---------------------------------------------- | ----------------------------- |
| 多 provider    | ✅（Anthropic/Bedrock/Vertex 等） | ✅（Kimi + 第三方） | ✅ DSH llm seam（deepseek/pi-ai + 注册式扩展） | mock provider 内置            |
| 运行时切模型   | ✅ /model                         | ✅                  | ✅ `/model` + `--model/--provider`             | 默认选择持久化到 DSH settings |
| 配置热重载     | ✅                                | ✅                  | ✅（DSH settings 100ms debounce）              | —                             |
| token/成本显示 | ✅                                | ✅                  | ✅ 状态栏 token（assistant/message.usage）     | 累计统计待接                  |

## 8. 分发与工程

| 能力       | Claude Code                    | Kimi Code CLI                  | DSHT                                                 | 说明                |
| ---------- | ------------------------------ | ------------------------------ | ---------------------------------------------------- | ------------------- |
| 安装形态   | npm 安装器 → 原生二进制（Bun） | npm/PyPI → Node SEA 原生二进制 | 🟡 pnpm/npm 包 + `dsht install`                      | 单二进制为路线图    |
| 平台       | macOS/Linux/Windows            | macOS/Linux/Windows            | Windows 实测优先（本仓库开发平台）                   | —                   |
| 认证       | OAuth 登录                     | kimi login（OAuth）            | DSH credentials（API key/env）                       | OAuth 走 DSH 未来面 |
| 遥测       | ✅ OTel                        | ✅                             | ✅ 复用 DSH（默认关）                                | —                   |
| 测试与 e2e | 内部                           | 内部                           | ✅ 单测 + mock LLM + node-pty 真终端 e2e（公开可跑） | 差异化点            |

## 9. 结论：对标状态

**已对等**：交互 TUI、headless+stream-json、会话恢复/列表/导出、审批与提问（含并发安全）、
权限三档、斜杠命令、MCP client、子代理/workflow/goal/todo（继承自 DSH）、主题系统、多模型。

**明确落后**（按差距排序，全部有路线图）：

1. ACP（编辑器生态入场券）；2. checkpoints/undo/rewind；3. hooks 包装面；
2. 会话全文搜索；5. 单二进制分发；6. MCP server 模式；7. 交互式会话选择器。

**明确领先（对手没有）**：

1. run_code 代码执行模式（模型写 TS/Python 调用工具，TUI 原生渲染）；
2. subagent_fork（继承上下文的子代理）+ workflow/ralph 编排 + CAS goal 长目标，三件套一体化；
3. 与 DSH Web 共享同一会话存储（双面互切潜力）；
4. Windows 一等公民（pwsh 工具、Windows ACL 沙箱、Windows 终端实测）；
5. 公开可跑的无 key e2e（mock LLM + PTY）。

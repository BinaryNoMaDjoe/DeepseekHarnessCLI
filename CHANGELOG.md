# Changelog

## Unreleased

命令 UX 优化：短别名、唯一前缀解析、`!` shell 直通与 CLI 短旗标
（对照 Claude Code 与 Kimi Code 命令面，见 docs/design/04-command-ux.md）。

### 修复（深度审查驱动，2026-08）

- **Critical**：`tool/result` 翻译读取层级错误 —— 真实 `ToolResultMessage.content =
[ToolResultBlock]`（`{type:'tool-result', toolCallId, content}`），旧代码按 `type==='text'`
  过滤外层块导致工具结果永远为空；callId 实为 `message.source.callId` /
  `content[0].toolCallId`（审计 §9「不带 callId」为误读，已修正）。适配器现透传真实
  callId 与内层文本；store 精确匹配优先、LIFO 仅作 id 缺失兜底；translate 测试夹具
  改为真实形状。
- **Critical**：`/new` `/resume` `/sessions` 销毁的是新挂接句柄而非旧句柄（fbea7e3 回归，
  与设计 §5 相反）——先捕获旧句柄再 attach、回放后销毁旧句柄；补 dispose 目标回归测试。
- **Critical**：会话切换的鸭子类型 `replayHistory` 脱绑 `this` 调用（ESM 严格模式下
  `this === undefined`，`DshAgentHandle.replayHistory` 崩溃）——改 `.call(handle, emit)`，
  补绑定回归测试；e2e-tui 增补 `/new` 全链路冒烟。
- **Major**：会话标题恒为 "(untitled)" —— `readTitle` 返回 `SessionTitleSnapshot` 对象
  而非 string，`listSessions` 取 `.title`。
- **Major**：并发审批 abort 竞态 —— bridge 的 `cancelCurrent(deny)` 只认队列头，排队请求
  的 abort 会误杀活跃请求。broker 增 `request(request, signal?)` 按请求定位取消 +
  `approval/cancelled` 事件；TUI 订阅该事件收敛弹窗（修复审批 abort 后弹窗悬挂，
  设计 §6 承诺兑现）；bridge 改为透传 `request.signal`。
- **Major**：REPL 本地输出以 `assistant/chunk` 泄漏进 streaming 缓冲并串入下一条助手
  消息——改发 `surface/local`（设计 §4 契约）。
- **Major**：对话框重入结算错 Promise（僵尸对话框 + 悬挂 Promise）——`openDialog`
  改为「先结算旧 resolver、再存新 resolver」并接收 resolver 参数；补配对回归测试。
- **Major**：`package.json` 的 `types` 指向不存在的 `lib/types/index.d.ts`
  （tsc 无 declarationDir 时声明与 JS 同目录）——sdk/tui/bundle 改为 `lib/index.d.ts`；
  build 前清理 lib/ 消除陈旧产物（如已删除的 keymap.js）。
- 用法错误退出码改为 2（设计 §7：0 完成 / 1 turn 错误 / 2 用法错误）；
  agent/error 载荷按 string/Error/{code,message} 规整不再丢信息；
  `forwardMockArgs` 支持 `--model=x` 并校验值存在；cli 安装/转发以 cmd.exe 包裹替代
  `shell:true`+args（消除 DEP0190 弃用警告）；e2e-install 嵌套会话强制 `.tmp/dsh-home`。
- store 不可变性：LIFO 回退不再原地改写旧状态；重复 callId 不覆盖已结算调用；
  `turn/end` 合并双 set、呈现 blocked reason、持久化 cancelled/error turn 的 reasoning；
  fold 显式记录 step/agent-status（保留）；v1 主题具名色（white/gray…）真实产出 ANSI；
  wrapText 硬断超长词；ProgressBar 八分之一刻度 off-by-one；FieldsDialog 空字段守卫；
  App 退出 effect 补依赖；detectTerminalScheme 结算后摘除监听并恢复 raw 模式；
  删除死 token `shellMode`（契约 27 token，设计 §10.5 同步）。
- mock LLM CallId 按调用递增，避免同 turn 内 id 冲突。

### 新增

- 斜杠命令短别名与唯一前缀解析（sdk/repl.ts）：`/h /s /r /n /e /st /t /m /p /g /c /f`
  `/q /x /?`；`/se` → `/sessions`；歧义报候选、裸 `/` 打印帮助。
- `!` shell 直通：`!cmd` 本地执行并回显 transcript（sdk runShell 钩子 + bundle
  local-shell.ts，8KB 截断、非零退出报 [exit N]）。
- `/resume <id-or-prefix>` 会话前缀匹配（唯一则恢复，多个列候选）。
- CLI 短旗标：`-y`（--dangerously-skip-approvals）、`-P/--plan`（交互启动进计划模式）；
  dsht 启动器新增 `--mock`（注入 DSH_MOCK_LLM + mock provider/model 默认值）。
- 单测 +26（SDK repl 别名/前缀/歧义/shell、bundle 别名表/resume 前缀/local-shell），
  e2e-tui 增补 `!echo`、`/h`、`/st`、`/q` 冒烟；本轮审查再补：dispose 目标/绑定回归、
  审批取消/排队 abort、对话框配对、tool-result 真实形状、store blocked/reasoning 等。
- 修复 `/plan` 委托传 `undefined` signal 导致 narration 注入崩溃（
  `Cannot read properties of undefined (reading 'aborted')`）；委托命令现回显 success 文本。

## 0.3.1 (2026-08-16)

测试体系设计与审计（docs/testing.md）。

### 测试审计抓出的真实缺陷（已修复）

- **Critical**：审批 answerer 注册在根作用域，而 approval/request 是 Scoped<Agent>
  分发——交互模式下审批从未弹出、所有 ask 静默失败。修复：answerer 按 agent 作用域
  注册（mountApprovalAnswerer），提问 provider 保持进程单例。
- **High**：行缓冲终端把 y/a/n 作为整块送达，审批弹窗按键失效。修复：
  ApprovalPrompt 按换行分割取首段（与 InputBox 同纪律）。
- stream-json 的 tool_result 行补充 error 字段（诊断用协议增强）。

### 新增

- 测试设计文档 docs/testing.md（五层策略/可测性铁律/门禁与豁免）。
- 可测性重构：dialog 纯函数抽取（filterItems/visiblePage/firstEmptyField →
  dialog-logic.ts）、detectTerminalScheme IO 可注入、git-badge exec 可注入、
  commands 鸭子类型回放。
- 新测试 25 个：SDK driver/headless 错误路径、对话框逻辑、终端探测（假 IO）、
  bundle 命令对话框流、git-badge、CLI 嵌套环境（总计 86 测试全绿）。
- 审批流 e2e（scripts/e2e-approval.mjs）：mock 触发 pwsh 沙箱提权 → 审批弹窗 → y 放行 → 完成。
- vitest coverage（v8）：纯函数模块 86.7-100%、sdk 83%；门禁见 docs/testing.md §5。

## 0.3.0 (2026-08-16)

视觉系统 v2：融合 Kimi Code 与 Claude Code 的终端 UI 工程并超越，品牌保持黑白。

- 色彩系统 v2：30 语义 token（四级灰度文字层级、行级+词级 diff、子代理 8 色、
  shimmer 变体），黑白=品牌（文字/边框/焦点/用户角色全灰度），彩色仅功能性语义；
  内置主题：deepseek-dark/light + 色弱 daltonized 双主题 + auto（OSC11/OSC997 探测）。
- 主题 schema v2：base + 部分覆盖 + displayName（hex 严格校验），v1 兼容。
- diff 升级：行级背景色块 + 词级加粗高亮（Claude 式）。
- 工具卡 v2：Ctrl+O 折叠/展开、六态状态图标（✓✗⚠ℹ○…）、预览行数上限。
- thinking 块独立渲染（可折叠预留）；双行 footer（状态行 + context 行 + 轮换快捷键提示 + git 徽标）。
- 对话框框架（Kimi DESIGN.md 规范：顶/底单边框、hint 行、❯ 指针、← current、搜索行、
  滚动指示）；/sessions /theme /model 对话框化；审批弹窗对齐规范；多字段输入对话框。
- shimmer spinner（双色帧动画）、八分之一精度进度条、StatusIcon 组件。
- 测试：TUI 26 全绿；PTY e2e 覆盖 /theme 对话框流程；demo-frame 抓帧更新。

## 0.2.0 (2026-08-16)

TUI 视觉升级（对标 Claude Code / Kimi Code 的终端 UI 工程学）。

- 富 markdown 渲染：内联加粗/斜体/行内代码、标题、代码块（带语言边框）、
  引用、有序/无序列表、表格（带分隔线）、分隔线；内联解析器 + 相邻文本合并。
- 工具调用卡片：边框卡、运行态 spinner、✓/✗ 结算状态、参数摘要（嵌套 JSON 正确展示）、
  结果体缩进 + diff 绿/红渲染。
- 状态栏升级：身份 chips、当前工具 spinner、token 计数、todo 进度徽标、
  PLAN 徽标、权限档、主题名。
- 输入面板：圆角边框输入区 + 快捷键提示 footer；光标反色块；plan 模式横幅；
  按终端高度窗口化渲染。
- 默认主题在黑白主体上加入语义色（diff 绿/红、状态图标、提示符强调色），
  保持克制设计语言；新增 scripts/demo-frame.mjs 演示抓帧工具。
- 单测更新（markdown 内联/列表/表格），TUI 25 测试全绿；双 e2e 回归通过。

## 0.1.1 (2026-08-16)

审查修复与主题系统。

### 修复（审查驱动）

- 审批/提问串行队列：并发请求不再覆盖 resolver，answerer 抛错收敛为拒绝（C1/L15）。
- 工具结果 LIFO 配对落地：DSH 无 callId 的结果正确挂上工具卡片（H1），补回归测试。
- 会话切换：/new /resume 先销毁旧句柄；session/ready 全量重置 store（H2）。
- 审批弹窗挂起时输入框挂起（isActive 门控），打字不再误触发 y/a/n（H3）。
- 退出路径：runner 错误经 appExit 走有界 shutdown；print 路径不再二次 dispose（H4）。
- stream-json 补 user 行；未知 turn reason fail-closed（M1/M3）。
- 多行粘贴陈旧闭包修复；/sessions 显示完整 id；/export 时间戳文件名；
  allow-always 按会话隔离；多问题 ask 逐个回答；mock 工具脚本一次性消费（M2/M4/M6/M7/M9）。
- list-sessions 按真实 SessionRecord 形状映射（此前恒空）。
- resume 在 setup 中安装模型选择：修复 model 变量缺失导致恢复失败。
- CLI 在嵌套 harness 会话内忽略宿主 DSH 环境变量并清空子进程环境（M8）。
- 状态栏显示会话实际模型（新增 session/model 事件）；本地提示走 surface/local。

### 新增

- 主题系统：deepseek-dark（默认）/ deepseek-light 两套基础主题（克制、高级、
  高对比度黑白设计语言），自定义主题（$DSH_HOME/themes/<name>.json，严格校验+回退），
  /theme 命令、--theme 旗标、DSH_TUI_THEME、tui.json 持久化。
- 文档：docs/diff-claude-kimi.md（完整功能 diff）、docs/manual.md（全部指令与功能手册）。
- e2e：跨进程 resume/continue/list-sessions 脚本；PTY 冒烟覆盖 /theme 切换。

## 0.1.0 (2026-08-16)

首个可用版本：DSHT 终端 agent 的完整骨架与可运行实现。

### 新增

- packages/sdk：事件模型（与 DSH 会话事件对齐）、DshClient/ClientAdapter、
  审批 broker（含取消）、REPL 状态机与斜杠命令、headless 运行器（text/stream-json）、
  Fake 适配器（测试契约）。
- packages/tui：React + Ink 全屏 UI（消息流/diff/工具卡片/状态栏/输入/审批弹窗/问题表单），
  终端 markdown、统一 diff 与 diff 解析、SessionStore（useSyncExternalStore）。
- packages/bundle：cordis.patch.yml（tui profile）、commander 启动面
  （--print/--json/--resume/--continue/--model/--provider/--approval/--list-sessions）、
  DSH 适配器（事件翻译、会话恢复与历史回放）、审批/提问桥、mock LLM 适配器。
- packages/cli：dsht 转发器与 dsht-install profile 供给器。
- 工程化：pnpm monorepo、strict TS、eslint/prettier、vitest（SDK 7 + TUI 11 + bundle 6 + CLI 2），
  node-pty 交互冒烟脚本。
- 文档：设计文档、DSH API 审计报告、仓库规范。

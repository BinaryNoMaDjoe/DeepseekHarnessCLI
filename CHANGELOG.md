# Changelog

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

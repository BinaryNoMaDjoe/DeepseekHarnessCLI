# Changelog

## 0.1.0 (2026-08-16)

首个可用版本：DSHT 终端 agent 的完整骨架与可运行实现。

### 新增

- `packages/sdk`：事件模型（与 DSH 会话事件对齐）、DshClient/ClientAdapter、
  审批 broker（含取消）、REPL 状态机与斜杠命令、headless 运行器（text/stream-json）、
  Fake 适配器（测试契约）。
- `packages/tui`：React + Ink 全屏 UI（消息流/diff/工具卡片/状态栏/输入/审批弹窗/问题表单），
  终端 markdown、统一 diff 与 diff 解析、SessionStore（useSyncExternalStore）。
- `packages/bundle`：`cordis.patch.yml`（tui profile）、commander 启动面
  （--print/--json/--resume/--continue/--model/--provider/--approval/--list-sessions）、
  DSH 适配器（事件翻译、会话恢复与历史回放）、审批/提问桥、mock LLM 适配器。
- `packages/cli`：`dsht` 转发器与 `dsht-install` profile 供给器。
- 工程化：pnpm monorepo、strict TS、eslint/prettier、vitest（SDK 7 + TUI 11 + bundle 6 + CLI 2），
  node-pty 交互冒烟脚本。
- 文档：设计文档、DSH API 审计报告、仓库规范。

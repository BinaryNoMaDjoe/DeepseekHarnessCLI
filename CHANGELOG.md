# Changelog

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
- shimmer spinner（双色帧动画）、八分之一精度进度条、StatusIcon/Byline 组件。
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

# DSHT — DeepSeek Harness 终端 CLI/TUI

DSHT 是 DeepSeek Harness (DSH) 的终端 agent：一个 `dsh --profile tui` 的 cordis bundle
profile，对标 Claude Code / Kimi Code CLI。它复用 DSH 全部核心（agent 循环、工具、
会话持久化、沙箱、审批、子代理、workflow、goal），只新增终端面：

```
dsht (packages/cli)          →  dsh --profile tui（转发器 + profile 供给）
  └─ tui-bundle (packages/bundle)   cordis 插件：startup 命令行 + runner + DSH 适配器 + 审批桥
       ├─ @deepseek-harness/sdk    事件模型 / DshClient / 审批 broker / REPL / headless
       └─ @deepseek-harness/tui    React + Ink 全屏 UI（消息流、工具卡片、diff、状态栏）
```

## 功能

- **交互 TUI**：流式渲染、工具调用卡片与 diff 预览、状态栏（model/权限/会话）、
  斜杠命令（/help /model /sessions /resume /new /export /status /plan /goal /compact /feedback）、
  审批弹窗（y/a/n）与 ask_user_question 选项表单。
- **Headless**：`--print "task"`（text）与 `--json`（stream-json 协议），
  `--resume <id>` / `--continue`，审批策略 deny/ask/allow。
- **会话**：DSH 原生 JSONL 持久化，跨进程恢复与历史回放，`--list-sessions`。
- **e2e 友好**：`DSH_MOCK_LLM=1` 脚本化 mock 模型，无需 API key 全链路测试。

## 快速开始

```bash
pnpm install && pnpm approve-builds --all
pnpm build

# 安装（开发形态：link 本仓库 bundle 到 ./.tmp/dsh-home/profiles/tui）
node scripts/e2e-install.mjs

# headless 真模型
DSH_HOME=./.tmp/dsh-home dsh --profile tui --print "hello"

# headless mock（无需 API key）
DSH_MOCK_LLM=1 DSH_HOME=./.tmp/dsh-home dsh --profile tui --print "hello" --provider mock --model mock-v1

# 交互（在真实终端里运行）
DSH_HOME=./.tmp/dsh-home dsh --profile tui

# PTY 冒烟测试
node scripts/e2e-tui.mjs
```

发布形态的安装器（registry 版）：`dsht install` / `dsht <args>`（见 packages/cli）。

## 文档

- `docs/design/01-dsht-design.md` — 架构、事件映射、headless 协议、功能规格、竞品对标
- `docs/audit/dsh-api-audit.md` — 全部 DSH 集成点的审计事实（证据路径）
- `AGENTS.md` — 仓库规范

## 许可

MIT。DSH 本体为 `@deepseek-ai/*`（其自身许可），本仓库不包含其源码。

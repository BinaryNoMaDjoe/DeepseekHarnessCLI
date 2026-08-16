# DSHT 测试体系设计（Testing Design）

> 本文档是测试的单一真值源：分层策略、每层技法、覆盖目标、豁免清单与
> 运行命令。与 `AGENTS.md` 的「测试即规格」铁律配套。

## 1. 分层策略

| 层            | 对象                                                            | 技法                                              | 位置                    | 目标                                          |
| ------------- | --------------------------------------------------------------- | ------------------------------------------------- | ----------------------- | --------------------------------------------- |
| L1 纯函数单测 | 事件翻译、markdown/diff、主题校验/构建、对话框纯逻辑、状态 fold | vitest，无 IO、无 React                           | `packages/*/test/`      | **语句覆盖 ≥ 85%**（每模块）                  |
| L2 驱动集成   | DshClient/审批 broker/REPL/headless                             | `FakeAdapter` 脚本化会话（零 DSH 依赖）           | `packages/sdk/test/`    | 状态机全路径                                  |
| L3 胶水单元   | bundle 命令/适配器/主题管理器/git 徽标                          | 真实 DSH 类型 + 手写轻量替身（Fake adapter 复用） | `packages/bundle/test/` | 分支全覆盖                                    |
| L4 真机 e2e   | 全链路（profile→boot→UI→模型→退出）                             | mock LLM + node-pty 真终端 / headless 进程        | `scripts/e2e-*.mjs`     | 关键路径冒烟：boot/help/dialog/审批/恢复/退出 |
| L5 覆盖率审计 | 全仓                                                            | `vitest --coverage`（v8 provider）                | CI/本地                 | 见 §5                                         |

## 2. 可测性铁律

1. **逻辑与渲染分离**：对话框过滤/分页/必填校验、diff 配对、令牌编译等一律抽成
   纯函数（`dialog.ts` 导出 `firstEmptyField`、`filterItems`、`visiblePage`；
   `diff.ts` 导出 `diffWords`/`pairDiffRows`），组件只做映射。
2. **依赖可注入**：终端探测的 IO（stdin/stdout）与 git 徽标的执行器通过参数注入默认值，
   测试传假实现。
3. **鸭子类型边界**：bundle 命令对句柄只依赖 `replayHistory?()` 可选方法，测试用
   FakeAdapter 句柄即可驱动（不 import DSH Agent 类）。
4. **Fake 优先于 mock 框架**：SDK 的一切测试经 `createFakeAdapter` 走真实事件总线，
   不 mock 内部模块。

## 3. 覆盖目标（按模块）

| 模块             | 必测路径                                               | 豁免                                       |
| ---------------- | ------------------------------------------------------ | ------------------------------------------ |
| events/store     | 每种事件→状态、重置语义、LIFO、dialog 生命周期         | —                                          |
| driver/headless  | attach 事件序、resume 透传、文本/JSON 输出、三类退出码 | —                                          |
| approval         | 串行队列、answerer 抛错、cancelCurrent                 | —                                          |
| repl             | 斜杠分发、历史、命令异常转本地消息                     | —                                          |
| diff             | LCS、预算守卫、词级、配对                              | —                                          |
| markdown         | 全块类型、内联、未闭合代码                             | —                                          |
| theme            | v1/v2 校验、非法回退、编译令牌、反色、色弱             | 终端探测（L4 覆盖）                        |
| dialog           | 过滤/分页/必填/重入                                    | Ink 键位渲染（L4 覆盖）                    |
| bundle translate | 全部事件映射 + 未知原因 fail-closed                    | —                                          |
| bundle commands  | 对话框请求形状、选中回调、dispose 时序                 | —                                          |
| theme-manager    | auto/内置/自定义/持久化/环境覆盖                       | —                                          |
| git-badge        | 仓库内返回分支徽标、非仓库 null                        | 慢 FS                                      |
| cli              | manifest 构造、嵌套环境判定                            | pnpm 真实安装（L4 覆盖）                   |
| e2e              | boot/help/theme 对话框/审批/恢复/列表/退出             | Ctrl+O 等需真终端 raw 模式的键（注释说明） |

## 4. 运行命令

```bash
pnpm test                      # 全部 L1-L3
pnpm --filter @deepseek-harness/tui run coverage   # 覆盖率
node scripts/e2e-tui.mjs       # PTY 全链路（/help → /theme 对话框 → 回复 → 退出）
node scripts/e2e-approval.mjs  # 审批流（mock 触发 pwsh → 弹窗 → y 放行）
node scripts/e2e-resume.mjs    # 跨进程恢复 + 会话列表
```

## 5. 覆盖率审计（L5）

实测口径（vitest v8 provider，`pnpm coverage`）：

| 层                                                          | 门禁             | 实测（2026-08）                                           |
| ----------------------------------------------------------- | ---------------- | --------------------------------------------------------- |
| L1 纯函数模块（diff/markdown/theme/dialog-logic/translate） | statements ≥ 85% | dialog-logic 100 · markdown 96.5 · theme 96.6 · diff 86.7 |
| L2 sdk 全包                                                 | statements ≥ 80% | 83.0%（branches 76.1）                                    |
| tui store（UI 路径由 L4 兜底）                              | statements ≥ 70% | 74.9                                                      |
| 全仓纯逻辑层（sdk + 上述纯模块）                            | statements ≥ 75% | 达标                                                      |

豁免清单（计入 L4 e2e 而非单测）：Ink 组件的 JSX 渲染路径（PTY 真机渲染兜底）、
`detectTerminalScheme` 的 OSC 交互（假 stdin 单测 + e2e）、bundle runner/适配器挂载与
cli 启动器（mock LLM e2e 兜底）。每次 `pnpm coverage` 输出 `coverage/` 报告。

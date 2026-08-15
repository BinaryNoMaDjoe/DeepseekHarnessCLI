# DSHT 完整说明文档（Manual）

DSHT 是 DeepSeek Harness 的终端 agent（`dsh --profile tui` 的 cordis bundle profile）。
本文档覆盖全部指令、功能与配置。设计契约见 `docs/design/01-dsht-design.md`；
与竞品的功能对照见 `docs/diff-claude-kimi.md`。

## 1. 安装

前置：Node ≥ 22、pnpm、dsh 启动器（`@deepseek-ai/dsh`，npm 全局或本地）。

### 1.1 开发形态（本仓库）

```bash
pnpm install && pnpm approve-builds --all && pnpm build
node scripts/e2e-install.mjs   # 供给 ./.tmp/dsh-home/profiles/tui（link 本仓库 bundle）
```

### 1.2 发布形态（dsht 启动器）

```bash
dsht install            # 供给 $DSH_HOME/profiles/tui 并从 registry 安装 bundle
dsht install --link <checkout>/packages/bundle   # 开发：link 本地 bundle
dsht uninstall          # 删除 tui profile
dsht doctor             # 安装事实（profile 目录、是否已装）
dsht <args...>          # 等价于 dsh --profile tui <args...>（缺失 profile 自动供给）
```

## 2. 运行形态

| 形态          | 命令                                     | 说明                            |
| ------------- | ---------------------------------------- | ------------------------------- |
| 交互 TUI      | `dsh --profile tui`                      | 全屏终端 UI（默认）             |
| headless 文本 | `--print "任务"`（别名 `--prompt`/`-p`） | 打印最终回复后退出              |
| headless JSON | `--print "任务" --json`                  | 一行一 JSON 的 stream-json 协议 |
| 会话列表      | `--list-sessions`                        | 打印 `id\ttitle` 后退出         |

## 3. 启动旗标（完整清单）

```
-p, --print [task...]         print 模式：回答一个任务后退出（--prompt 同义）
    --output-format <f>       text | stream-json（默认 text）
    --json                    等价 --output-format stream-json
-r, --resume <session>        恢复指定会话
-c, --continue                继续最近创建的会话
-n, --new                     强制新会话
-m, --model <model>           本次会话模型
    --provider <provider>     本次会话 provider
    --approval <policy>       headless 审批策略：deny | ask | allow（默认 deny）
    --dangerously-skip-approvals   等价 --approval allow
    --theme <name>            TUI 主题（默认读取环境/配置）
    --list-sessions           列出持久化会话并退出
-h, --help                    帮助
```

交互模式下不接受位置参数（会报错）；headless 任务文本可以跟旗标同用。

## 4. 斜杠命令（完整清单）

| 命令                      | 行为                                                                              |
| ------------------------- | --------------------------------------------------------------------------------- |
| `/help`                   | 列出全部命令                                                                      |
| `/exit` `/quit`           | 结束会话退出（exit 0）                                                            |
| `/model [provider model]` | 显示或设置默认模型（对新会话生效；如 `/model deepseek-official deepseek-v4-pro`） |
| `/sessions`               | 列出持久化会话（完整 id + 标题）                                                  |
| `/resume <id>`            | 切换至指定会话（旧句柄先销毁，历史回放）                                          |
| `/new`                    | 新建会话（销毁当前）                                                              |
| `/export`                 | 导出当前会话 JSONL（时间戳文件名，不覆盖）                                        |
| `/status`                 | 显示会话/模型/权限模式                                                            |
| `/theme [name]`           | 无参数列出主题；`/theme <name>` 切换（对新会话生效）                              |
| `/plan`                   | 进入计划模式（委托 DSH plan-mode）                                                |
| `/goal`                   | 管理长目标（委托 DSH goal 命令）                                                  |
| `/compact`                | 压缩上下文（委托 DSH compaction）                                                 |
| `/feedback`               | 记录会话反馈（委托 DSH）                                                          |

交互键位：`Enter` 提交、`Ctrl+Enter` 换行、`↑/↓` 历史、`←/→` 移动光标、
`Backspace/Delete` 编辑、`Esc` 清空输入（空输入时取消当前回合）、`Ctrl+C` 退出。
审批弹窗：`y` 允许一次、`a` 总是允许（会话内同工具）、`n`/`Esc` 拒绝；
问题表单：`↑/↓` 选择、`空格` 多选切换、`Enter` 确认、`Esc` 取消。

## 5. Headless 协议（stream-json）

一行一个 JSON 对象，可逐行管道消费。退出码：0 完成；1 回合错误；2 启动/用法错误。

| 行                                                      | 含义                                         |
| ------------------------------------------------------- | -------------------------------------------- |
| `{"type":"system","subtype":"init","session_id","cwd"}` | 会话初始化                                   |
| `{"type":"user","message":{...}}`                       | 任务文本                                     |
| `{"type":"assistant","message":{...},"usage":{...}}`    | 助手消息（含 token）                         |
| `{"type":"tool_call","call":{"id","name","arguments"}}` | 工具调用（参数为原始 JSON 串）               |
| `{"type":"tool_result","call":{...},"ok","content"}`    | 工具结果                                     |
| `{"type":"error","error":{...}}`                        | 运行错误                                     |
| `{"type":"result","subtype":"success                    | error","duration_ms","result","session_id"}` | 终态 |

headless 审批：`deny` 一律拒绝（默认，fail-closed）；`allow` 一律放行；
`ask` 在 TTY 下通过 stdin 交互问答（工具审批 y/a/n；问题按编号多选），非 TTY 一律拒绝。

## 6. 主题系统

设计语言：**克制、高级、高对比度黑白**——区分靠字重、变暗与反色，而非色相。

| 内置主题                | 说明                                                     |
| ----------------------- | -------------------------------------------------------- |
| `deepseek-dark`（默认） | 终端默认黑底，白色主文字，灰色弱化，反色强调（黑字白底） |
| `deepseek-light`        | 白底黑字，反色强调（白字黑底）                           |

### 6.1 自定义主题

放入 `$DSH_HOME/themes/<name>.json`，与内置主题并存：

```json
{
  "name": "my-mono",
  "mode": "dark",
  "background": null,
  "colors": {
    "primary": "white",
    "secondary": "gray",
    "accent": "#e6e6e6",
    "success": "white",
    "error": "white",
    "warning": "white",
    "code": "white",
    "heading": "white",
    "diffAdd": "white",
    "diffDel": "gray",
    "diffContext": "gray"
  }
}
```

规则：`mode` 取值 dark|light；`background` 为 chalk 颜色名、`#hex` 或 null（终端默认）；
11 个 color 键全部必填（chalk 颜色名或 `#hex`）；未知键忽略；非法 JSON 或缺键的
主题会被拒绝并回退默认主题，绝不崩溃。`/theme` 会列出全部可用主题。

### 6.2 选择优先级

`--theme <name>` 旗标 > `DSH_TUI_THEME` 环境变量 > `$DSH_HOME/tui.json`（`/theme` 写入）

> 默认 `deepseek-dark`。切换对新会话生效。

## 7. 模型与权限

- 模型：默认取 DSH `agent-default-model`（settings.yaml），`--model/--provider` 覆盖本次会话，
  `/model` 持久化默认值。状态栏显示会话实际模型。
- 权限三档（`DSH_PERMISSION_MODE`）：`read-only`（只读）/`workspace-write`（默认，可写工作区）
  /`danger-full-access`（全放行）。TUI 状态栏显示当前档位。
- 工具呈现模式（`DSH_TOOLS_MODE`）：`native`（默认，逐个工具）/`code`（模型只写代码调用，
  run_code 模式）/`both`。

## 8. mock 模型（无 key 测试/演示）

```bash
DSH_MOCK_LLM=1 dsh --profile tui --print "hi" --provider mock --model mock-v1
DSH_MOCK_LLM_REPLY="固定回复"          # 覆盖回复文本（默认回显你的任务）
DSH_MOCK_LLM_TOOL='{"name":"todo_write","arguments":{"todos":[]}}'  # 首轮触发一次工具调用
```

## 9. 环境变量一览

| 变量                                                        | 作用                                                                  |
| ----------------------------------------------------------- | --------------------------------------------------------------------- |
| `DSH_HOME`                                                  | DSH 数据目录（profiles/settings/sessions/credentials；默认 `~/.dsh`） |
| `DSH_PERMISSION_MODE`                                       | 权限档位（read-only/workspace-write/danger-full-access）              |
| `DSH_TOOLS_MODE`                                            | 工具呈现（native/code/both）                                          |
| `DSH_TUI_THEME`                                             | TUI 主题覆盖（次高优先级）                                            |
| `DSH_MOCK_LLM` / `DSH_MOCK_LLM_REPLY` / `DSH_MOCK_LLM_TOOL` | mock 模型开关与脚本                                                   |
| `DEEPSEEK_API_KEY` / `DEEPSEEK_BASE_URL`                    | DeepSeek 凭据与端点                                                   |
| `DSH_TELEMETRY_*`                                           | 遥测（默认关）                                                        |

注意：`dsht` 在 DSH harness 会话内运行时自动忽略宿主注入的 `DSH_*` 变量并清空
子进程环境，避免把 profile 装进宿主的 home。

## 10. 会话与数据

- 会话持久化于 `$DSH_HOME/sessions/<projectKey>/<id>/session.jsonl(.zstd)`（事件溯源，
  首行 header）。`--resume`/`/resume` 冷恢复回放历史。
- `/export` 输出可审计的 JSONL 副本。
- 主题选择存于 `$DSH_HOME/tui.json`；自定义主题目录 `$DSH_HOME/themes/`。

## 11. 开发与测试

```bash
pnpm build && pnpm typecheck && pnpm lint && pnpm test   # 全量校验
node scripts/e2e-install.mjs    # 供给 .tmp profile
node scripts/e2e-tui.mjs        # PTY 交互冒烟（/help → /theme → 回复 → /exit）
node scripts/e2e-resume.mjs     # 跨进程恢复 + 会话列表冒烟
```

架构铁律（SDK 边界/事件契约/测试即规格）见仓库 `AGENTS.md`。

## 12. 故障排查

- `profile "tui" does not exist`：先运行 `dsht install`（或 `node scripts/e2e-install.mjs`）。
- `prompt variable "{{model}}" has no value`：旧版本 bug，升级 bundle（resume 已安装模型选择）。
- TUI 不响应 Enter：极老终端/管道环境按行缓冲投递输入，DSHT 已兼容（粘贴同样安全）。
- 审批永久挂起：已修复为串行队列（v0.1.1）；如复现请提供 `DSH_INPUT_LOG` 抓取的输入流。
- 颜色缺失：chalk 自动检测 TTY；管道下 headless 输出无 ANSI 是预期行为。

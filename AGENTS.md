# AGENTS.md — @local/dsh-prompt-lab

面向接手本插件的 AI。先读本文件，再按"改动流程"操作；细节以实现和 DSH 安装包源码为准，
不要凭记忆。

## 这是什么

零依赖的 profile 链接插件，位于 `D:\folders\workspace3\dsh-prompt-lab`，Loader 行为
`include:prompt-lab`（patch 行 id `prompt-lab`）。功能：把系统默认注入的提示词条目
（段落/运行时上下文/变量/工具描述/辅助调用指令）全部变成可覆盖，按「档位（profile）」
保存并切换，捕获发给模型的完整请求，并提供设置页与可选 `prompt_lab` 工具。

## 文件职责

| 文件 | 职责 |
|---|---|
| `index.js` | Host 端。`apply(ctx)` 式插件，**只用 node:fs/path/crypto**；改写组装、shadow 覆盖、捕获请求、HTTP API、可选工具、状态持久化 |
| `client.js` | 浏览器 half。`window.__ModuleLoader__.load({id, factory})` 工厂格式，注册 `settings.section` 页；无构建步骤、无 JSX |
| `cordis.patch.yml` | 插入 `prompt-lab` 行 |
| `locale/{en,zh}.json` | 插件管理页 meta（title/description） |
| `icon.svg` | 插件列表图标 |
| `LICENSE` | MIT 许可证 |
| `state.json` | 运行时状态（自动维护）。**插件运行中不要手改**，会被内存状态覆盖；用 API/工具修改 |
| `README.md` | 面向用户的功能说明（中文），改动功能后同步更新 |

## 关键机制（改代码前必读）

1. **条目观测 + 改写**：在全局 `system-prompt/assemble` 瀑布里读取当前组装结果（按
   `context.agent.session.id`，无 agent 记为 `global`），记录 names/defaultText，并改写
   `sections`/`contexts`/`variables` 中与覆盖表同名的文本。条目列表只来自观测：注册表不可枚举，
   所以 DSH 重启后要等一次组装（模型步骤或在页面点「立即组装」）才有数据。
2. **上下文覆盖必须 shadow**：DSH 在请求入队时会 `refreshContext()` 重新解析 context provider，
   纯 waterfall 改写会被覆盖。因此对覆盖的 context 名在 agent 作用域
   `agent.ctx.systemPrompt.context({name, order, text})` 注册同名片，order 取
   `state.contextOrders`（未知名字用观测位置估算）。
3. **工具描述覆盖**：`agent.ctx.tools.register({...definition, description})` 做 scoped shadow；
   默认描述登记到 `scope.tools` 供页面展示。
4. **场景指令**：在 `llm/stream` 监听里对 `purpose !== 'conversation'` 的请求打补丁：
   `compaction` 的 options 可变（替换末尾 user 消息，真正生效）；`session-title` 的 options 被
   包内 `deepFreeze()`，只能登记不能生效。请求快照（`captured`）也从这里采集。
5. **HTTP API**：`/prompt-lab/api` 注册为 webServer 的 **resource**（Desktop 页面载体只走
   GET/HEAD + readResource，handler/POST 不可达）。所有动作走查询参数；读操作免 token，
   写操作需 `token`（`action=inspect` 返回）；长文本用 `beginWrite/appendWrite/commitWrite`
   分块。**必须 `ctx.inject(['webServer'], …)` 注册**，否则冷启动顺序会漏注册（曾导致页面 404）。
6. **prompt_lab 工具可选**：`state.toolEnabled` 控制；`syncTool()` 动态注册/注销工具。
7. **静态参考值**：`REFERENCE_TEXTS` / `REFERENCE_VERSION` 为未激活条目提供参考文本；
   DSH 升级后需核对更新。
8. **内存卫生**：`observed`/`captured` 按会话最多 `MAX_TRACKED_SESSIONS`（24，LRU 淘汰）；
   `pendingWrites` 10 分钟 TTL、最多 64 条。

## state.json 结构

```json
{
  "enabled": true,            // 应用覆盖 + 捕获请求的总开关
  "toolEnabled": true,        // 是否向 AI 暴露 prompt_lab 工具
  "captureMax": 8,            // 每会话保留的请求快照数
  "activeProfile": "default",
  "profiles": {
    "default": {
      "sectionOverrides": {}, "contextOverrides": {}, "variableOverrides": {},
      "toolDescriptionOverrides": {}, "scenarioPromptOverrides": {}
    }
  },
  "contextOrders": { "working-directory:current": 100, "sandbox:policy": 110, "...": 0 }
}
```

档位导出格式：`{format:"prompt-lab-profile@1", exportedAt, referenceVersion, profileName, profile}`。

## 改动流程

1. 改 Host（`index.js`）后**重启插件行**：
   `plugin_manager set_plugin` → `target: include:prompt-lab`, `enabled: false`，再 `true`。
   改 Client（`client.js`）只需刷新页面（必要时 Ctrl+Shift+R）。
2. 语法检查（不要引入 `@deepseek-ai/*` 依赖，linked bundle 解析不到）：
   ```powershell
   $env:ELECTRON_RUN_AS_NODE = '1'
   & $env:DSH_NODE_EXECUTABLE --check 'D:\folders\workspace3\dsh-prompt-lab\index.js'
   & $env:DSH_NODE_EXECUTABLE --check 'D:\folders\workspace3\dsh-prompt-lab\client.js'
   ```
3. 功能验证（端口用运行时 GUI URL，路径固定）：
   ```powershell
   Invoke-RestMethod "http://127.0.0.1:<port>/prompt-lab/api?action=inspect"
   ```
   写操作先取 `token`，如 `action=set&token=..&kind=section&name=..&text=..`。
4. 有 `prompt_lab` 工具时可用它做端到端（`list`/`set`/`clear`/`preview`/`requests`/`read`）。

## DSH 升级适配清单

先读安装包源码（`app.asar` 内可用 read 工具读取，如
`...\dsh\node_modules\@deepseek-ai\dsh-system-prompt\src\index.ts`）确认，再改代码：

- 条目名是否变化：`plan:policy`、`team:policy`、`mcp-resource-servers`、`tool:subagent*`、
  `deployment:persona-*`、`sandbox:policy`、`approval:policy`、`harness:source`、`app:web-surface`
  → 更新 `REFERENCE_TEXTS`/`REFERENCE_VERSION`。
- 压缩指令（`dsh-compaction-basic` 的 `COMPACTION_INSTRUCTION`）与会话标题提示词
  （`dsh-session-title-first-prompt-llm`）文本是否变化 → 更新参考值。
- web 载体是否仍只支持 resource GET/HEAD（`readResource`）；token/分块协议是否仍工作。
- `systemPrompt` API、`refreshContext` 行为、`ctx.tools.get(name, agent)`、工具定义形状是否变化。
- 客户端槽位/模块格式（`window.__ModuleLoader__` factory）是否变化。

## 约束与陷阱

- Host 端保持零依赖；不要改 DSH 安装文件。
- 不要手改 `state.json`；用 API/工具（运行中内存态会覆盖文件）。
- API 仅同源放行 + 写操作 token；仅本机使用，勿暴露到网络。
- 客户端样式只用 `--dsw-alias-*` 主题 token；不要引 Harness Client 包做 UI 原语。
- 覆盖只影响提示词文本；不修改 DSH 的会话日志/请求结构（除辅助调用指令的 messages 补丁）。
- `toolEnabled` 关闭后，模型不可调用 `prompt_lab`，但设置页与 API 仍可用。

## 快速验证清单

- `inspect` 返回 200，`diagnostics` 为空；
- `set` → `preview` 能看到覆盖文本；`clear` 恢复；
- 档位 `create/activate/delete` 与 `exportProfile`/`importProfile` 往返正常；
- 「仅覆盖」作用域：给不存在的条目设覆盖后可见，清除后消失；
- `toolEnabled` 关闭后下一步请求工具列表不含 `prompt_lab`，开启后恢复；
- `settings.section` 槽位存在 `@local/dsh-prompt-lab`（client inspect）。

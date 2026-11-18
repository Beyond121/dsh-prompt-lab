# Prompt Lab @local/dsh-prompt-lab

系统提示词研究与全量编辑插件：让 DSH 默认注入的**每一个**提示词条目都可编辑，按
「档位（profile）」保存并一键切换，并捕获真正发送给模型的完整最终请求。
面向提示词研究者。

## 安装

从 GitHub 获取后，DSH 会把它作为**链接目录**安装（改动后无需重新打包）：

1. 克隆仓库或下载 ZIP 并解压，例如 `D:\tools\dsh-prompt-lab`；
2. 在 DSH 的 **Plugins → Add plugin** 选择该目录，或让 agent 调用
   `plugin_manager` 的 `install_bundle`，`target` 指向该目录；
3. 刷新页面一次，打开 **设置 → Prompt Lab**。

更新：`git pull` 后，在插件管理里重启 `prompt-lab` 行；只改了 `client.js` 的话刷新页面即可。


## 界面（推荐）

安装后刷新页面一次，打开 **设置 → Prompt Lab**：

- **档位卡**：当前档位下拉切换、`保存为新档位`（复制当前档位）、`删除`、`导出档位`/`导入档位`、`复制 JSON`。
  顶栏两个开关：
  - `应用覆盖并捕获`：总开关；关闭后不应用覆盖、不捕获请求，页面编辑仍会保存到档位。
  - `向 AI 提供 prompt_lab 工具`：控制模型是否能调用 `prompt_lab`（默认开启）。日常提示词工程
    以外的工作可关闭，避免 AI 顺手修改提示词；关闭后设置页仍可通过同源 API 正常编辑。
  - `导出档位` 下载 `prompt-lab-<档位名>-<日期>.json`，格式为
    `{ format: "prompt-lab-profile@1", exportedAt, referenceVersion, profileName, profile: { sectionOverrides, contextOverrides, variableOverrides, toolDescriptionOverrides, scenarioPromptOverrides } }`。
  - `导入档位` 选择 JSON 文件后**新建**一个档位（名称取文件内 `profileName` 或文件名；重名自动加 `-2` 后缀，不覆盖已有档位），随后自动切换到该档位；大文件走分块上传。
- **条目页**：作用域（会话）选择 + 段落/上下文/变量/工具 分类列表；右侧显示默认文本，
  编辑覆盖文本并 `保存覆盖` / `恢复默认`。覆盖立即对下一步生效，无需重启。点击
  `查看在完整提示词中的位置` 可定位当前条目在整段提示词中的顺序（未激活时用静态参考值占位）。
  档位里存在任何覆盖时，作用域栏会多出一个 **仅覆盖（Overrides only）** 条目页：它不依赖
  任何组装观测，按四种类型列出当前档位的全部覆盖（未观测到的行标注 `未观测`），因此即使
  条目后来不再被组装（换预设、功能停用、升级改名），也能在这里查看、继续编辑或清除。
- **场景页（新增）**：
  - 上半部分按家族列出**场景专属条目**（当前作用域未激活、默认文本为空的条目：计划模式
    `plan:policy`、智能体团队 `team:policy`、MCP 资源 `mcp-resource-servers`、子代理深度
    限制等），同样可编辑覆盖；
  - 下半部分列出**场景请求**（非普通对话的模型调用，如压缩 `compaction`、会话标题
    `session-title`）。点开可看该请求的完整消息、工具 schema 与原始 JSON。
- **请求页**：最近捕获的模型请求列表；点开看 provider/model/推理参数、完整消息
  （role、source、正文可展开）、全部工具 schema、原始 JSON。
- **实时组装页**：按所选作用域重新组装并渲染当前生效的系统提示词。点击后会同时刷新左侧条目
  列表——预览本身就是一次真实组装，插件借此记录该作用域的条目（这也是 DSH 重启后
  “立即组装”或发一条消息即可让条目重新出现的原因）。

页面通过同源 HTTP 路由 `/prompt-lab/api` 与 Host 通信（GET 读状态，POST 执行动作），
无需额外服务。跨源请求会被拒绝。

## 命令行/对话方式

agent 也可用 `prompt_lab` 工具执行同样的动作：

```
prompt_lab({"action":"list"})                       // 条目 + 档位
prompt_lab({"action":"createProfile","name":"coding-v2"})
prompt_lab({"action":"activateProfile","name":"coding-v2"})
prompt_lab({"action":"set","kind":"section","name":"deployment:persona-prefix","text":"You are ..."})
prompt_lab({"action":"clear","kind":"section","name":"deployment:persona-prefix"})
prompt_lab({"action":"preview"})
prompt_lab({"action":"requests"})
prompt_lab({"action":"read","id":"req-3","tail":5})
```

HTTP 示例（PowerShell；页面本身走同一路由）：

```powershell
# 只读：取状态与写入令牌
$state = Invoke-RestMethod -Uri 'http://127.0.0.1:63684/prompt-lab/api?action=inspect'
$token = $state.data.token
# 写入必须带令牌
Invoke-RestMethod -Uri ("http://127.0.0.1:63684/prompt-lab/api?action=set&token=$token&kind=section&name=deployment%3Apersona-prefix&text=You+are+...")
```

该路由是 `webServer` 的 resource（Desktop 页面载体只派发 GET/HEAD），因此所有动作都以
查询参数传递；超过约 600 字符的文本由页面自动分块（`beginWrite`/`appendWrite`/`commitWrite`）。

## 可编辑条目

| 类别 | 例子 |
|---|---|
| `sections` | `harness:identity`、`deployment:persona-prefix`、`deployment:persona-suffix`、`tool:pwsh`、`tool:read`、`ui:deliverable-file-references`、`harness:source`、`app:web-surface` |
| `contexts` | `working-directory:current`、`sandbox:policy`、`approval:policy`、`subagent:identity`、`harness:source`、`app:web-surface` |
| `variables` | `provider`、`model` |
| `tools` | 任意已注册工具名（schema 的 `description`） |

「工具」页的条目来自**实际发出的请求**（`llm/stream` 捕获时会登记该请求携带的全部
工具 schema 与描述），因此会话发过一条消息后就会列出全部工具，无需先设置覆盖；每个
工具的描述都可单独覆盖。

覆盖文本与默认文本一样参与 `{{model}}` 插值；空字符串在渲染时移除该条目。

## 特殊场景提示词（压缩、会话标题等）

「场景」页分三部分：

1. **场景专属条目**：`plan:policy`、`team:policy`、`mcp-resource-servers`、
   `tool:subagent:depth` 等随功能出现的注册条目（当前作用域未激活时默认文本为空），
   可直接覆盖。
2. **场景提示词覆盖**：针对不经过注册表的辅助调用指令，键为 `<purpose>:<role>`。
   即使从未触发过场景，这三个键也会预先出现并带静态参考值，可直接提前编辑：
   - `compaction:user` —— **压缩指令**（`dsh-compaction-basic` 作为对话末尾的一条 user
     消息发送）。该调用的 options 可变，插件在 `llm/stream` 处替换指令文本后再发往
     adapter，因此可以真正改写；压缩请求会复用本会话的系统提示词与工具 schema（命中
     prefix cache），这部分由档位覆盖生效。
   - `session-title:system` / `session-title:user` —— 会话标题调用的系统指令与用户
     框架文本。其包把 options `deepFreeze()` 了，覆盖只登记不生效（页面会提示），
     仍可查看捕获到的原文。
3. **场景请求**：捕获到的非普通对话调用（`compaction`、`session-title` 等）列表，
   点开看完整消息（含压缩指令原文）、工具 schema 与原始 JSON。

### 未激活条目的静态参考值

未激活条目的文本由对应功能的**动态状态**决定（例如计划模式段落只在计划模式中非空、
压缩指令只在压缩时产生），无法凭空渲染。插件内置一张**静态参考值表**（从 DSH
0.2.2-rc.3 安装内容提取，标注来源：preset 配置或所属包常量）。条目未激活时：

- 详情页显示「静态参考值 · 来源」；
- 点击 `查看在完整提示词中的位置` 打开浮层，按组装顺序列出全部段落/上下文，当前条目
  高亮；未激活时其位置以参考值占位，方便确认它在整段提示词中的位置与邻接关系。

参考值仅用于理解，实际注入以激活时为准；升级 DSH 后可能漂移，需要时我会更新该表。

当前 Desktop profile 默认关闭了 compaction（`compaction-basic`/`command-compact` 行）；
启用后执行 `/compact` 即可在「场景 → 场景请求」看到一次压缩调用，其指令会作为
`compaction:user` 出现在「场景提示词覆盖」中供编辑。

## 工作原理

- `index.js`（零依赖 Host 插件）：
  - `system-prompt/assemble` 中按名字改写 section/context/variable 文本并记录默认值；
  - 对覆盖的上下文与工具描述在 agent 作用域 shadow 注册（因 `refreshContext()` 会用注册者
    重算上下文，纯改写会被覆盖）；
  - `llm/stream` 处捕获发送前完整请求；
  - `webServer.register` 暴露 `/prompt-lab/api`；注册 `prompt_lab` 工具；
  - 状态持久化于本包 `state.json`（含全部档位与 `activeProfile`）。
- `client.js`：`window.__ModuleLoader__` 工厂格式，注册 `settings.section` 页面，用 fetch 调 API。

## 限制

- 页面编辑的是「档位」而非 preset 文档；每个档位对所有会话生效。
- 工具描述 shadow 按会话作用域生效；全局层（无 agent）无法覆盖工具 schema。
- API 未做令牌鉴权，仅依赖同源校验；本插件面向本机使用，请勿把 GUI 暴露到不可信网络。
- 修改 Host 端 `index.js` 后需要在插件管理里重启该行；改 `client.js` 刷新页面即可。
- 覆盖不会改动 DSH 安装文件，升级 DSH 后依然有效。

## License

MIT License. See [LICENSE](LICENSE). 你可以自由使用、修改和再分发；转载或二次发布时保留版权与许可声明即可。


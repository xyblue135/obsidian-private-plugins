# xyblue135 · AI 元数据

> **开源插件**：xyblue135 维护的开放源代码插件，仓库公开、可自由查看与复用。  
> **README 当前用途**：暂时作为完整版本变更记录（Changelog）使用；历史版本说明先全部保留，后续再单独迁移/拆分为使用说明、升级指南和 Changelog。  
> **兼容原则**：插件 ID 保持 `00_xyblue135-ai-metadata-demo`，升级包不携带 `data.json`，覆盖安装时保留用户本地配置、API Key 与历史状态。

维护者：**xyblue135**

---

## v0.6.0：双摘要 summary_short + summary_long

这一版把原来的单一 `summary` 拆成两个用途明确的摘要字段：

```yaml
summary_short: "用于快速识别主题的短摘要"
summary_long: "用于理解文章结构的长摘要"
tags:
  - ...
```

### 1. 新增 summary_short

`summary_short` 面向：

- 首页文章卡片；
- 搜索结果；
- 悬浮预览；
- 快速浏览；
- 只需要迅速知道“这篇文章在讲什么”的场景。

默认最大长度为 **100 字符**，推荐范围约 **70～120 字符**。

Short Harness 的目标不再是简单把正文截短，而是优先保留：

```text
对象 / 技术主题
  ↓
核心问题
  ↓
最主要的方案、结论或知识点
```

同时要求使用正常、自然的中文表达，避免把摘要压成：

```text
12V3A/5A→1.2W；BAT依赖；XL4016+MOS；NTC待查
```

这类电报体、参数串或关键词堆砌。

---

### 2. 新增 summary_long

`summary_long` 面向：

- AI 理解整篇文章结构；
- 技术含量 / 权重判断；
- 博客文章排序；
- RAG；
- 自动分类；
- 相关文章推荐；
- 全库文章比较；
- 需要在不读取全文的情况下尽量恢复文章主要内容的场景。

默认最大长度为 **300 字符**，推荐范围约 **250～320 字符**。

Long Harness 强调尽量恢复完整的信息链：

```text
背景 / 问题
  ↓
排查 / 实验 / 测试依据
  ↓
核心判断与因果关系
  ↓
技术方案 / 实现方式
  ↓
关键参数、模块、接口或工具
  ↓
风险 / 限制 / 异常 / 待验证问题
```

正文信息充足时，默认要求尽量使用字符预算的 **75%～95%**，不再主动把长技术文章压成几十字的“最终结论”。

---

### 3. 双摘要使用完全独立的 Harness

原来的：

```text
Summary Harness
```

拆分为：

```text
Summary Short Harness
Summary Long Harness
```

两个 Harness：

- 可以分别启用 / 禁用；
- 可以分别编辑；
- 可以分别恢复默认；
- 分别支持自己的长度变量。

新变量：

```text
{{summaryShortMaxChars}}
{{summaryLongMaxChars}}
```

为了兼容旧的自定义 Prompt，旧：

```text
{{summaryMaxChars}}
```

仍可以解析，并默认映射到 `summary_long` 的长度。

---

### 4. 合并请求升级为一次生成三个字段

开启实验性合并请求时，一篇文章如果同时缺少：

```text
summary_short
summary_long
tags
```

插件默认只发送 **1 次** `/chat/completions`，要求模型返回：

```json
{
  "summary_short": "短摘要",
  "summary_long": "长摘要",
  "tags": [
    {"value": "标签", "weight": 0.95}
  ]
}
```

插件会分别解析、校验三个字段，并在全部逻辑结果成功后一次性写入 frontmatter。

如果只缺其中两个字段，例如：

```text
summary_long + tags
```

或者：

```text
summary_short + summary_long
```

合并请求开启时也会尽量通过 **1 次 API 请求**补齐，而不是固定拆成三次请求。

如果只缺一个字段，则只生成该字段。

---

### 5. Properties 增加三个独立 AI 按钮

新版支持：

```text
summary_short  ✨
summary_long   ✨
tags           ✨
```

Properties 中的按钮继续遵守 v0.4.6 之后的原则：

> 点击哪个字段，只生成并写入哪个字段。

也就是说：

- `summary_short` 旁 ✨ → 只更新短摘要；
- `summary_long` 旁 ✨ → 只更新长摘要；
- `tags` 旁 ✨ → 只更新标签。

不会因为开启合并请求而顺带覆盖另外两个字段。

---

### 6. 新增双摘要命令

命令面板增加 / 调整为：

- 为当前 Notes 笔记生成短摘要 `summary_short`
- 为当前 Notes 笔记生成长摘要 `summary_long`
- 为当前 Notes 笔记同时生成短摘要和长摘要
- 为当前 Notes 笔记生成加权标签
- 为当前 Notes 笔记生成双摘要和标签

原来的“生成摘要”入口在新版中对应 `summary_long`，因为长摘要承担原 Summary 的“理解文章内容”职责。

---

### 7. 待更新识别改为分别检查三个字段

默认非 fingerprint 模式下：

```text
summary_short 非空 → Short 已完成
summary_long  非空 → Long 已完成
tags          非空 → Tags 已完成
```

一篇文章只有三个字段都完成，才会被视为元数据完整。

因此可能出现：

```text
summary_short：已有
summary_long：缺失
tags：已有
```

此时插件只补：

```text
summary_long
```

不会覆盖已有 Short 和 Tags。

待更新面板也会分别显示：

```text
Summary Short
Summary Long
Tags
```

方便直接看出缺哪个字段。

---

### 8. 内容指纹分别追踪两个摘要

开启 fingerprint 后，原来的：

```text
lastSummaryHash
lastTagsHash
```

升级为：

```text
lastSummaryShortHash
lastSummaryLongHash
lastTagsHash
```

正文指纹计算会忽略 AI 管理的：

```text
summary
summary_short
summary_long
tags
position
```

其中旧 `summary` 也继续忽略，避免历史字段变化导致无意义重跑。

关闭 fingerprint 时，会清理新旧持久化摘要 hash，不把这些内容继续保存在 `data.json`。

---

### 9. 保留旧 summary，不自动迁移正文属性

v0.6.0 **不会在插件启动时自动把整个 Vault 的旧：**

```yaml
summary:
```

直接改名或删除。

原因是这种操作会静默批量修改大量 Markdown，不适合作为普通插件升级动作。

因此升级后的策略是：

```text
旧 summary → 暂时原样保留
summary_short → 新生成
summary_long → 新生成
tags → 继续维护
```

新版完成状态只依据：

```text
summary_short
summary_long
tags
```

旧 `summary` 不再作为新版摘要完成条件。

等后续确认整个双摘要体系稳定后，再单独设计旧 `summary` 的迁移 / 清理工具。

---

### 10. 旧设置自动兼容迁移

旧版使用：

```text
summaryMaxChars
summaryHarness
summaryHarnessEnabled
```

v0.6.0 升级时会转换为：

```text
summaryShortMaxChars
summaryLongMaxChars

summaryShortHarness
summaryLongHarness

summaryShortHarnessEnabled
summaryLongHarnessEnabled
```

长度迁移规则：

- 旧 `summaryMaxChars` 在约 40～140 时，优先作为短摘要长度；
- 旧值 ≥180 时，优先作为长摘要长度；
- 无有效旧值时使用默认：
  - Short = 100
  - Long = 300

旧版 Summary Harness 通常围绕“单句 / 极简摘要”设计，因此不会直接拿来充当新的 Long Harness；两个新 Harness 使用各自新的默认模板，避免把 `summary_long` 再次压成技术速记。

---

### 11. 摘要截断逻辑继续优化

延续 v0.5.7 的改动：

- 不再简单使用 `.slice(maxChars)` 粗暴切断；
- 超长时优先尝试在：
  - `。`
  - `！`
  - `？`
  - `；`
  等句子边界结束；
- 如果没有合适句子边界，再考虑较靠后的逗号 / 顿号等从句边界；
- 只有找不到合理自然边界时才使用硬长度上限。

目的是尽量避免：

```text
……并通过 MOS 理想二极管实现防倒
```

这种被截在半句话中的摘要。

---

### 12. Summary Markdown 清理继续复用

原 v0.5.4 的：

**Summary 输入 Markdown 清理**

继续保留，并同时作用于：

```text
summary_short
summary_long
```

独立 Tags 请求仍使用原始正文。

合并请求时，因为同一次请求同时生成双摘要和 Tags，目前继续复用摘要清理后的正文，保持现有合并请求逻辑。

---

### 13. 升级包继续不携带 data.json

从 v0.5.7 开始，发布 / 升级包不再附带本地 `data.json`。

这样覆盖安装时不会把用户已有的：

- API Key；
- Base URL；
- Model；
- 自动更新设置；
- Tag 索引；
- 更新日志；
- 错误记录；
- 其他本地状态

一起覆盖。

升级时应保留当前插件目录中原有的 `data.json`。

---

### 14. 推荐的新 Frontmatter 结构

```yaml
---
status: done
summary_short: ""
summary_long: ""
tags: []
---
```

这两个摘要字段也无需提前手动创建；生成时插件可以直接写入。

---

---

## v0.5.7：Summary 从“100 字技术速记”升级为自然内容总览

- 默认 `summaryMaxChars` 从 100 调整为 **300**；首次从旧版升级且仍为 100/120 字以内时自动迁移到 300，一次迁移后不再干涉用户后续自定义。
- 移除合并请求中硬编码的“单句摘要”，改为**通常 2～3 个完整句子、单段不换行**的自然文章概览。
- Summary Prompt 增加 75%～95% 字符预算目标，正文信息充足时不再主动压成几十字结论。
- 默认 Harness 明确要求覆盖“问题/场景 → 排查与数据 → 判断 → 技术方案 → 风险/限制/待验证项”，并禁止电报体、参数串、关键词堆叠。
- 独立 Summary 与 Summary+Tags 合并请求使用同一套长度与表达策略，避免两种入口生成风格不一致。
- 修复旧版 `slice(maxChars)` 可能把 Summary 生硬截断在半句话的问题；超长时优先在中文句号/分号等自然边界截断。
- 设置页增加 250～320 字推荐说明。
- 升级安装包不携带 `data.json`，避免覆盖现有本地配置、历史状态与 API Key。

---

---

## v0.5.6

- 默认关闭内容指纹识别。
- 默认以 Properties 是否有内容判断完成状态：`summary` 非空即完成，`tags` 非空即完成。
- 当一项已有内容、另一项为空时，批量/自动任务只补缺失项，不覆盖已有项。
- 新增可选 **内容指纹 fingerprint 识别** 开关；首次开启时以当前已有 Summary/Tags 建立基线，避免全库立即重跑。
- 关闭 fingerprint 后删除 `lastSeenSourceHash`、`lastSummaryHash`、`lastTagsHash`，不再在 `data.json` 保存这些持久化指纹。
- 单次 AI 请求期间仍会使用临时内容 hash 防止“请求过程中正文变化却写入旧结果”，该临时校验不会写进数据库。

---

## v0.5.5

- 插件显示名称改为 `xyblue135 · AI 元数据`。
- 保持插件 ID `00_xyblue135-ai-metadata-demo` 不变，兼容原插件升级。
- 发布包保留原始 `data.json` 中的其他记录；v0.5.6 会移除旧的持久化文章指纹字段，但保留 Tag 目录、更新日志、标签评分、错误记录等其他状态。
- 保留 v0.5.4 的可选 Summary Markdown 清理功能。

---

## v0.5.4

- 新增可选的 **Summary 输入 Markdown 清理** 开关（默认关闭）。
- 开启后去除 `#`、反引号、粗体、引用等展示格式但保留文字。
- 图片嵌入与链接 URL 会被清理。
- 超过 500 字符的 fenced 代码块会替换为省略提示，短代码块保留内容。
- Tags 单独生成仍使用原始正文；实验性 Summary + Tags 合并请求会共用清理后的正文。

---

## v0.5.3

- 新增“元数据 status 校验”开关：关闭时批量识别白名单内全部 Markdown；开启时自动扫描、文件夹树统计和文件夹识别仅处理 frontmatter `status: done`。`status: undone`、缺少 status 或其他值会跳过。
- 单篇文章 Properties 中的 ✨ 手动生成不受 status 过滤限制。
- 设置页改为卡片分组布局，并在顶部显示当前扫描模式、自动更新状态和模型。
- 文件夹识别在排队后、请求过程中和写入前会再次检查 status，避免文章中途从 done 改为 undone 后仍被写入。

---

## v0.5.2：自动更新硬停止 + 两段式 API 校验

本版重点修改两处：

1. **自动触发更新增加显式“关闭自动更新”按钮**。关闭后会清除下一次定时任务；如果后台自动扫描正在等待 API，也会通过 `AbortController` 中止当前自动请求。手动单文件生成、手动文件夹识别不受影响。
2. **“测试 API”改为两段式校验**：先 `GET {Base URL}/models` 检查 Base URL、Bearer API Key 和模型列表，再发送一个极小的 `POST {Base URL}/chat/completions` 请求验证真实推理链路。对于 `auto` / `auto:*` 虚拟路由模型，不强制要求它出现在 `/models` 列表中。
3. 测试成功时会显示 `/models` 返回的模型数量；若服务返回 `X-Routed-Via`，同时显示实际路由信息。

这套校验尤其适合 FreeLLMAPI 这类 OpenAI-compatible 聚合路由：`/models` 成功只能说明入口和鉴权正常，第二段真实 chat 请求还能继续验证当前上游 provider / 路由是否真的可用。

---

## v0.5.1：Tag 大小写本地规范化

这一版把 Tag 大小写统一从 Prompt 中移到插件本地完成，**不会因为 Vault Tag 越来越多而增加输入 Token**。

处理优先级固定为：

```text
AI 返回原始 Tag
  ↓
Vault 已有同名 Tag（忽略大小写）？
  ├─ 是 → 沿用 Vault 已有写法
  │       若已有多个历史大小写变体，则使用出现次数最多的写法
  │       若次数并列且技术词标准写法本身已经存在，则优先该标准写法
  └─ 否 → 查“技术词规范表”
           ├─ 命中 → 使用标准写法
           └─ 未命中 → 保留模型写法
```

例如 Vault 已经有 `Prometheus`，AI 返回 `prometheus` / `PROMETHEUS`，最终都会写成 `Prometheus`。
如果 Vault 从未出现过该 Tag，则会使用设置页中的技术词规范表兜底，例如 `prometheus → Prometheus`、`mysql → MySQL`、`github → GitHub`。

设置页新增：

- **Tag 大小写规范化**：默认开启，可关闭。
- **技术词规范表**：每行一个标准 Tag，可直接编辑并恢复默认。
- 原 **Tags 目录** 更名为 **本地 Tag 索引**，明确只在插件本地用于大小写匹配，绝不会发送给 AI。
- **整理已有 Tag 大小写冲突**：扫描白名单目录的 frontmatter tags，先预览 `Prometheus ×N / prometheus ×M → Prometheus`，再由用户点击执行统一；不调用 AI。为避免误改正文，只处理 frontmatter tags，不批量改写行内 `#tag`。

Tags / Summary+Tags Prompt 已移除整库 Tag 目录；当前文章自己的现有 tags 仍会作为该文章的小范围上下文发送。

---

---

## v0.5.0：识别任务范围保护 + 可停止

这一版重点修复文件夹识别运行期间整理目录时的竞态问题，并加入当前识别任务的停止按钮。

### 1. 每篇处理前重新检查当前路径

点击“识别 N”后，插件仍会先生成本轮待更新队列，但**不再盲信队列建立时的旧目录范围**。每准备处理一篇 Markdown 时，都会读取该 `TFile` 的当前路径并重新确认：

- 文件仍存在于 Vault 中；
- 文件当前路径仍属于最初点击识别的文件夹或其子文件夹。

如果任务运行期间文件被移出当前识别目录，会直接跳过：

```text
跳过：任务执行期间文件已移出当前识别目录
```

文件在所选目录内部改名或移动到其另一个子目录，仍允许继续处理。

此外，在 AI 返回后、真正写入 frontmatter 前还会再次校验目录范围。也就是说，即使当前文件是在 API 请求等待期间才被移出，也不会把本轮结果继续写入已移出范围的文件。

### 2. 文件夹识别增加“停止识别”按钮

开始识别后，原识别按钮旁会出现 **“停止识别”**：

- 点击后立即阻止后续 Markdown 继续进入处理；
- 如果正在等待请求间隔，会立即结束等待；
- 如果正在等待当前 API 响应，会主动中止该 HTTP 请求；
- 已经成功写入的文件保留结果，不回滚；
- 当前被中止的文件不会记作失败；
- 停止后重新统计当前文件夹真实剩余待更新数量。
- 如果识别过程中关闭了面板，再次打开“待更新笔记 / 文件夹识别”时，顶部仍会显示“停止当前识别”，不会因为关闭面板而失去停止入口。

停止后的结果面板会明确显示“最近同步（已停止）”以及成功 / 失败 / 跳过 / 剩余数量。

---

---

## v0.4.9：合并请求字段别名兼容

这一版修复“模型内容已经可用，但因为字段名不是插件首选名称而被误判失败并自动重试”的问题。

例如下面这种模型返回现在会直接接受：

```json
{
  "summary": "YOLO 模型部署需结合硬件与需求选择格式与版本。",
  "weighted_tags": [
    {"tag":"YOLOv8","weight":0.95},
    {"tag":"ONNX","weight":0.92},
    {"tag":"TensorRT","weight":0.90}
  ]
}
```

插件会在本地归一化为逻辑上的：

```json
{
  "summary": "...",
  "tags": [
    {"tag":"YOLOv8","weight":0.95}
  ]
}
```

当前兼容的合并字段别名：

- Summary：`summary`、`summary_text`、`summaryText`
- Tags：`tags`、`weighted_tags`、`weightedTags`、`tag_list`、`tagList`
- Tag 单项名称继续兼容：`value`、`tag`、`name`

独立 Tags 请求也同步支持上述 Tags 外层字段别名，并继续支持 v0.4.8 加入的顶层裸数组。

因此，字段别名能够确定语义时会**直接使用第一次返回，不触发结构化重试**。只有真正缺少可识别的 Summary/Tags、JSON 无法解析或结果完全不可用时，才进入原有修复/重试链路。

同时调整了合并 Prompt 的措辞：使用“带 weight 的 tags”描述任务，降低模型自行创造 `weighted_tags` 字段名的概率；标准输出仍首选 `summary` + `tags`。

---

---

## v0.4.8：兼容 Tags 顶层 JSON 数组

这一版修复某些 OpenAI-compatible / 本地模型虽然返回了合法 Tags JSON，却因为直接返回顶层数组而被插件误判为 JSON 解析失败的问题。

现在 Tags 请求同时接受：

```json
{"tags":[{"value":"QUIC","weight":0.9}]}
```

以及：

```json
[
  {"value":"QUIC","weight":0.9},
  {"value":"HTTP3","weight":0.85}
]
```

处理链路调整为：

```text
模型输出
  ↓
去除 ```json 代码围栏
  ↓
保留完整 JSON 根节点（对象 {} 或数组 []）
  ↓
严格 JSON.parse
  ├─ 对象且有 tags[] → 正常处理
  ├─ 顶层数组 []      → 自动包装为 { tags: [...] }，正常处理
  └─ 真正语法错误     → JSON 修复分支 → 必要时才自动重试 1 次
```

因此模型直接返回 `[ {...}, {...} ]` 时，不会再把外层 `[]` 截掉，也不会再产生 `Unexpected non-whitespace character after JSON` 这类由插件自身截断造成的错误，更不会因为这种可用结果白白请求第二次模型。

此外，若后端在 JSON 前后附带少量说明文字，解析器会尝试提取第一个完整的 JSON 根节点，并在字符串解析时正确避开引号内的括号。

---

---

## v0.4.7：Tags 数量改为“上限”，不足不再报错

这一版放宽 Tags 数量校验。`Tags 数量` 现在表示 **最多生成多少个标签**，不再表示“必须凑满多少个”。

例如默认上限为 7：

```text
返回 7 个合法 tag        → 写入 7 个
返回 6 个合法 tag        → 写入 6 个，不报错
返回 5 个，其中 2 个非法 → 本地过滤后写入 3 个，不报错
返回 10 个合法 tag       → 按 weight 排序，只保留前 7 个
过滤后 0 个合法 tag      → 仍判定失败，避免异常结果清空原有 tags
```

当前处理规则为：

1. AI 最多生成 `N` 个互不重复标签，Prompt 明确要求 **优先质量，不要为了凑数量生成泛化或低信息量标签**。
2. 插件本地继续执行合法性过滤、去重和 weight 排序。
3. 过滤后只要还剩至少 1 个合法标签，就按实际数量写入。
4. 少于 `N` 个不会触发“数量不足”错误，也不会仅因为没凑满而进行结构化输出重试。
5. `N` 仍然作为最终写入上限，模型返回更多时只保留前 `N` 个。

因此类似：

```text
上次错误：AI 返回的合法唯一 tags 不足 7 个（得到 6 个）
```

在 v0.4.7 中不会再因为“6/7”本身失败。

---

---

## v0.4.6：Obsidian 式文件夹树 + 文章内单字段生成

这一版主要调整手动文件夹操作和文章 Properties 里的 AI 按钮。

### 1. 手动文件夹改成 Obsidian 式展开树

“待更新笔记 / 文件夹识别”不再把每一级目录平铺成很多大卡片，而是按照真实目录层级显示：

```text
Notes
├─ Linux                         12 待更新     [识别 12]
│  ├─ FFmpeg                      4 待更新     [识别 4]
│  │  ├─ 编码.md
│  │  └─ 滤镜.md
│  └─ systemd                     3 待更新     [识别 3]
└─ Docker                         6 待更新     [识别 6]
```

- 点击文件夹名称或左侧箭头展开 / 折叠，交互接近 Obsidian 文件管理器。
- 子文件夹按父子关系嵌套，不再需要从一堆完整路径里寻找。
- 每个具体文件夹右侧都有 **“识别 N”** 按钮。
- 点击“识别”后，仍会递归处理该文件夹及其所有子文件夹中的待更新 Markdown。
- 根 `Notes` 只做总览，不提供一键处理全部，避免误操作。
- 顶部提供“展开待更新目录 / 全部折叠 / 重新统计”。
- 展开后仍可看到具体 Markdown、缺失字段、正文预览、错误和单篇重试。

### 2. 文章 Properties 中的 ✨ 永远只生成当前字段

现在在文章里：

- 点击 `summary` 旁的 ✨ → **只发送 Summary 请求，只写 summary**。
- 点击 `tags` 旁的 ✨ → **只发送 Tags 请求，只写 tags**。

即使“实验性：批量合并 Summary + Tags 请求”开启，文章里的这两个按钮也不会再顺带修改另一个字段。

### 3. 插件批量流程仍默认使用实验合并请求

实验合并开关的新安装默认值改为 **开启**。它继续用于：

- 文件夹“识别”；
- 自动更新；
- 明确执行“同时生成 summary + tags”的命令。

因此批量处理一篇笔记时默认仍是 **1 次请求同时得到 summary + tags**；关闭实验合并后才会退回两次串行请求。文章 Properties 的单字段按钮不受这个开关影响。

---

---

## v0.4.5：结构化 JSON 容错与失败诊断

这一版针对批量同步中偶发的 `JSON.parse` 失败增加三层容错：

1. **结构化 JSON 模式（默认开启）**：Tags 和实验合并请求会在 OpenAI-compatible `/v1/chat/completions` 中发送 `response_format: {"type":"json_object"}`。如果中间代理不支持，可以在设置中关闭。
2. **JSON 修复分支（默认开启，可关闭）**：严格 `JSON.parse` 失败后，只做保守的本地语法修复，例如数组对象之间缺少逗号、尾随逗号、JSON 字符串中的未转义换行；修复逻辑不会主动改写标签或摘要语义。
3. **结构化输出自动重试 1 次（固定）**：只有 JSON 解析、summary 字段或 tags 数量/合法性校验失败时才会重新请求一次；网络错误、HTTP 错误和超时不走这个自动重试分支。

处理链路变为：

```text
模型请求
  ↓
JSON mode
  ↓
严格 JSON.parse
  ├─ 成功 → 本地字段/标签校验 → 写入
  └─ 失败 →（JSON 修复开关开启时）本地保守修复 → 再 parse
                                  ├─ 成功 → 校验 → 写入
                                  └─ 仍失败 → 自动重新请求 1 次
                                                    ↓
                                               最终失败才标红
```

最终仍失败时，待更新面板会保存并提供 **“查看模型原始输出”**，并提供 **“重试此笔记”** 按钮。最多保留约 16 KB 原始输出用于诊断。

### 空正文不再算红色失败

只有 YAML/frontmatter、或去掉 frontmatter 后没有可分析正文的 Markdown，会显示为黄色 **“无正文”**，归类为“跳过”，不计入失败。默认非指纹模式下，后续只要 Summary/Tags 对应字段仍为空，就会继续作为待补全项；开启 fingerprint 后则按内容指纹判断是否过期。

---

## v0.4.4：按文件夹查看并同步待更新 Markdown

这版移除了 v0.4.3 的 **自定义批数 / 处理本批 / 处理全部待更新** 手动入口，改为一个统一的 **待更新笔记面板**。

### 待更新笔记面板

设置页点击 **“查看待更新”**，或命令面板运行 `打开待更新元数据笔记面板`。面板会实际扫描 `/Notes` 白名单中的 Markdown，并显示：

- 总 Markdown 数、待更新数、已完成数。
- 哪些具体文件夹还有待更新内容。
- 每个文件夹的 **待更新 Markdown 数 / Markdown 总数**。父文件夹统计递归包含子文件夹。
- 每篇待更新 `.md` 的文件名、完整路径、当前缺少更新的字段（Summary / Tags）。
- 每篇 Markdown 的简短正文预览；点击文件名可直接在 Obsidian 打开该笔记。
- 上次失败原因（如果该文件最近一次生成失败）。

### 按文件夹同步

每个存在待更新内容的文件夹都有：

`同步此文件夹（N）`

点击后插件会：

1. 重新确认这个文件夹及其所有子文件夹里的待更新 Markdown。
2. 不再要求输入批数，自动处理该文件夹当前全部待更新文章。
3. 继续复用全局 API 串行队列和现有请求间隔，一篇一篇慢慢处理，不并发轰 API。
4. 实验合并开启时，每篇 `summary + tags` 只占 1 次请求；关闭时仍是 2 次。
5. 同步完成后面板会列出 **成功的具体文件路径、失败的具体文件路径和错误、跳过数量、剩余数量**，然后自动重新统计。

因此手动更新不再是“我点了三次但不知道处理了谁”，而是：

```text
查看待更新
  ↓
选择 Notes/Linux
  ↓
看到 FFmpeg.md / systemd.md / Nginx.md ...
  ↓
同步此文件夹
  ↓
逐篇串行处理
  ↓
显示成功 / 失败的具体 Markdown
```

定时 **自动触发更新** 功能仍然保留；这里只替换了手动消化大量新笔记的交互。

---

## v0.4.3：固定数量、技术优先标签（历史行为）

- v0.4.3 当时默认 `Tags 数量 = 7`，并把数量作为固定目标，要求模型返回指定数量的合法、唯一、带 weight 标签。
- 本地合法性 validator 作为最后防线；非法标签过滤、重复标签去重。
- `weight` 优先衡量 **技术专有性 + 检索区分度**：具体软件/工具/框架/库/API/协议/算法/数据结构优先于泛化动作词。
- 例如：`FFmpeg≈0.98 > 视频转码≈0.72 > 格式转换≈0.45`。
- 标签目录复用频率只是同等质量时的次级因素。
- **该“必须凑满 N 个”的行为已在 v0.4.7 取消；当前 N 仅表示上限。**

---

## v0.4.2：标签合法性双层防线

- 新增固定的 **Tag Value Safety Harness**：只允许中文汉字、英文字母、数字、`_`、`-`，且禁止纯数字标签；禁止空格、`/`、`#`、`+`、`.`、括号及其他标点/特殊字符。
- 技术名词包含非法字符时要求 AI 改写为语义等价合法标签，例如 `B+树 → BPlus树`、`C++ → CPlusPlus`、`C# → CSharp`、`.NET → DotNet`、`Node.js → NodeJS`。
- 新增不可绕过的本地 `isValidTagValue()` 硬校验：即使模型无视 Harness，非法候选也会在写入 Obsidian 前直接丢弃。
- 本地顺序变为：**解析 → value 规范化 → 合法性过滤 → 去重 → weight 排序 → Top N → 写入**。
- v0.4.2 当时会生成至少 12 个候选；从 v0.4.3 起改为直接生成目标标签；v0.4.7 起 N 改为上限，不再要求凑满。
- Tags 目录重建时同样过滤非法 value。自 v0.5.1 起该目录仅作为本地 Tag 索引，不再放进 Prompt。
- Tag Value Safety Harness 属于机器输出安全协议，即使关闭可编辑 Tags Harness 也仍然生效；设置页可直接查看固定规则，本地 validator 始终生效。

---

## v0.4.1：修复 Properties 图标的实验合并行为（历史行为）

> 此处记录 v0.4.1 当时的行为；从 v0.4.6 起，Properties 中的 `summary` / `tags` 按钮已恢复为各自单字段请求。

- 开启“实验性：合并 Summary + Tags 请求”后，在笔记 Properties 中点击 `summary` 或 `tags` 旁的任意一个 ✨ 图标，都会进入合并路径。
- 一次 `/chat/completions` 同时生成并原子写入 `summary + tags`，两个图标会一起显示 loading / success / error 状态。
- 关闭实验开关时，两个图标仍分别只更新自己的字段。
- 命令面板中的单字段命令仍保持原行为；只有 Properties 图标在实验模式下被提升为“双字段刷新”。

---

## v0.4.0：实验性合并请求

新增设置：**实验性：合并 Summary + Tags 请求**。

默认关闭，以保留 v0.3.0 的稳定行为。开启后：

- “为当前 Notes 笔记生成摘要和标签” 命令只发送 **1 次** `/chat/completions` 请求。
- 自动更新同一篇笔记的 `summary + tags` 也只发送 **1 次**请求。
- 当时正文、标题、现有 tags、Tags 目录等上下文只发送一次；自 v0.5.1 起整库 Tags 目录已完全移出 Prompt，只保留当前文章自己的现有 tags。
- 模型必须在一次回复中严格返回：

```json
{
  "summary": "摘要文本",
  "tags": [
    { "value": "标签", "weight": 0.9 }
  ]
}
```

- 插件会把两个逻辑结果拆开校验：
  - `summary`：去除包裹引号、判空、按 `Summary 最大字符` 截断。
  - `tags`：规范化 value、按 weight 排序、同名去重、只保留前 N 个。
- 只有 summary 和 tags 都解析成功，并且 AI 生成期间笔记正文没有变化，才会一次性写回 Properties。
- 如果模型没有遵守合并 JSON 协议，本次更新直接失败，不写入半成品。
- v0.4.1～v0.4.5 曾让 Properties 的任意一个 ✨ 在实验模式下同时刷新两个字段；**从 v0.4.6 起已改为 Summary / Tags 各自只生成自己的字段**。

### 为什么标成实验性

合并能减少请求次数和重复上下文，但它要求模型在一次输出里同时满足摘要约束、标签约束和严格 JSON 结构。对于结构化输出能力较弱的模型/代理，双请求模式通常更稳。因此保留开关可以随时回退做 A/B 对照。

## 两种时序

### 稳定模式：开关关闭

```text
发现待更新笔记
    ↓
Summary API
    ↓
等待全局请求间隔
    ↓
Tags API
    ↓
两个结果均成功
    ↓
确认正文未变化
    ↓
一次性写入 summary + tags
```

同一篇笔记：**2 次请求**。

### 实验合并模式：开关开启

```text
发现待更新笔记
    ↓
Combined Metadata API
    ├─ summary
    └─ weighted tags
    ↓
解析并分别校验两个字段
    ↓
确认正文未变化
    ↓
一次性写入 summary + tags
```

同一篇笔记：**1 次请求**。

> 全局 API 队列仍然有效。合并只减少“同一篇笔记 summary + tags”的请求数，不会让不同笔记并发请求。

## Harness

插件仍保留两个可独立开关和编辑的 Harness：

- Summary Harness
- Tags Harness

实验合并模式开启时，两套 Harness 会同时放入同一个 system message，并使用 `[Summary Harness]` / `[Tags Harness]` 分区；最终输出协议则统一由插件强制要求为一个 JSON 对象。

这意味着：**Harness 负责语义约束，JSON 协议负责机器可解析结构。** 即使关闭某个 Harness，对应字段的最小结构协议仍然保留。

## 其他既有功能

- 仅根目录 `/Notes` 及其子目录中的 Markdown 显示 `summary` / `tags` 右侧 ✨ AI 按钮。
- `tags` 默认最多 7 个（可在“Tags 数量”中修改上限）；少于上限也正常写入。
- AI 返回带 weight 的候选，插件本地排序、归一化、去重后写入 value。
- 扫描白名单 Markdown 的 frontmatter tags 和行内 `#tags`，维护仅供本地大小写匹配使用的 Tag 索引；该索引不会发送给 AI。
- 默认识别方式改为 **Properties 内容存在性**：`summary` 非空即视为 Summary 已完成，`tags` 非空即视为 Tags 已完成；正文后续变化不会自动令它们过期。
- 可选开启 **内容指纹 fingerprint 识别**：开启后才持久化正文源指纹并按内容变化判断 Summary/Tags 是否需要更新；关闭时数据库中的指纹字段会被删除。
- 全局 API 串行队列，默认请求间隔 30 秒。
- 单次 API 硬超时默认 180 秒，可主动销毁 HTTP/HTTPS 请求。
- 自动更新倒计时从整轮任务真正完成后开始。
- 底部状态栏显示当前请求阶段、等待倒计时、写入阶段、自动更新倒计时和实验合并开关状态。
- 插件卸载/Obsidian 关闭时销毁当前 HTTP 请求，并阻止失效结果继续写入笔记。

## 设置中可见参数

- Base URL
- API Key
- Model
- API 请求超时（秒）
- API 请求间隔（秒）
- **实验性：合并 Summary + Tags 请求**
- **内容指纹 fingerprint 识别（默认关闭）**
- **Summary 输入 Markdown 清理（默认关闭）**
- 白名单目录
- Tags 数量
- Tag 大小写规范化
- 技术词规范表
- 本地 Tag 索引 / 重新扫描
- 整理已有 Tag 大小写冲突
- 显示 AI 状态
- 自动触发更新
- 自动更新频率（分钟）
- Summary Harness / Tags Harness
- Summary 最大字符

## 安装

插件目录使用 `00_xyblue135-` 前缀：

```text
<Vault>/.obsidian/plugins/00_xyblue135-ai-metadata-demo/
```

至少包含：

```text
manifest.json
main.js
styles.css
```

然后：

```text
设置 -> 第三方插件 -> xyblue135 · AI 元数据 -> 启用
```

`manifest.json` 中的插件 ID 也已同步改为：

```text
00_xyblue135-ai-metadata-demo
```

本仓库为公开仓库，`data.json` 可能保存 API Key 等本地敏感配置，请勿提交进仓库；发布 / 升级包也不携带 `data.json`，覆盖安装时保留你自己的本地配置。

## API

正常生成：

```text
POST {Base URL}/chat/completions
```

“测试 API”按钮：

```text
GET  {Base URL}/models
POST {Base URL}/chat/completions
```

为了实现真正可中断的硬超时与关闭时取消请求，插件使用 Obsidian Desktop 环境的 Node.js `http` / `https`，因此 manifest 标记为 Desktop Only。

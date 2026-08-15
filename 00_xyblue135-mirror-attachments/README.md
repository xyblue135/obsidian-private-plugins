# xyblue135 私人 · 附件镜像

> 当前版本：**v2.0.1**  
> 插件 ID：`00_xyblue135-mirror-attachments`  
> 当前附件根目录：`z_attachments`

这是一个用于 Obsidian 的附件管理插件。v2.x 已经从早期的“Notes 与附件目录树完全镜像”改为“**一个 Markdown 文件名对应一个单层共享附件目录**”。

插件 ID 保持不变，升级时可以继续覆盖原插件目录。升级包不携带 `data.json`，避免覆盖本地设置和插件垃圾桶历史。

---

## 1. v2.x 当前目录结构

假设笔记为：

```text
Notes/A/test.md
Notes/B/test.md
Notes/Linux/docker.md
```

附件目录为：

```text
z_attachments/
├─ test/
└─ docker/
```

其中：

```text
Notes/A/test.md ─┐
                 ├─> z_attachments/test/
Notes/B/test.md ─┘
```

不同父目录下的同名 Markdown 明确共享同一个附件目录。

因此附件目录只保留一层“文章名”目录，不再复制 Notes 的父目录结构。

---

## 2. 为什么取消旧镜像结构

v1.x 使用：

```text
Notes/A/B/文章.md
Attachments/A/B/文章/
```

这种结构的问题是 Notes 目录树与 Attachments 目录树高度耦合。

例如：

```text
Notes -> Note1
```

或者：

```text
Notes/Linux/Docker/
-> Notes/运维/容器/
```

都会触发大量 Markdown rename / move 事件，旧版必须同步搬迁整棵附件树。一旦目录事件判断错误，影响范围会被放大。

v2.x 改为：

```text
Notes/任意目录/文章.md
z_attachments/文章/
```

因此：

- Markdown 只移动父目录：附件不动。
- Notes 根目录改名：附件不动。
- Notes 子目录批量整理：附件不动。
- 不同目录创建同名 Markdown：共享附件目录。
- 删除共享笔记：根据剩余同名 Markdown 数量决定是否回收附件。

目录结构与附件结构已经从架构层面解耦。

---

## 3. 同名 Markdown 与共享附件

例如：

```text
Notes/A/test.md
Notes/B/test.md
Notes/C/test.md
```

三篇笔记全部共享：

```text
z_attachments/test/
```

插件不会为它们创建三份附件目录。

创建新的同名 Markdown 时会提示：

```text
检测到同名笔记「test」
不会重复创建附件目录，将共享：z_attachments/test/
```

这不是冲突，而是 v2.x 的正式共享规则。

### 设置页同名检查

设置页提供“同名 Markdown 检查”，可以查看：

- 哪些文件名存在重复。
- 当前共有几篇同名 Markdown。
- 每一篇 Markdown 的完整路径。
- 它们共同使用哪个 `z_attachments/<文件名>/` 目录。

插件不会依赖一个长期保存、容易过期的“文章路径 → 附件路径”数据库。

共享关系以当前 Vault 中实际存在的 Markdown 为准，每次需要判断时实时扫描。

---

## 4. 删除规则：最后引用才回收

例如：

```text
Notes/A/test.md
Notes/B/test.md
Notes/C/test.md
```

全部共享：

```text
z_attachments/test/
```

删除行为：

```text
删除 A/test.md
-> 仍有 2 篇 test.md
-> z_attachments/test/ 不动

删除 B/test.md
-> 仍有 1 篇 test.md
-> z_attachments/test/ 不动

删除 C/test.md
-> 已无 test.md
-> z_attachments/test/ 才进入插件垃圾桶
```

也就是说：

> **附件属于“同名 Markdown 共享组”，而不是属于某一个具体父目录下的 Markdown。**

只要还有一个同名 Markdown 存在，共享附件就不会被删除。

---

## 5. 插件垃圾桶

最后一个同名 Markdown 被真正删除后，对应附件目录不会直接永久删除，而是移动到：

```text
z_attachments/_MirrorAttachmentsTrash/
```

插件同时在 `data.json` 中保存恢复记录，包括原路径、垃圾桶路径、时间和原因等信息。

设置页支持：

- 刷新垃圾桶记录。
- 单项恢复。
- 恢复全部。

### 恢复安全原则

如果原路径已经存在文件或目录：

```text
z_attachments/test/
```

插件拒绝覆盖。

不会自动：

- 覆盖已有附件。
- 合并两个目录。
- 删除目标目录。
- 猜测哪个文件应该保留。

冲突需要人工确认。

---

## 6. 重命名规则

### 6.1 只移动父目录

```text
Notes/A/test.md
-> Notes/B/test.md
```

文件名仍然是 `test.md`，所以附件始终是：

```text
z_attachments/test/
```

不执行任何附件搬迁。

### 6.2 唯一文章改名

如果 Vault 中只有一篇：

```text
test.md
```

现在改名：

```text
test.md -> demo.md
```

且不存在：

```text
z_attachments/demo/
```

插件可以安全地把：

```text
z_attachments/test/
-> z_attachments/demo/
```

重命名优先通过 Obsidian `FileManager` 完成，让 Obsidian 有机会同步 Vault 内已有链接。

### 6.3 旧名字仍有其他共享文章

如果：

```text
Notes/A/test.md
Notes/B/test.md
```

A 被改名为：

```text
Notes/A/demo.md
```

此时 B 仍然需要：

```text
z_attachments/test/
```

所以插件绝不会把 `test/` 搬走。

A 会使用：

```text
z_attachments/demo/
```

### 6.4 新名字已经存在附件目录

如果目标已经存在：

```text
z_attachments/demo/
```

插件不会自动把：

```text
z_attachments/test/
```

与它合并。

原因是插件无法可靠判断两个目录里的同名文件、历史附件和正文引用应该如何合并。

安全原则始终是：**不自动覆盖、不自动合并。**

---

## 7. 附件导入与命名规则

插件接管从系统文件管理器进行的：

- `Ctrl+V` 文件粘贴。
- 文件拖入。

当前 Markdown 为：

```text
Notes/A/test.md
```

附件统一保存到：

```text
z_attachments/test/
```

### 7.1 图片和 PDF

图片与 PDF 属于可直接嵌入正文的资源，使用毫秒级时间戳：

```text
z_attachments/test/20260815143000123.png
z_attachments/test/20260815143000124.pdf
```

Markdown：

```md
![](/z_attachments/test/20260815143000123.png)
![](/z_attachments/test/20260815143000124.pdf)
```

支持的图片类型包括：

```text
PNG / JPG / JPEG / GIF / WebP / BMP / SVG / AVIF
```

### 7.2 ZIP、Office 和普通附件

非嵌入式附件保留原始可读文件名：

```text
z_attachments/test/项目源码.zip
z_attachments/test/毕业论文.docx
z_attachments/test/实验数据.xlsx
```

Markdown：

```md
[项目源码.zip](/z_attachments/test/项目源码.zip)
[毕业论文.docx](/z_attachments/test/毕业论文.docx)
[实验数据.xlsx](/z_attachments/test/实验数据.xlsx)
```

### 7.3 普通附件重名

不覆盖旧文件，自动追加：

```text
项目源码.zip
项目源码 (1).zip
项目源码 (2).zip
```

### 7.4 文件名安全处理

普通附件尽量保留原文件名，只清理明显不安全内容：

- Windows 非法字符：`\ / : * ? " < > |`
- ASCII 控制字符。
- 文件名结尾的句点和空格。
- `CON`、`PRN`、`AUX`、`NUL`、`COM1`～`COM9`、`LPT1`～`LPT9` 等 Windows 保留设备名。

中文、正常空格、括号等尽量原样保留。

例如：

```text
项目:最终版?.zip
-> 项目-最终版-.zip
```

### 7.5 批量导入

一次导入多个附件时：

- Markdown 链接之间自动留一个空行。
- 单个文件失败不会中断整批任务。
- 成功、失败、自动重名都会给出提示。

---

## 8. Windows 文件复制兼容

Windows 文件资源管理器复制 ZIP、Office、PDF 等文件后，Electron 某些情况下不会稳定地把文件放入 `clipboardData.files`。

插件同时读取：

```text
clipboardData.files
clipboardData.items
```

并自动去重。

因此从 Windows：

```text
Ctrl+C 文件
-> Obsidian
-> Ctrl+V
```

ZIP、Office、PDF 和图片都可以被统一处理。

---

## 9. 结构校验

设置页会扫描：

- 当前受管理 Markdown 数量。
- 实际需要的共享附件目录数量。
- 缺失的共享附件目录。
- 同名 Markdown 共享组。
- 路径冲突。
- `z_attachments` 根目录下没有对应当前 Markdown 的孤立目录。

### “补建缺失目录”只创建，不删除

自动操作仅负责补建：

```text
z_attachments/<Markdown 文件名>/
```

不会自动删除孤立目录。

因为孤立目录可能是：

- v1.x 镜像结构迁移后的历史数据。
- 用户手工恢复的数据。
- 正文仍在引用的旧附件。
- 临时保留的数据。

这项规则是 v2.x 的重要安全策略。

---

## 10. 文件树快捷操作

左侧文件树右键 Markdown：

```text
📂 打开对应附件目录
```

可以直接定位到：

```text
z_attachments/<当前 Markdown 文件名>/
```

---

## 11. v2.0.1 的 `z_attachments` 迁移规则

v2.0.0 曾使用默认根目录：

```text
attachment/
```

从 v2.0.1 开始统一改为：

```text
z_attachments/
```

之所以使用 `z_` 前缀，是为了让附件目录在 Vault 根目录的普通字母排序中更靠后，和笔记、配置等主要目录自然分开。

### 从 v2.0.0 自动升级

如果 `data.json` 中记录的是：

```text
attachmentsRoot = attachment
```

插件会进行安全检查。

#### 情况 A：只有旧 `attachment/`

且不存在：

```text
z_attachments/
```

插件会通过 Obsidian FileManager 整体改名：

```text
attachment/
-> z_attachments/
```

随后把插件配置更新为 `z_attachments`。

#### 情况 B：旧目录不存在

直接把设置更新为：

```text
z_attachments
```

#### 情况 C：`attachment/` 与 `z_attachments/` 同时存在

插件**停止自动迁移**。

不会：

- 自动合并。
- 覆盖。
- 删除其中一边。

插件会提示用户先人工确认数据。

### v1.x 的 `Attachments/` 不自动迁移

旧镜像目录例如：

```text
Attachments/Linux/Docker/test/
```

仍然不会自动搬入：

```text
z_attachments/test/
```

因为不同父目录下可能存在多个同名 Markdown，自动把多个历史目录合并到一个共享目录风险太高。

旧 v1.x 数据应人工确认后再迁移。

---

# 完整更新日志

> 以下只记录目前已有源码/README 能确认的版本变化；没有可靠记录的版本不会补写或猜测。

## v2.0.1 — `z_attachments` 命名与文档维护

- 默认附件根目录从 `attachment` 改为 `z_attachments`。
- 所有插件 UI 示例、Markdown 示例、默认值、回退值与 manifest 描述统一改为 `z_attachments`。
- 新增 v2.0.0 `attachment -> z_attachments` 安全迁移：仅在无冲突时自动整体改名。
- 当 `attachment` 与 `z_attachments` 同时存在时停止自动迁移，不合并、不覆盖、不删除。
- 保持 v1.x `Attachments/...` 历史镜像目录不自动迁移。
- README 重新整理为长期维护文档，恢复并保留完整的已知版本更新历史。

## v2.0.0 — 单层共享附件架构

- 废弃 `Notes/... -> Attachments/...` 的完整父目录镜像模式。
- 新架构改为一层文章附件目录：当时默认使用 `attachment/<Markdown 文件名>/`。
- 不同目录下文件名完全相同的 Markdown 明确共享同一个附件目录。
- 新增实时同名引用统计，不依赖容易过期的持久化“文章路径映射表”。
- 删除 Markdown 时，只有最后一个同名 Markdown 消失才回收共享附件目录。
- 新增“同名 Markdown 检查”UI：显示共享组数量、每篇完整路径和共享附件路径。
- Markdown 只移动父目录时不再搬附件。
- Notes 根目录或父目录重命名不再触发附件树迁移。
- Markdown 文件名改变时按照共享引用情况决定是否允许附件目录改名。
- 新名字已经存在附件目录时禁止自动合并和覆盖。
- 结构校验的自动操作收紧为“只补建缺失目录”，孤立目录仅报告、不自动删除。
- 删除 v1.7.0 临时加入的“扫描旧 Obsidian `.trash` 抢救”功能。
- 保留插件自己的可恢复垃圾桶。

## v1.7.0 — 根目录误删事故紧急安全修复

- 修复严重问题：`Notes` / `Note` 根目录重命名或 Markdown 移出管理范围时，不再自动删除对应附件目录。
- 真正删除 Markdown 时，对应附件改为进入插件垃圾桶 `Attachments/_MirrorAttachmentsTrash/`。
- 在 `data.json` 中记录插件垃圾桶原路径和恢复信息。
- 设置页新增插件垃圾桶：支持逐项恢复、恢复全部。
- 恢复目标已经存在内容时拒绝覆盖。
- 临时新增“扫描并恢复旧 `.trash`”，用于抢救 v1.6.6 已发生的误删事故。
- 旧自动纠错中的多余目录也改为进入插件垃圾桶，而不是直接交给系统/Obsidian 回收站。
- 新增“删除文章时同步回收附件”开关。

> v1.7.0 中的旧 `.trash` 抢救入口属于事故过渡功能，已在 v2.0.0 移除；插件自己的垃圾桶恢复功能继续保留。

## v1.6.6 — 智能附件命名 + 批量导入优化

- 命名策略升级为“智能命名”。
- 图片与 PDF 等嵌入式资源继续使用毫秒级时间戳。
- ZIP、RAR、7Z、Office 和其他普通附件改为保留原文件名。
- 普通附件重名自动追加 `(1)`、`(2)`……，不覆盖旧文件。
- 普通附件增加文件名安全清理：Windows 非法字符、ASCII 控制字符、末尾句点/空格、Windows 保留设备名。
- 中文、空格、括号等可读字符尽量保留。
- 普通附件 Markdown 显示完整文件名和扩展名。
- 一次粘贴多个附件时，Markdown 链接之间自动增加空行。
- 单文件导入失败不再中断整批导入。
- 增加目标目录失败、单文件失败、重名改名和批量成功提示。
- 设置页同步更新为“时间戳嵌入资源 / 原名普通附件”的双策略说明。

## v1.6.5 — Markdown 插入规则整理

- 明确图片与 PDF 使用 `![]()` 直接嵌入。
- ZIP、RAR、7Z、DOCX、XLSX、PPTX 等普通附件使用 `[]()`。
- 设置页重新分为：存储结构、导入行为、Markdown 插入规则、目录一致性、快捷操作。
- 设置页新增规则卡片、版本徽标和说明提示。
- 延续 v1.6.4 的 Windows 文件粘贴兼容修复。

## v1.6.4 — Windows 文件粘贴兼容

- 修复 Windows 文件资源管理器复制 ZIP、Office、PDF 等普通文件后，部分 Electron 环境无法生成链接的问题。
- 粘贴和拖入统一同时读取 `DataTransfer.files` 与 `DataTransfer.items`。
- 对两个入口获得的文件进行去重。

## v1.6.2 — 文件树快捷入口

- 文件树右键 Markdown 可以直接打开对应附件目录。

## v1.6.1 — Vault 根路径链接

- Markdown 附件链接改为 Vault 根目录绝对路径。
- 图片 alt 固定为空。

## v1.6.0 — 毫秒时间戳命名

- 附件统一使用毫秒级纯时间戳命名。
- 从 v1.6.6 开始，该策略仅保留给图片与 PDF 等嵌入式资源。

---

## 12. 历史架构说明

### v1.x

```text
Notes/A/B/文章.md
↕
Attachments/A/B/文章/
```

特点：

- 一篇 Markdown 对应一个镜像附件目录。
- Markdown 移动或父目录改名时需要搬迁附件树。
- 删除 Markdown 时旧版会同步处理对应附件目录。

### v2.0.0

```text
Notes/任意目录/文章.md
attachment/文章/
```

特点：

- 父目录完全解耦。
- 同名 Markdown 共享附件。
- 最后引用删除才回收附件。

### v2.0.1+

```text
Notes/任意目录/文章.md
z_attachments/文章/
```

当前正式结构。

---

## 13. 推荐配置

```text
笔记根目录：Notes
附件根目录：z_attachments
```

最终示例：

```text
Vault/
├─ Notes/
│  ├─ Linux/
│  │  └─ test.md
│  └─ Windows/
│     └─ test.md
│
└─ z_attachments/
   ├─ test/
   │  ├─ 20260815143000123.png
   │  └─ 项目源码.zip
   │
   └─ _MirrorAttachmentsTrash/
```

两篇 `test.md` 共享 `z_attachments/test/`。

---

## 14. 安装与升级

插件目录：

```text
<Vault>/.obsidian/plugins/00_xyblue135-mirror-attachments/
```

至少包含：

```text
manifest.json
main.js
styles.css
README.md
```

然后：

```text
Obsidian
-> 设置
-> 第三方插件
-> 启用 xyblue135 私人 · 附件镜像
```

### 覆盖升级注意事项

升级包不包含 `data.json`。

如果当前插件目录已经存在：

```text
data.json
```

请保留它。

`data.json` 中可能包含：

- 笔记根目录设置。
- 附件根目录设置。
- 粘贴/拖入开关。
- 删除保护设置。
- 插件垃圾桶恢复历史。

不要为了升级插件而主动删除 `data.json`。

---

## 15. 当前安全原则

v2.x 的核心原则：

1. **父目录 rename 不删除附件。**
2. **Notes 根目录 rename 不删除附件。**
3. **同名 Markdown 明确共享附件。**
4. **最后一个共享引用消失才允许回收附件。**
5. **删除进入插件自己的可恢复垃圾桶。**
6. **恢复时绝不覆盖现有数据。**
7. **结构校验只补建，不自动清理孤立附件。**
8. **两个附件目录存在冲突时不自动合并。**
9. **旧镜像结构不进行危险的批量自动迁移。**

目标不是让插件“尽可能自动处理”，而是在附件数据安全的前提下减少人工管理。

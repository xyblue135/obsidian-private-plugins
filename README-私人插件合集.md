# xyblue135 开源 Obsidian 插件合集

本仓库中的插件均已统一标注为 **xyblue135 开源插件**，主要调整插件显示名、描述、设置页标题、命令名称、通知/控制台前缀、README 与源码文件头说明。

## 兼容原则

- **不修改内部插件 ID**：避免 Obsidian 将插件识别为全新插件。
- **不清空或重建 data.json**：原有设置、AI Metadata 数据库记录等全部保留。
- **不改核心业务逻辑**：本次只做命名、标识和中文友好化。
- 技术字段如 `summary`、`tags`、`char_count`、`token_count`、API、JSON、Markdown 会保留英文关键字，便于配置、排错和维护。

## 插件显示名

| 内部 ID | 显示名 |
|---|---|
| `00_xyblue135-notes-status` | xyblue135 · 笔记状态 |
| `00_xyblue135-local-image-hover-zoom` | xyblue135 · 图片缩放与相框 |
| `00_xyblue135-folder-template-note` | xyblue135 · 文件夹模板笔记 |
| `00_xyblue135-mirror-attachments` | xyblue135 · 附件镜像 |
| `00_xyblue135-ai-metadata-demo` | xyblue135 · AI 元数据 |
| `00_xyblue135-code-block-wrap` | xyblue135 · 代码块增强 |
| `00_xyblue135-char-count-updater` | xyblue135 · 字数与 Token 统计 |

> 安装或覆盖时，建议继续使用原有插件目录名（含 `00_` 排序前缀），这样原配置和已有记录最稳妥。

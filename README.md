# xyblue135 开源 Obsidian 插件合集

Obsidian 插件状态快照与维护记录仓库（开源）。

本仓库对 `.obsidian/plugins` 整个目录（自建 `xyblue135-*` 开源插件 + 第三方插件）做统一版本化，
用于**快照 / 回溯 Obsidian 插件状态**。仓库本身公开托管、可自由查看与复用；
这些自建插件属于开放源代码，只是未提交至 Obsidian 官方社区插件商店。

## 安全说明

本仓库跟踪了部分插件的 `data.json` 配置文件。其中涉及的 API 地址均为**内网（局域网 / 家庭实验室）地址**，
不对外网暴露、外部网络不可达，因此不存在凭据外泄风险，可放心公开。

⚠️ 若你自行部署后修改了这些内部地址、或填入了公网可达的真实凭据，请自行负责其安全性。
同时请勿将含 API Key 的 `data.json` 提交进公开仓库。

## 结构

- 根目录即 Obsidian 的插件目录：每个子文件夹是一个插件（含 `manifest.json` / `main.js` / `styles.css` / 配置）。
- `docs/<plugin-id>/MAINTENANCE.md`：各插件的维护记录（版本、快照日期、还原指引）。
- `plugin/<plugin-id>` 分支：每个插件的独立维护线。

## 还原方法

1. 克隆或下载本仓库压缩包（Release 里的 `obsidian-plugins-*.zip`）。
2. 将压缩包内容解压覆盖到你的 `Vault/.obsidian/plugins/` 目录（**先备份原目录**）。
3. 在 Obsidian 设置 → 社区插件中启用对应插件。
4. 启用列表另存于 `.obsidian/community-plugins.json`，整库恢复时需一并保留。

## 自动打包

打 `v*` 标签会触发 GitHub Actions，把整个插件目录打包成 `obsidian-plugins-<tag>.zip` 作为 Release 还原点。


# xyblue135 开源 Obsidian 插件合集
本仓库中的插件均已统一标注为 xyblue135 开源插件，主要调整插件显示名、描述、设置页标题、命令名称、通知/控制台前缀、README 与源码文件头说明。

兼容原则
不修改内部插件 ID：避免 Obsidian 将插件识别为全新插件。
不清空或重建 data.json：原有设置、AI Metadata 数据库记录等全部保留。
不改核心业务逻辑：本次只做命名、标识和中文友好化。
技术字段如 summary、tags、char_count、token_count、API、JSON、Markdown 会保留英文关键字，便于配置、排错和维护。
插件显示名
内部 ID	显示名
00_xyblue135-notes-status	xyblue135 · 笔记状态
00_xyblue135-local-image-hover-zoom	xyblue135 · 图片缩放与相框
00_xyblue135-folder-template-note	xyblue135 · 文件夹模板笔记
00_xyblue135-mirror-attachments	xyblue135 · 附件镜像
00_xyblue135-ai-metadata-demo	xyblue135 · AI 元数据
00_xyblue135-code-block-wrap	xyblue135 · 代码块增强
00_xyblue135-char-count-updater	xyblue135 · 字数与 Token 统计
安装或覆盖时，建议继续使用原有插件目录名（含 00_ 排序前缀），这样原配置和已有记录最稳妥。
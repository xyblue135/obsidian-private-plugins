# obsidian-private-plugins

Obsidian 插件状态快照与维护记录仓库。

本仓库对 `.obsidian/plugins` 整个目录（自建 `xyblue135-*` 插件 + 第三方插件）做统一版本化，
用于**快照 / 回溯 Obsidian 插件状态**，不发布到社区插件市场。

## 安全说明

本仓库跟踪了部分插件的 `data.json` 配置文件。其中涉及的 API 地址均为**内网（局域网 / 家庭实验室）地址**，
不对外网暴露、外部网络不可达，因此不存在凭据外泄风险，可放心公开。

⚠️ 若你自行部署后修改了这些内部地址、或填入了公网可达的真实凭据，请自行负责其安全性。

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

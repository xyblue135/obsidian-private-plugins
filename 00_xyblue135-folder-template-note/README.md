# xyblue135 · 文件夹模板笔记

> **开源插件**：xyblue135 维护的开放源代码插件，仓库公开、可自由查看与复用。
> **兼容原则**：插件 ID 保持 `00_xyblue135-folder-template-note`，升级包不携带 `data.json`，覆盖安装时保留用户本地配置与历史状态。

维护者：**xyblue135**

---

## 功能

- 在文件树中右键文件夹，快速创建模板笔记。
- 菜单图标支持 Emoji / Unicode 自定义。
- 模板支持 `{{folder}}`、`{{filename}}`、`{{path}}`、`{{datetime}}`、`{{date}}`、`{{time}}`、`{{timestamp}}` 等变量。
- 设置页可直接编辑并保存默认 YAML 元数据模板。
- 不依赖 Templater。

## 安装

保持插件目录名 `00_xyblue135-folder-template-note`，复制到 Vault 的 `.obsidian/plugins/` 下后，在第三方插件中启用 **xyblue135 · 文件夹模板笔记**。

升级覆盖时保留当前插件目录中的 `data.json`，不要提交到公开仓库。

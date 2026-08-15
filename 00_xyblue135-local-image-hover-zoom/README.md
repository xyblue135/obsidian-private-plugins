# xyblue135 · 图片缩放与相框

> **开源插件**：xyblue135 维护的开放源代码插件，仓库公开、可自由查看与复用。
> **兼容原则**：插件 ID 保持 `00_xyblue135-local-image-hover-zoom`，升级包不携带 `data.json`，覆盖安装时保留用户本地配置与历史状态。

维护者：**xyblue135**
版本：**1.4.1**

---

Obsidian 正文图片增强插件：使用 `Shift + 鼠标滚轮` 临时改变图片真实布局尺寸，同时给**标准 Markdown `![]()` 图片**提供可切换的高级相框主题。所有变化都只存在于当前 Obsidian DOM，不写回 Markdown。

## 图片缩放

- 默认：`Shift + 滚轮`。
- 修改的是当前 DOM 的真实 `width / height`，所以会影响旁边与下方文字排版。
- 鼠标移开后保持当前大小。
- `Shift + 双击` 恢复该图片首次缩放前的尺寸。
- 不修改 `.md`、alt、图片路径或附件文件。

## 内置相框主题

1. **MC 樱花木**：低饱和粉木像素层。
2. **MC 深板岩**：深灰黑像素层，特别适合终端与服务器截图。
3. **MC 绯红木**：下界酒红暗紫风格。
4. **MC 紫水晶**：深浅紫晶体层次。
5. **氧化铜**：青铜/铜绿工业质感。
6. **黑金典藏**：哑黑 + 香槟金，偏作品集与高级展示。
7. **冰霜玻璃**：浅蓝银白、柔和圆角。
8. **赛博霓虹**：青绿 + 紫 + 洋红，适合深色主题和监控面板。

选择任意主题后仍可继续修改：主体边框厚度、像素层级、外侧留白、圆角、六组颜色与阴影强度。手动调整后自动切换为“自定义”。

## 安装

把 `00_xyblue135-local-image-hover-zoom` 文件夹复制到：

```text
你的Vault/.obsidian/plugins/00_xyblue135-local-image-hover-zoom/
```

确保至少包含：

```text
main.js
manifest.json
styles.css
```

然后在 Obsidian → 设置 → 第三方插件中启用 **xyblue135 · 图片缩放与相框**。

升级覆盖时保留当前插件目录中的 `data.json`，不要提交到公开仓库。

## v1.4.1 关键修正

- 相框严格只作用于标准 Markdown 图片：`![alt](path)` / `![](path)`。
- 不给 `#`、`##` 等标题加相框。
- 不给 Obsidian Wiki 图片 `![[image.png]]` 加相框。
- 不给 Callout 图标、Obsidian UI 图片、HTML `<img>` 自动加相框。
- 使用 Obsidian 元数据中的 `embed.original` 二次核对原始语法，避免仅凭 DOM 的 `img` 标签误判。

## v1.4.1 修复

- 修复 Obsidian 1.12.x Live Preview 中标准 `![]()` 本地图片也使用 `.image-embed` 容器，导致相框被错误排除的问题。
- 相框识别改为以 `metadataCache` 的原始 Markdown `embed.original` 为准。
- 同一资源同时存在 `![]()` 与 `![[...]]` 时，按源码顺序与 DOM 顺序匹配，减少误加相框。

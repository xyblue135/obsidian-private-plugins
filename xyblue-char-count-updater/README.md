# Char Count Updater 3.1.0

自动更新 Obsidian Markdown 文件 YAML frontmatter 中已经存在的统计字段。

## 安全原则

插件绝不会创建 YAML frontmatter，也绝不会创建任何字段。只有文件中已经存在对应键时，才会尝试修改：

```yaml
---
char_count:
token_count:
---
```

字段不存在时直接跳过。

## 功能

- 自动更新已有 `char_count`
- 自动更新已有 `token_count`
- 可选择统一倍率或中英文分倍率估算
- 每个文件独立防抖
- 切换文件或窗口失焦时可立即处理
- 支持严格的忽略目录匹配
- 支持 BOM、CRLF、Emoji 和 Unicode 字符
- 没有批量更新命令
- 没有手动更新命令
- 没有旧字段或旧设置迁移

## Token 估算

### 中英文分开估算

```text
token_count = 中文字符数 × 中文倍率
               + 英文及其他字符数 × 英文倍率
```

默认值：

```text
中文字符倍率：0.50
英文及其他字符倍率：0.25
```

中文字符使用 Unicode 汉字范围识别；英文及其他字符包括英文、数字、空格、标点、Markdown 标记和代码字符。

### 统一倍率

关闭“中英文分别估算”后：

```text
token_count = 正文 Unicode 字符数 × 统一倍率
```

默认统一倍率为 `0.55`。

Token 估算只适合粗略筛选和预算，不等于特定模型 tokenizer 的精确结果。

## 字符统计

`char_count`：

- 排除 YAML frontmatter
- 将 CRLF 统一为 LF
- 按 Unicode 字符统计
- Emoji 按一个 Unicode 字符处理
- 包含正文中的空格、换行、Markdown 和代码

## 安装

将整个 `xyblue-char-count-updater` 文件夹复制到：

```text
<Vault>/.obsidian/plugins/xyblue-char-count-updater/
```

然后重新加载 Obsidian，并在第三方插件中启用 **Char Count Updater**。

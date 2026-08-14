/*
 * xyblue 私人 · 字数与 Token 统计
 * 类型：xyblue 私人插件（非公共发布版）
 * 说明：用户可见文案与维护注释已中文化；内部插件 ID 与 data.json 保持不变，以兼容原有设置和数据。
 */
"use strict";

const {
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  normalizePath,
} = require("obsidian");

const DEFAULT_SETTINGS = {
  debounceMs: 5000,
  ignoredFolders: "",
  globalBlacklist: "",
  enableCharCount: true,
  enableTokenCount: true,
  splitTokenCount: true,
  unifiedTokenFactor: 0.55,
  chineseTokenFactor: 0.5,
  englishTokenFactor: 0.25,
  // 各字段独立黑名单（每行一个路径，匹配的文件跳过对应字段）
  charCountBlacklist: "",
  tokenCountBlacklist: "",
};

const MIN_DEBOUNCE_MS = 250;
const MAX_DEBOUNCE_MS = 60000;
const MIN_TOKEN_FACTOR = 0;
const MAX_TOKEN_FACTOR = 5;
const INTERNAL_WRITE_TIMEOUT_MS = 5000;

class CharCountUpdaterPlugin extends Plugin {
  async onload() {
    await this.loadSettings();

    this.pendingUpdates = new Map();
    this.updateChains = new Map();
    this.internalWrites = new Map();

    this.addSettingTab(new CharCountSettingTab(this.app, this));

    this.app.workspace.onLayoutReady(() => {
      this.registerVaultEvents();
      this.registerFlushEvents();
    });
  }

  onunload() {
    for (const entry of this.pendingUpdates.values()) {
      clearTimeout(entry.timer);
    }

    this.pendingUpdates.clear();
    this.updateChains.clear();
    this.internalWrites.clear();
  }

  registerVaultEvents() {
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (!(file instanceof TFile) || file.extension !== "md") {
          return;
        }

        if (this.isGloballyIgnored(file.path) || this.consumeInternalWrite(file.path)) {
          return;
        }

        this.scheduleUpdate(file);
      })
    );

    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (!(file instanceof TFile) || file.extension !== "md") {
          return;
        }

        if (!this.isGloballyIgnored(file.path)) {
          this.scheduleUpdate(file);
        }
      })
    );

    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        this.clearPathState(oldPath);

        if (file instanceof TFile) {
          this.clearPathState(file.path);
        }
      })
    );

    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        if (file instanceof TFile) {
          this.clearPathState(file.path);
        }
      })
    );
  }

  registerFlushEvents() {
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        if (this.settings.flushOnFileSwitch) {
          void this.flushPendingUpdates();
        }
      })
    );

    this.registerDomEvent(window, "blur", () => {
      if (this.settings.flushOnWindowBlur) {
        void this.flushPendingUpdates();
      }
    });
  }

  clearPathState(path) {
    const pending = this.pendingUpdates.get(path);
    if (pending) {
      clearTimeout(pending.timer);
      this.pendingUpdates.delete(path);
    }

    this.updateChains.delete(path);
    this.internalWrites.delete(path);
  }

  scheduleUpdate(file) {
    const previous = this.pendingUpdates.get(file.path);

    if (previous) {
      clearTimeout(previous.timer);
    }

    const timer = setTimeout(() => {
      this.pendingUpdates.delete(file.path);
      void this.enqueueUpdate(file);
    }, this.settings.debounceMs);

    this.pendingUpdates.set(file.path, {
      file,
      timer,
    });
  }

  async flushPendingUpdates() {
    const entries = Array.from(this.pendingUpdates.values());
    this.pendingUpdates.clear();

    for (const entry of entries) {
      clearTimeout(entry.timer);
    }

    await Promise.all(
      entries.map((entry) => this.enqueueUpdate(entry.file))
    );
  }

  enqueueUpdate(file) {
    const previous = this.updateChains.get(file.path) ?? Promise.resolve();

    const next = previous
      .catch(() => undefined)
      .then(() => this.updateFile(file))
      .catch(() => undefined)
      .finally(() => {
        if (this.updateChains.get(file.path) === next) {
          this.updateChains.delete(file.path);
        }
      });

    this.updateChains.set(file.path, next);
    return next;
  }

  consumeInternalWrite(path) {
    const until = this.internalWrites.get(path);

    if (!until) {
      return false;
    }

    this.internalWrites.delete(path);
    return Date.now() <= until;
  }

  markInternalWrite(path) {
    this.internalWrites.set(path, Date.now() + INTERNAL_WRITE_TIMEOUT_MS);
  }

  // ── 路径解析工具 ──────────────────────────────────────

  parsePathList(raw) {
    if (!raw || typeof raw !== "string") {
      return [];
    }
    return raw
      .split(/\r?\n/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => normalizePath(p));
  }

  pathMatches(path, entry) {
    const normalized = normalizePath(path);
    // 精确匹配文件路径
    if (normalized === entry) {
      return true;
    }
    // 前缀匹配文件夹路径
    if (normalized.startsWith(entry + "/")) {
      return true;
    }
    return false;
  }

  pathMatchesAny(path, entries) {
    return entries.some((entry) => this.pathMatches(path, entry));
  }

  // ── 全局忽略（文件夹黑名单 + 全局黑名单） ──────────────

  isGloballyIgnored(path) {
    // 旧的文件夹级忽略
    if (this.isIgnored(path)) {
      return true;
    }
    // 新的全局黑名单
    const entries = this.parsePathList(this.settings.globalBlacklist);
    return this.pathMatchesAny(path, entries);
  }

  getIgnoredFolders() {
    return this.settings.ignoredFolders
      .split(/\r?\n/)
      .map((folder) => folder.trim())
      .filter(Boolean)
      .map((folder) => normalizePath(folder).replace(/\/$/, ""));
  }

  isIgnored(path) {
    const normalizedPath = normalizePath(path);

    return this.getIgnoredFolders().some(
      (folder) =>
        normalizedPath === folder || normalizedPath.startsWith(`${folder}/`)
    );
  }

  // ── 字段级黑名单 ──────────────────────────────────────

  isFieldBlacklisted(path, fieldName) {
    let raw = "";
    switch (fieldName) {
      case "char_count":
        raw = this.settings.charCountBlacklist;
        break;
      case "token_count":
        raw = this.settings.tokenCountBlacklist;
        break;
      default:
        return false;
    }
    const entries = this.parsePathList(raw);
    return this.pathMatchesAny(path, entries);
  }

  // ── Frontmatter 解析 ──────────────────────────────────

  getFrontmatterMatch(content) {
    const bomOffset = content.charCodeAt(0) === 0xfeff ? 1 : 0;
    const source = content.slice(bomOffset);
    const match = source.match(
      /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/
    );

    return match
      ? {
          source,
          full: match[0],
          block: match[1],
        }
      : null;
  }

  extractBody(content) {
    const frontmatter = this.getFrontmatterMatch(content);
    const source = frontmatter
      ? frontmatter.source.slice(frontmatter.full.length)
      : content.charCodeAt(0) === 0xfeff
        ? content.slice(1)
        : content;

    return source.replace(/\r\n/g, "\n");
  }

  hasFrontmatterKey(content, key) {
    const frontmatter = this.getFrontmatterMatch(content);

    if (!frontmatter) {
      return false;
    }

    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`^${escapedKey}\\s*:`, "m").test(frontmatter.block);
  }

  readFrontmatterValue(content, key) {
    const frontmatter = this.getFrontmatterMatch(content);

    if (!frontmatter) {
      return undefined;
    }

    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = frontmatter.block.match(
      new RegExp(`^${escapedKey}\\s*:\\s*(.*?)\\s*$`, "m")
    );

    if (!match) {
      return undefined;
    }

    const value = match[1].trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      return value.slice(1, -1);
    }

    return value;
  }

  isHanCodePoint(codePoint) {
    return (
      (codePoint >= 0x3400 && codePoint <= 0x4dbf) ||
      (codePoint >= 0x4e00 && codePoint <= 0x9fff) ||
      (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
      (codePoint >= 0x20000 && codePoint <= 0x2ebef) ||
      (codePoint >= 0x2f800 && codePoint <= 0x2fa1f)
    );
  }

  analyzeBody(body) {
    let charCount = 0;
    let chineseCount = 0;

    for (const character of body) {
      charCount += 1;

      if (this.isHanCodePoint(character.codePointAt(0))) {
        chineseCount += 1;
      }
    }

    return {
      charCount,
      chineseCount,
      englishCount: charCount - chineseCount,
    };
  }

  calculateTokenCount(stats) {
    if (this.settings.splitTokenCount) {
      return Math.round(
        stats.chineseCount * this.settings.chineseTokenFactor +
          stats.englishCount * this.settings.englishTokenFactor
      );
    }

    return Math.round(stats.charCount * this.settings.unifiedTokenFactor);
  }

  async updateFile(file) {
    if (!(file instanceof TFile) || file.extension !== "md" || this.isGloballyIgnored(file.path)) {
      return;
    }

    const content = await this.app.vault.cachedRead(file);
    const frontmatter = this.getFrontmatterMatch(content);

    if (!frontmatter) {
      return;
    }

    const hasCharCount = this.hasFrontmatterKey(content, "char_count");
    const hasTokenCount = this.hasFrontmatterKey(content, "token_count");

    // 字段级黑名单过滤：即使字段存在于 frontmatter，也跳过
    const shouldHandleCharCount =
      this.settings.enableCharCount &&
      hasCharCount &&
      !this.isFieldBlacklisted(file.path, "char_count");

    const shouldHandleTokenCount =
      this.settings.enableTokenCount &&
      hasTokenCount &&
      !this.isFieldBlacklisted(file.path, "token_count");

    if (!shouldHandleCharCount && !shouldHandleTokenCount) {
      return;
    }

    const body = this.extractBody(content);
    const stats = this.analyzeBody(body);
    const tokenCount = this.calculateTokenCount(stats);

    const existingCharCount = Number.parseInt(
      this.readFrontmatterValue(content, "char_count") ?? "",
      10
    );
    const existingTokenCount = Number.parseInt(
      this.readFrontmatterValue(content, "token_count") ?? "",
      10
    );

    const needsCharCount =
      shouldHandleCharCount && existingCharCount !== stats.charCount;
    const needsTokenCount =
      shouldHandleTokenCount && existingTokenCount !== tokenCount;

    if (!needsCharCount && !needsTokenCount) {
      return;
    }

    this.markInternalWrite(file.path);

    await this.app.fileManager.processFrontMatter(file, (metadata) => {
      if (needsCharCount) {
        metadata.char_count = stats.charCount;
      }

      if (needsTokenCount) {
        metadata.token_count = tokenCount;
      }
    });
  }

  validateNumber(value, fallback, min, max) {
    const number = Number.parseFloat(value);

    if (!Number.isFinite(number)) {
      return fallback;
    }

    return Math.min(Math.max(number, min), max);
  }

  validateSettings(settings) {
    return {
      debounceMs: Math.round(
        this.validateNumber(
          settings.debounceMs,
          DEFAULT_SETTINGS.debounceMs,
          MIN_DEBOUNCE_MS,
          MAX_DEBOUNCE_MS
        )
      ),
      ignoredFolders:
        typeof settings.ignoredFolders === "string" ? settings.ignoredFolders : "",
      globalBlacklist:
        typeof settings.globalBlacklist === "string" ? settings.globalBlacklist : "",
      enableCharCount:
        settings.enableCharCount === undefined
          ? DEFAULT_SETTINGS.enableCharCount
          : Boolean(settings.enableCharCount),
      enableTokenCount:
        settings.enableTokenCount === undefined
          ? DEFAULT_SETTINGS.enableTokenCount
          : Boolean(settings.enableTokenCount),
      splitTokenCount:
        settings.splitTokenCount === undefined
          ? DEFAULT_SETTINGS.splitTokenCount
          : Boolean(settings.splitTokenCount),
      unifiedTokenFactor: this.validateNumber(
        settings.unifiedTokenFactor,
        DEFAULT_SETTINGS.unifiedTokenFactor,
        MIN_TOKEN_FACTOR,
        MAX_TOKEN_FACTOR
      ),
      chineseTokenFactor: this.validateNumber(
        settings.chineseTokenFactor,
        DEFAULT_SETTINGS.chineseTokenFactor,
        MIN_TOKEN_FACTOR,
        MAX_TOKEN_FACTOR
      ),
      englishTokenFactor: this.validateNumber(
        settings.englishTokenFactor,
        DEFAULT_SETTINGS.englishTokenFactor,
        MIN_TOKEN_FACTOR,
        MAX_TOKEN_FACTOR
      ),
      charCountBlacklist:
        typeof settings.charCountBlacklist === "string" ? settings.charCountBlacklist : "",
      tokenCountBlacklist:
        typeof settings.tokenCountBlacklist === "string" ? settings.tokenCountBlacklist : "",
    };
  }

  async loadSettings() {
    this.settings = this.validateSettings((await this.loadData()) ?? {});
  }

  async saveSettings() {
    this.settings = this.validateSettings(this.settings);
    await this.saveData(this.settings);
  }
}

class CharCountSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "xyblue 私人 · 字数与 Token 统计" });
    containerEl.createEl("p", {
      text: "插件只修改 YAML 中已经存在的 char_count、token_count 字段，绝不会创建字段或 frontmatter。",
      cls: "setting-item-description",
    });

    // ═══ ① 字段独立开关（两个字段各自独立，互不影响）═══
    containerEl.createEl("h3", { text: "① 字段独立开关（两个字段各自独立，互不影响）" });
    containerEl.createEl("p", {
      text: "下面两个开关分别控制一个字段。关掉某一个，插件就不再更新该字段，其余字段照常。默认状态：char_count / token_count 均为开。",
      cls: "setting-item-description",
    });

    new Setting(containerEl)
      .setName("字符数 · char_count")
      .setDesc("【开】编辑后更新正文 Unicode 字符数；【关】完全不碰此字段。默认开。")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableCharCount)
          .onChange(async (value) => {
            this.plugin.settings.enableCharCount = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Token 估算 · token_count")
      .setDesc("【开】编辑后更新 Token 估算值（依赖下方倍率设置）；【关】完全不碰此字段。默认开。")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableTokenCount)
          .onChange(async (value) => {
            this.plugin.settings.enableTokenCount = value;
            await this.plugin.saveSettings();
          })
      );

    // ═══ ② 黑名单（全局 + 字段级）═══
    containerEl.createEl("h3", { text: "② 黑名单（全局 + 字段级）" });
    containerEl.createEl("p", {
      text: "全局黑名单命中则整个文件跳过所有字段；字段级黑名单仅跳过对应字段。均支持精确文件路径或文件夹前缀匹配。",
      cls: "setting-item-description",
    });

    new Setting(containerEl)
      .setName("全局黑名单")
      .setDesc("每行一个路径；匹配的文件或文件夹完全跳过所有字段。例如 0_obsidian/元数据/元数据模板")
      .addTextArea((text) =>
        text
          .setPlaceholder("0_obsidian/元数据/元数据模板\n某个文件夹/")
          .setValue(this.plugin.settings.globalBlacklist)
          .onChange(async (value) => {
            this.plugin.settings.globalBlacklist = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("char_count 黑名单")
      .setDesc("仅跳过字符数统计（不影响其他字段）")
      .addTextArea((text) =>
        text
          .setPlaceholder("")
          .setValue(this.plugin.settings.charCountBlacklist)
          .onChange(async (value) => {
            this.plugin.settings.charCountBlacklist = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("token_count 黑名单")
      .setDesc("仅跳过 Token 估算（不影响其他字段）")
      .addTextArea((text) =>
        text
          .setPlaceholder("")
          .setValue(this.plugin.settings.tokenCountBlacklist)
          .onChange(async (value) => {
            this.plugin.settings.tokenCountBlacklist = value;
            await this.plugin.saveSettings();
          })
      );

    // ═══ ③ Token 估算参数（仅 token_count 开启时生效）═══
    containerEl.createEl("h3", { text: "③ Token 估算参数（仅 token_count 开启时生效）" });

    new Setting(containerEl)
      .setName("中英文分别估算")
      .setDesc("开启后：中文字符 × 中文倍率 + 英文及其他字符 × 英文倍率；关闭后使用统一倍率")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.splitTokenCount)
          .onChange(async (value) => {
            this.plugin.settings.splitTokenCount = value;
            await this.plugin.saveSettings();
            this.display();
          })
      );

    if (this.plugin.settings.splitTokenCount) {
      new Setting(containerEl)
        .setName("中文字符倍率")
        .setDesc("默认 0.50；识别 Unicode 汉字，包含常用字和扩展区汉字")
        .addText((text) =>
          text
            .setPlaceholder("0.50")
            .setValue(String(this.plugin.settings.chineseTokenFactor))
            .onChange(async (value) => {
              this.plugin.settings.chineseTokenFactor = value;
              await this.plugin.saveSettings();
            })
        );

      new Setting(containerEl)
        .setName("英文及其他字符倍率")
        .setDesc("默认 0.25；用于英文、数字、空格、标点、Markdown 和代码字符")
        .addText((text) =>
          text
            .setPlaceholder("0.25")
            .setValue(String(this.plugin.settings.englishTokenFactor))
            .onChange(async (value) => {
              this.plugin.settings.englishTokenFactor = value;
              await this.plugin.saveSettings();
            })
        );
    } else {
      new Setting(containerEl)
        .setName("统一 Token 倍率")
        .setDesc("默认 0.55；token_count = 正文 Unicode 字符数 × 统一倍率")
        .addText((text) =>
          text
            .setPlaceholder("0.55")
            .setValue(String(this.plugin.settings.unifiedTokenFactor))
            .onChange(async (value) => {
              this.plugin.settings.unifiedTokenFactor = value;
              await this.plugin.saveSettings();
            })
        );
    }

    // ═══ ④ 自动更新节奏 ═══
    containerEl.createEl("h3", { text: "④ 自动更新节奏" });

    new Setting(containerEl)
      .setName("防抖延迟（毫秒）")
      .setDesc("停止编辑后多久更新；建议 3000～8000")
      .addText((text) =>
        text
          .setPlaceholder("5000")
          .setValue(String(this.plugin.settings.debounceMs))
          .onChange(async (value) => {
            this.plugin.settings.debounceMs = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("切换文件时立即更新")
      .setDesc("切换笔记时立即处理仍在防抖等待中的文件")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.flushOnFileSwitch)
          .onChange(async (value) => {
            this.plugin.settings.flushOnFileSwitch = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("窗口失焦时立即更新")
      .setDesc("切换到其他应用时处理仍在防抖等待中的文件")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.flushOnWindowBlur)
          .onChange(async (value) => {
            this.plugin.settings.flushOnWindowBlur = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("忽略的文件夹")
      .setDesc("每行一个 Vault 相对路径；这些目录中的 Markdown 文件不会处理")
      .addTextArea((text) =>
        text
          .setPlaceholder("模板\n附件\n00_AI自动分类")
          .setValue(this.plugin.settings.ignoredFolders)
          .onChange(async (value) => {
            this.plugin.settings.ignoredFolders = value;
            await this.plugin.saveSettings();
          })
      );
  }
}

module.exports = CharCountUpdaterPlugin;

/*
 * xyblue135 私人 · 附件镜像
 * 类型：xyblue135 私人插件（非公共发布版）
 * 说明：用户可见文案与维护注释已中文化；内部插件 ID 与 data.json 保持不变，以兼容原有设置和数据。
 */
const {
  Plugin,
  PluginSettingTab,
  Setting,
  Notice,
  TFile,
  TFolder,
  normalizePath
} = require("obsidian");

const DEFAULT_SETTINGS = {
  notesRoot: "Notes",
  attachmentsRoot: "Attachments",
  structureMode: "note",
  fileNameMode: "smart",
  handlePaste: true,
  handleDrop: true,
  syncOnNoteRename: true,
  deleteAttachmentsWithNote: true
};

const IMAGE_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif"
]);

// Obsidian 中适合直接嵌入正文预览的附件。
// 图片和 PDF 使用 ![]()；压缩包、Office 等普通附件使用 []()。
const EMBED_EXTENSIONS = new Set([...IMAGE_EXTENSIONS, "pdf"]);

module.exports = class MirrorAttachmentsPlugin extends Plugin {
  async onload() {
    await this.loadSettings();
    this.addSettingTab(new MirrorAttachmentsSettingTab(this.app, this));

    // v1.5：按文章模式下维护严格的一对一目录关系。
    // 插件加载完成后，即使 Markdown 没有任何附件，也会补建对应空目录。
    this.app.workspace.onLayoutReady(() => {
      void this.ensureAllNoteFolders().catch((err) => {
        console.error("[xyblue135 私人·附件镜像] initial folder sync failed:", err);
        new Notice("xyblue135 私人·附件镜像：初始化一对一附件目录失败，请查看控制台。");
      });
    });

    // 新建 Markdown 时立即建立对应空附件目录。
    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (!(file instanceof TFile) || file.extension !== "md") return;
        if (!this.isManagedNotePath(file.path)) return;
        if (this.settings.structureMode !== "note") return;

        const folderPath = this.getAttachmentFolderForNotePath(file.path);
        void this.ensureFolder(folderPath).catch((err) => {
          console.error("[xyblue135 私人·附件镜像] create folder sync failed:", err);
          new Notice(`xyblue135 私人·附件镜像：无法建立对应附件目录：${folderPath}`);
        });
      })
    );

    this.registerEvent(
      this.app.workspace.on("editor-paste", (evt, editor, info) => {
        if (!this.settings.handlePaste || evt.defaultPrevented) return;

        // Windows / Electron 在“资源管理器复制文件 → Obsidian 粘贴”时，
        // 某些文件类型（例如 ZIP）不一定稳定出现在 DataTransfer.files 中，
        // 但通常仍可从 DataTransfer.items 的 file item 取到。
        // 因此统一从 files + items 两个入口收集，并做去重。
        const files = this.getFilesFromDataTransfer(evt.clipboardData);

        if (!files.length) return;

        const note = info && info.file;
        if (!(note instanceof TFile) || note.extension !== "md") return;

        // 接管文件/图片粘贴，阻止 Obsidian 默认附件逻辑。
        evt.preventDefault();
        evt.stopPropagation();

        void this.importFiles(files, note, editor).catch((err) => {
          console.error("[xyblue135 私人·附件镜像] paste failed:", err);
          new Notice("xyblue135 私人·附件镜像：粘贴附件失败，请查看控制台。");
        });
      })
    );

    this.registerEvent(
      this.app.workspace.on("editor-drop", (evt, editor, info) => {
        if (!this.settings.handleDrop || evt.defaultPrevented) return;

        const files = this.getFilesFromDataTransfer(evt.dataTransfer);

        // Obsidian 内部拖动通常没有系统 FileList / file item，因此不会误拦截。
        if (!files.length) return;

        const note = info && info.file;
        if (!(note instanceof TFile) || note.extension !== "md") return;

        evt.preventDefault();
        evt.stopPropagation();

        void this.importFiles(files, note, editor).catch((err) => {
          console.error("[xyblue135 私人·附件镜像] drop failed:", err);
          new Notice("xyblue135 私人·附件镜像：拖入附件失败，请查看控制台。");
        });
      })
    );

    // Markdown 改名或移动时，同步“按文章建立附件目录”。
    // 文件夹改名时，Obsidian 可能连续触发多个 Markdown rename；
    // 用队列串行处理，避免并发创建/迁移目录，并在每次迁移后清理旧的空父目录。
    this.renameSyncQueue = Promise.resolve();
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        if (!this.settings.syncOnNoteRename) return;
        if (!(file instanceof TFile) || file.extension !== "md") return;

        // 立即保存事件发生时的新路径，避免排队期间 file.path 又发生变化。
        const newPath = file.path;
        this.renameSyncQueue = this.renameSyncQueue
          .then(() => this.syncAttachmentFolderAfterRename(newPath, oldPath))
          .catch((err) => {
            console.error("[xyblue135 私人·附件镜像] rename sync failed:", err);
            new Notice("xyblue135 私人·附件镜像：同步附件目录失败，请查看控制台。");
          });
      })
    );

    // Markdown 删除时，同步移入回收站对应的“按文章附件目录”。
    // 使用 FileManager.trashFile，遵循 Obsidian 自己的回收站设置，避免永久删除。
    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        if (!this.settings.deleteAttachmentsWithNote) return;
        if (!(file instanceof TFile) || file.extension !== "md") return;
        if (!this.isManagedNotePath(file.path)) return;

        void this.trashAttachmentFolderAfterNoteDelete(file.path).catch((err) => {
          console.error("[xyblue135 私人·附件镜像] delete sync failed:", err);
          new Notice("xyblue135 私人·附件镜像：关联删除附件目录失败，请查看控制台。");
        });
      })
    );

    // 左侧文件树右键 Markdown -> 打开对应附件目录。
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (!(file instanceof TFile) || file.extension !== "md") return;

        menu.addItem((item) => {
          item
            .setTitle("📂 打开对应附件目录")
            .onClick(() => {
              void this.revealAttachmentFolder(file);
            });
        });
      })
    );
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

    // v1.6 起固定使用“每篇 Markdown 一个独立附件目录”。
    // v1.6.6 起采用智能命名：可嵌入资源使用时间戳，普通附件保留原名。
    let migrated = false;
    if (this.settings.structureMode !== "note") {
      this.settings.structureMode = "note";
      migrated = true;
    }
    if (this.settings.syncOnNoteRename !== true) {
      this.settings.syncOnNoteRename = true;
      migrated = true;
    }
    if (this.settings.deleteAttachmentsWithNote !== true) {
      this.settings.deleteAttachmentsWithNote = true;
      migrated = true;
    }
    if (this.settings.fileNameMode !== "smart") {
      this.settings.fileNameMode = "smart";
      migrated = true;
    }

    if (migrated) {
      await this.saveData(this.settings);
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  getManagedMarkdownFiles() {
    return this.app.vault
      .getMarkdownFiles()
      .filter((file) => this.isManagedNotePath(file.path));
  }

  async ensureAllNoteFolders() {
    if (this.settings.structureMode !== "note") {
      return { created: 0, conflicts: [] };
    }

    let created = 0;
    const conflicts = [];

    for (const note of this.getManagedMarkdownFiles()) {
      const folderPath = this.getAttachmentFolderForNotePath(note.path);
      const existing = this.app.vault.getAbstractFileByPath(folderPath);

      if (existing instanceof TFolder) continue;

      if (existing) {
        conflicts.push({
          notePath: note.path,
          folderPath,
          reason: "目标位置存在同名文件，无法建立目录"
        });
        continue;
      }

      try {
        await this.ensureFolder(folderPath);
        created += 1;
      } catch (err) {
        conflicts.push({
          notePath: note.path,
          folderPath,
          reason: err && err.message ? err.message : String(err)
        });
      }
    }

    return { created, conflicts };
  }

  getRequiredAttachmentPaths(expectedFolders, attachmentRoot) {
    const required = new Set([normalizePath(attachmentRoot)]);
    const root = normalizePath(attachmentRoot);

    for (const folderPath of expectedFolders) {
      let current = normalizePath(folderPath);
      required.add(current);

      while (current && current !== root) {
        current = this.parentPath(current);
        if (!current) break;
        required.add(current);
        if (current === root) break;
      }
    }

    return required;
  }

  getFoldersUnderRoot(rootPath) {
    const root = normalizePath(rootPath);
    const rootFolder = this.app.vault.getAbstractFileByPath(root);
    if (!(rootFolder instanceof TFolder)) return [];

    const result = [];
    const walk = (folder) => {
      for (const child of folder.children || []) {
        if (child instanceof TFolder) {
          result.push(child);
          walk(child);
        }
      }
    };

    walk(rootFolder);
    return result;
  }

  async auditFolderConsistency() {
    const attachmentRoot =
      this.cleanRoot(this.settings.attachmentsRoot) || "Attachments";

    if (this.settings.structureMode !== "note") {
      return {
        supported: false,
        notesCount: 0,
        expectedCount: 0,
        missing: [],
        extra: [],
        conflicts: [],
        attachmentRoot
      };
    }

    const notes = this.getManagedMarkdownFiles();
    const expected = new Map();

    for (const note of notes) {
      expected.set(
        this.getAttachmentFolderForNotePath(note.path),
        note.path
      );
    }

    const missing = [];
    const conflicts = [];

    for (const [folderPath, notePath] of expected.entries()) {
      const existing = this.app.vault.getAbstractFileByPath(folderPath);
      if (existing instanceof TFolder) continue;

      if (existing) {
        conflicts.push({
          notePath,
          folderPath,
          reason: "应为文件夹，但当前位置存在同名文件"
        });
      } else {
        missing.push({ notePath, folderPath });
      }
    }

    // 分类父目录只是容器，不属于“多余”。
    // 只标记第一个脱离期望树的目录，这样自动纠错时可一次回收整个孤立子树，
    // 不会把同一棵孤立目录的父子层级重复列出。
    const expectedPaths = new Set(expected.keys());
    const requiredPaths = this.getRequiredAttachmentPaths(
      expectedPaths,
      attachmentRoot
    );
    const existingFolders = this.getFoldersUnderRoot(attachmentRoot);
    const extra = [];

    for (const folder of existingFolders) {
      const path = normalizePath(folder.path);
      if (requiredPaths.has(path)) continue;

      // 已经进入某篇文章自己的附件目录后，内部子目录属于该文章的附件内容，
      // 不能把这些子目录误判成“多余的一对一映射目录”。
      const insideExpectedFolder = Array.from(expectedPaths).some(
        (expectedPath) => path.startsWith(normalizePath(expectedPath) + "/")
      );
      if (insideExpectedFolder) continue;

      const parent = this.parentPath(path);
      if (requiredPaths.has(parent)) {
        extra.push({ folderPath: path });
      }
    }

    return {
      supported: true,
      notesCount: notes.length,
      expectedCount: expected.size,
      missing,
      extra,
      conflicts,
      attachmentRoot
    };
  }

  async repairFolderConsistency(auditResult = null) {
    const audit = auditResult || await this.auditFolderConsistency();
    if (!audit.supported) {
      return { created: 0, trashed: 0, conflicts: audit.conflicts || [] };
    }

    let created = 0;
    let trashed = 0;
    const conflicts = [...(audit.conflicts || [])];

    for (const item of audit.missing) {
      try {
        await this.ensureFolder(item.folderPath);
        created += 1;
      } catch (err) {
        conflicts.push({
          notePath: item.notePath,
          folderPath: item.folderPath,
          reason: err && err.message ? err.message : String(err)
        });
      }
    }

    // 多余目录不永久删除，统一按 Obsidian 当前回收站设置处理。
    for (const item of audit.extra) {
      const folder = this.app.vault.getAbstractFileByPath(item.folderPath);
      if (!(folder instanceof TFolder)) continue;

      try {
        if (
          this.app.fileManager &&
          typeof this.app.fileManager.trashFile === "function"
        ) {
          await this.app.fileManager.trashFile(folder);
        } else {
          await this.app.vault.trash(folder, false);
        }
        trashed += 1;
      } catch (err) {
        conflicts.push({
          folderPath: item.folderPath,
          reason: err && err.message ? err.message : String(err)
        });
      }
    }

    return { created, trashed, conflicts };
  }

  cleanRoot(path) {
    path = (path || "").trim().replace(/^\/+|\/+$/g, "");
    return path ? normalizePath(path) : "";
  }

  isManagedNotePath(notePath) {
    const normalized = normalizePath(notePath);
    const notesRoot = this.cleanRoot(this.settings.notesRoot);
    const attachmentRoot =
      this.cleanRoot(this.settings.attachmentsRoot) || "Attachments";

    // 配置了 Notes 根目录时，只管理该目录下的 Markdown，
    // 防止删除 Attachments 中的 .md 附件时发生误关联。
    if (notesRoot) {
      return normalized.startsWith(notesRoot + "/");
    }

    // notesRoot 为空代表允许管理整个库，但仍排除附件根目录自身。
    return !(
      normalized === attachmentRoot ||
      normalized.startsWith(attachmentRoot + "/")
    );
  }

  getRelativeNotePath(notePath) {
    const notesRoot = this.cleanRoot(this.settings.notesRoot);
    const normalized = normalizePath(notePath);

    if (!notesRoot) return normalized;

    if (normalized.startsWith(notesRoot + "/")) {
      return normalized.slice(notesRoot.length + 1);
    }

    // 当前版本按原路径兜底；不添加额外的 Notes 外规则。
    return normalized;
  }

  stripExtension(path) {
    return path.replace(/\.md$/i, "");
  }

  parentPath(path) {
    const i = path.lastIndexOf("/");
    return i >= 0 ? path.slice(0, i) : "";
  }

  getAttachmentFolderForNotePath(notePath) {
    const attachmentRoot =
      this.cleanRoot(this.settings.attachmentsRoot) || "Attachments";

    const relative = this.getRelativeNotePath(notePath);
    const relativeNoExt = this.stripExtension(relative);

    let subPath;
    if (this.settings.structureMode === "folder") {
      subPath = this.parentPath(relativeNoExt);
    } else {
      subPath = relativeNoExt;
    }

    return normalizePath(
      subPath ? `${attachmentRoot}/${subPath}` : attachmentRoot
    );
  }

  async ensureFolder(path) {
    const normalized = normalizePath(path);
    if (!normalized) return;

    const parts = normalized.split("/").filter(Boolean);
    let current = "";

    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      const existing = this.app.vault.getAbstractFileByPath(current);

      if (!existing) {
        try {
          await this.app.vault.createFolder(current);
        } catch (err) {
          // 文件夹批量改名时可能有多个事件同时尝试建立同一父目录。
          // 如果失败后发现目录已经由另一任务创建，则视为成功。
          const afterCreate = this.app.vault.getAbstractFileByPath(current);
          if (!(afterCreate instanceof TFolder)) throw err;
        }
      } else if (!(existing instanceof TFolder)) {
        throw new Error(`无法创建目录：${current} 已存在同名文件`);
      }
    }
  }

  async trashFolderSafely(folder) {
    if (!(folder instanceof TFolder)) return false;

    if (
      this.app.fileManager &&
      typeof this.app.fileManager.trashFile === "function"
    ) {
      await this.app.fileManager.trashFile(folder);
    } else {
      await this.app.vault.trash(folder, false);
    }

    return true;
  }

  async cleanupEmptyAttachmentParents(startPath) {
    const attachmentRoot = normalizePath(
      this.cleanRoot(this.settings.attachmentsRoot) || "Attachments"
    );

    let current = normalizePath(startPath || "");
    let cleaned = 0;

    // 只允许清理 Attachments 根目录之下，根目录自身永远保留。
    while (
      current &&
      current !== attachmentRoot &&
      current.startsWith(attachmentRoot + "/")
    ) {
      const folder = this.app.vault.getAbstractFileByPath(current);

      // 已不存在时继续检查更上一级；非文件夹对象则停止，避免误操作。
      if (!folder) {
        current = this.parentPath(current);
        continue;
      }
      if (!(folder instanceof TFolder)) break;

      // 只回收真正的空目录。一旦遇到仍有内容的父目录立即停止。
      if ((folder.children || []).length !== 0) break;

      const parent = this.parentPath(current);
      await this.trashFolderSafely(folder);
      cleaned += 1;
      current = parent;
    }

    return cleaned;
  }

  getFilesFromDataTransfer(dataTransfer) {
    if (!dataTransfer) return [];

    const result = [];
    const seen = new Set();

    const addFile = (file) => {
      if (!file || typeof file.arrayBuffer !== "function") return;

      // 同一个系统文件可能同时出现在 files 和 items 中。
      // 用稳定的 File 元数据去重，避免一次粘贴生成两个副本。
      const key = [
        file.name || "",
        Number.isFinite(file.size) ? file.size : "",
        Number.isFinite(file.lastModified) ? file.lastModified : "",
        file.type || ""
      ].join("\u0000");

      if (seen.has(key)) return;
      seen.add(key);
      result.push(file);
    };

    for (const file of Array.from(dataTransfer.files || [])) {
      addFile(file);
    }

    for (const item of Array.from(dataTransfer.items || [])) {
      if (!item || item.kind !== "file" || typeof item.getAsFile !== "function") {
        continue;
      }

      try {
        addFile(item.getAsFile());
      } catch (err) {
        console.warn("[xyblue135 私人·附件镜像] cannot read DataTransferItem:", err);
      }
    }

    return result;
  }

  sanitizeFileName(name) {
    let safe = String(name || "")
      // Windows 非法字符 + ASCII 控制字符统一替换成短横线。
      .replace(/[\\/:*?"<>|\x00-\x1F]/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[. ]+$/g, "")
      .trim();

    if (!safe || safe === "." || safe === "..") {
      safe = "附件";
    }

    // Windows 保留设备名在跨平台 Vault 中也容易产生同步问题。
    const stem = safe.split(".")[0].toUpperCase();
    if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(stem)) {
      safe = `_${safe}`;
    }

    return safe;
  }

  makeOriginalFileName(file) {
    const rawName = file && file.name ? file.name : "";
    let safeName = this.sanitizeFileName(rawName);
    const ext = this.getExt(rawName, file && file.type);

    // 某些剪贴板 File 没有可靠的 name，只能从 MIME 推断扩展名。
    if (!safeName.includes(".") && ext && ext !== "bin") {
      safeName = `${safeName}.${ext}`;
    }

    return safeName;
  }

  makeUniqueOriginalFileName(file, targetFolder) {
    const desiredName = this.makeOriginalFileName(file);
    const dot = desiredName.lastIndexOf(".");
    const hasExt = dot > 0 && dot < desiredName.length - 1;
    const baseName = hasExt ? desiredName.slice(0, dot) : desiredName;
    const extension = hasExt ? desiredName.slice(dot) : "";

    let candidate = desiredName;
    let index = 1;

    while (
      this.app.vault.getAbstractFileByPath(
        normalizePath(`${targetFolder}/${candidate}`)
      )
    ) {
      candidate = `${baseName} (${index})${extension}`;
      index += 1;
    }

    return {
      name: candidate,
      renamed: candidate !== desiredName,
      desiredName
    };
  }

  getImportFileName(file, targetFolder) {
    const ext = this.getExt(file && file.name, file && file.type);
    if (EMBED_EXTENSIONS.has(ext)) {
      return {
        name: this.makeTimestampFileName(file, targetFolder),
        renamed: false,
        desiredName: null,
        embedded: true
      };
    }

    return {
      ...this.makeUniqueOriginalFileName(file, targetFolder),
      embedded: false
    };
  }

  getExt(fileName, mimeType) {
    const safe = fileName || "";
    const dot = safe.lastIndexOf(".");

    if (dot > 0 && dot < safe.length - 1) {
      return safe.slice(dot + 1).toLowerCase();
    }

    const mimeMap = {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/gif": "gif",
      "image/webp": "webp",
      "image/svg+xml": "svg",
      "application/pdf": "pdf"
    };

    return mimeMap[mimeType] || "bin";
  }

  formatTimestamp(ms) {
    const d = new Date(ms);
    const p2 = (n) => String(n).padStart(2, "0");
    const p3 = (n) => String(n).padStart(3, "0");

    // 纯数字毫秒级时间戳：YYYYMMDDHHmmssSSS
    // 例如：20260809021530123.png
    return (
      d.getFullYear() +
      p2(d.getMonth() + 1) +
      p2(d.getDate()) +
      p2(d.getHours()) +
      p2(d.getMinutes()) +
      p2(d.getSeconds()) +
      p3(d.getMilliseconds())
    );
  }

  makeTimestampFileName(file, targetFolder) {
    const ext = this.getExt(file.name, file.type);

    // 一次粘贴多个附件时，循环可能快于 1ms。
    // 使用“单调递增”的毫秒时间：如果当前时间没有前一个名字新，
    // 就在前一个时间基础上 +1ms。这样仍然是纯时间戳，不需要 -1/-2。
    let ms = Math.max(Date.now(), (this.lastAttachmentTimestampMs || 0) + 1);

    while (true) {
      const name = `${this.formatTimestamp(ms)}.${ext}`;
      const path = normalizePath(`${targetFolder}/${name}`);

      if (!this.app.vault.getAbstractFileByPath(path)) {
        this.lastAttachmentTimestampMs = ms;
        return name;
      }

      // 极小概率目录中已有相同时间戳，则继续顺延 1ms。
      ms += 1;
    }
  }

  escapeAltText(text) {
    return (text || "")
      .replace(/\\/g, "\\\\")
      .replace(/\[/g, "\\[")
      .replace(/\]/g, "\\]");
  }

  markdownSafePath(path) {
    // 保留中文和目录结构，只转义 Markdown 链接里常见的问题字符。
    return path
      .replace(/%/g, "%25")
      .replace(/ /g, "%20")
      .replace(/#/g, "%23")
      .replace(/\(/g, "%28")
      .replace(/\)/g, "%29");
  }

  getRelativePath(fromNotePath, targetPath) {
    const fromDir = this.parentPath(normalizePath(fromNotePath));
    const fromParts = fromDir ? fromDir.split("/").filter(Boolean) : [];
    const toParts = normalizePath(targetPath).split("/").filter(Boolean);

    let common = 0;
    while (
      common < fromParts.length &&
      common < toParts.length &&
      fromParts[common] === toParts[common]
    ) {
      common += 1;
    }

    const up = Array(fromParts.length - common).fill("..");
    const down = toParts.slice(common);
    return [...up, ...down].join("/") || "./";
  }

  makeMarkdownLink(createdFile, sourceNote) {
    // 使用以 Obsidian 仓库根目录为基准的绝对路径。
    // 例如：Attachments/A/B/image.png -> /Attachments/A/B/image.png
    const vaultAbsolutePath = `/${normalizePath(createdFile.path).replace(/^\/+/, "")}`;
    const safePath = this.markdownSafePath(vaultAbsolutePath);
    const description = this.escapeAltText(
      createdFile.name || createdFile.basename || "附件"
    );

    const ext = (createdFile.extension || "").toLowerCase();
    const shouldEmbed = EMBED_EXTENSIONS.has(ext);

    if (shouldEmbed) {
      // 可直接预览的附件（图片 / PDF）使用嵌入语法。
      // alt 固定为空，保持笔记正文简洁：![](/Attachments/.../file.ext)
      return `![](${safePath})`;
    }

    // ZIP / RAR / 7Z / Office 等不可直接预览的普通附件只插入链接，
    // 不加感叹号，避免让 Obsidian 尝试把压缩包等内容嵌入正文。
    return `[${description}](${safePath})`;
  }

  async importFiles(files, note, editor) {
    const targetFolder = this.getAttachmentFolderForNotePath(note.path);

    try {
      await this.ensureFolder(targetFolder);
    } catch (err) {
      console.error("[xyblue135 私人·附件镜像] cannot create target folder:", err);
      new Notice(`xyblue135 私人·附件镜像：目标目录无法创建\n${targetFolder}`, 7000);
      throw err;
    }

    const links = [];
    const renamed = [];
    const failed = [];

    for (const file of files) {
      if (!file || typeof file.arrayBuffer !== "function") {
        failed.push(file && file.name ? file.name : "未知附件");
        continue;
      }

      try {
        const naming = this.getImportFileName(file, targetFolder);
        const targetPath = normalizePath(`${targetFolder}/${naming.name}`);
        const buffer = await file.arrayBuffer();
        const created = await this.app.vault.createBinary(targetPath, buffer);

        links.push(this.makeMarkdownLink(created, note));

        if (naming.renamed) {
          renamed.push({
            from: naming.desiredName,
            to: naming.name
          });
        }
      } catch (err) {
        console.error(`[xyblue135 私人·附件镜像] failed to import ${file.name || "file"}:`, err);
        failed.push(file.name || "未知附件");
      }
    }

    if (links.length) {
      // 多附件之间留一个空行，图片、PDF 和普通附件混排时更清楚。
      editor.replaceSelection(links.join("\n\n"));
    }

    if (renamed.length === 1) {
      new Notice(
        `xyblue135 私人·附件镜像：文件已存在，保存为 ${renamed[0].to}`,
        5000
      );
    } else if (renamed.length > 1) {
      const preview = renamed
        .slice(0, 3)
        .map((item) => `${item.from} → ${item.to}`)
        .join("\n");
      const more = renamed.length > 3 ? `\n另有 ${renamed.length - 3} 个重名附件` : "";
      new Notice(`xyblue135 私人·附件镜像：${renamed.length} 个重名附件已自动改名\n${preview}${more}`, 7000);
    }

    if (failed.length) {
      const preview = failed.slice(0, 3).join("、");
      const more = failed.length > 3 ? ` 等 ${failed.length} 个文件` : "";
      new Notice(
        `xyblue135 私人·附件镜像：${failed.length} 个附件保存失败：${preview}${more}`,
        7000
      );
    }

    if (links.length) {
      new Notice(
        `xyblue135 私人·附件镜像：已保存 ${links.length} 个附件到 ${targetFolder}`,
        4500
      );
    } else if (failed.length) {
      new Notice("xyblue135 私人·附件镜像：没有附件成功保存，请查看控制台。", 6000);
    }
  }

  async revealAttachmentFolder(note) {
    const folderPath =
      this.getAttachmentFolderForNotePath(note.path);

    const folder =
      this.app.vault.getAbstractFileByPath(folderPath);

    if (!(folder instanceof TFolder)) {
      new Notice(
        `xyblue135 私人·附件镜像：对应附件目录尚不存在：${folderPath}`,
        5000
      );
      return;
    }

    const leaves =
      this.app.workspace.getLeavesOfType("file-explorer");

    const leaf =
      leaves && leaves.length ? leaves[0] : null;

    const view = leaf && leaf.view;

    if (view && typeof view.revealInFolder === "function") {
      await view.revealInFolder(folder);

      if (
        typeof this.app.workspace.revealLeaf === "function"
      ) {
        await this.app.workspace.revealLeaf(leaf);
      }
      return;
    }

    // 某些 Obsidian 版本没有公开 revealInFolder，至少给出准确目录。
    new Notice(
      `xyblue135 私人·附件镜像：附件目录：${folderPath}`,
      7000
    );
  }

  async trashAttachmentFolderAfterNoteDelete(notePath) {
    // “按分类目录”会被多篇文章共享，绝对不能因为删除一篇文章就删整个分类目录。
    if (this.settings.structureMode === "folder") {
      return;
    }

    const folderPath = this.getAttachmentFolderForNotePath(notePath);
    const attachmentRoot =
      this.cleanRoot(this.settings.attachmentsRoot) || "Attachments";

    // 双重保险：任何情况下都不允许把附件根目录本身送入回收站。
    if (normalizePath(folderPath) === normalizePath(attachmentRoot)) {
      return;
    }

    const folder = this.app.vault.getAbstractFileByPath(folderPath);
    if (!(folder instanceof TFolder)) return;

    await this.trashFolderSafely(folder);
    await this.cleanupEmptyAttachmentParents(this.parentPath(folderPath));

    new Notice(
      `xyblue135 私人·附件镜像：已随文章移入回收站\n${folderPath}`,
      5000
    );
  }

  async syncAttachmentFolderAfterRename(newNotePath, oldPath) {
    // “按分类目录”是多个笔记共享目录，一篇 MD 移动时不能搬走整个分类目录。
    if (this.settings.structureMode === "folder") {
      return;
    }

    const oldManaged = this.isManagedNotePath(oldPath);
    const newManaged = this.isManagedNotePath(newNotePath);

    // Notes 管理范围外的 Markdown 不参与一对一附件目录。
    if (!oldManaged && !newManaged) return;

    // 从管理范围外移入 Notes：直接建立新的空目录。
    if (!oldManaged && newManaged) {
      await this.ensureFolder(
        this.getAttachmentFolderForNotePath(newNotePath)
      );
      return;
    }

    // 从 Notes 移出管理范围：旧的一对一附件目录已经失去对应 Markdown，
    // 按一对一规则将其安全移入 Obsidian 回收站。
    if (oldManaged && !newManaged) {
      const oldFolder = this.getAttachmentFolderForNotePath(oldPath);
      const oldAbstract = this.app.vault.getAbstractFileByPath(oldFolder);
      if (!(oldAbstract instanceof TFolder)) return;

      await this.trashFolderSafely(oldAbstract);
      await this.cleanupEmptyAttachmentParents(this.parentPath(oldFolder));

      new Notice(
        `xyblue135 私人·附件镜像：文章已移出 Notes，原附件目录已移入回收站\n${oldFolder}`,
        6000
      );
      return;
    }

    const oldFolder =
      this.getAttachmentFolderForNotePath(oldPath);

    const newFolder =
      this.getAttachmentFolderForNotePath(newNotePath);

    if (oldFolder === newFolder) return;

    const oldAbstract =
      this.app.vault.getAbstractFileByPath(oldFolder);

    // 原文章还没有附件目录时，也必须为新文章路径补一个空目录，
    // 保证“每个 Markdown 始终有一对一目录”。
    if (!(oldAbstract instanceof TFolder)) {
      await this.ensureFolder(newFolder);
      await this.cleanupEmptyAttachmentParents(this.parentPath(oldFolder));
      return;
    }

    const newAbstract =
      this.app.vault.getAbstractFileByPath(newFolder);

    // 按你的要求：目标存在就停止，不合并、不覆盖、不改名。
    if (newAbstract) {
      new Notice(
        `xyblue135 私人·附件镜像：目标位置已存在同名附件目录：${newFolder}。未移动、未合并、未改名。`,
        7000
      );
      return;
    }

    await this.ensureFolder(this.parentPath(newFolder));

    // 使用 Obsidian FileManager，让 Obsidian 自己参与链接更新。
    if (
      this.app.fileManager &&
      typeof this.app.fileManager.renameFile === "function"
    ) {
      await this.app.fileManager.renameFile(
        oldAbstract,
        newFolder
      );
    } else {
      await this.app.vault.rename(
        oldAbstract,
        newFolder
      );
    }

    // 关键修复：例如 Notes/旧分类 -> Notes/新分类 后，
    // Attachments/旧分类/文章 已迁走，此时把旧分类等空壳父目录逐级回收。
    const cleanedParents = await this.cleanupEmptyAttachmentParents(
      this.parentPath(oldFolder)
    );

    new Notice(
      `xyblue135 私人·附件镜像：附件目录已同步\n${oldFolder}\n→ ${newFolder}` +
        (cleanedParents ? `\n并清理 ${cleanedParents} 个旧空目录` : ""),
      5000
    );
  }
};

class MirrorAttachmentsSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("mirror-attachments-settings");

    const hero = containerEl.createDiv({
      cls: "mirror-attachments-hero"
    });
    const heroTop = hero.createDiv({
      cls: "mirror-attachments-hero-top"
    });
    const heroText = heroTop.createDiv({
      cls: "mirror-attachments-hero-text"
    });
    heroText.createEl("h2", {
      text: "xyblue135 私人 · 附件镜像"
    });
    heroText.createEl("p", {
      text:
        "让 Notes 与 Attachments 保持一对一镜像关系，并统一接管附件的保存、命名和 Markdown 插入格式。"
    });
    heroTop.createEl("span", {
      cls: "mirror-attachments-version-badge",
      text: "v1.6.6"
    });

    const badges = hero.createDiv({
      cls: "mirror-attachments-badges"
    });
    ["一对一目录", "智能命名", "仓库绝对路径"].forEach((label) => {
      badges.createEl("span", {
        cls: "mirror-attachments-badge",
        text: label
      });
    });

    this.createSectionTitle(
      containerEl,
      "1. 存储结构",
      "先确定笔记和附件的根目录。每篇 Markdown 都拥有唯一对应的附件目录。"
    );

    new Setting(containerEl)
      .setName("笔记根目录")
      .setDesc("被插件管理的 Markdown 根目录，例如 Notes。")
      .addText((text) =>
        text
          .setPlaceholder("Notes")
          .setValue(this.plugin.settings.notesRoot)
          .onChange(async (value) => {
            this.plugin.settings.notesRoot = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("附件根目录")
      .setDesc("与笔记目录镜像对应的附件根目录，例如 Attachments。")
      .addText((text) =>
        text
          .setPlaceholder("Attachments")
          .setValue(this.plugin.settings.attachmentsRoot)
          .onChange(async (value) => {
            this.plugin.settings.attachmentsRoot = value.trim();
            await this.plugin.saveSettings();
          })
      );

    const structureCard = containerEl.createDiv({
      cls: "mirror-attachments-info-card"
    });
    structureCard.createEl("div", {
      cls: "mirror-attachments-info-title",
      text: "固定映射规则"
    });
    structureCard.createEl("code", {
      text: "Notes/A/B/文章.md  ↔  Attachments/A/B/文章/"
    });
    structureCard.createEl("p", {
      text:
        "即使文章暂时没有附件，也会保留对应空目录。嵌入式资源使用时间戳，普通附件保留原文件名。"
    });

    this.createSectionTitle(
      containerEl,
      "2. 导入行为",
      "控制系统文件复制粘贴与拖入。ZIP 等普通文件同样会被识别并保存。"
    );

    new Setting(containerEl)
      .setName("接管 Ctrl+V 附件")
      .setDesc(
        "检测到剪贴板中的系统文件时，阻止 Obsidian 默认处理并保存到当前笔记的专属附件目录。"
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.handlePaste)
          .onChange(async (value) => {
            this.plugin.settings.handlePaste = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("接管拖入附件")
      .setDesc(
        "接管从系统文件管理器拖入的图片、PDF、Office、ZIP、RAR、7Z 等文件。"
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.handleDrop)
          .onChange(async (value) => {
            this.plugin.settings.handleDrop = value;
            await this.plugin.saveSettings();
          })
      );

    const clipboardHint = containerEl.createDiv({
      cls: "mirror-attachments-tip"
    });
    clipboardHint.createEl("strong", { text: "Windows 文件粘贴兼容：" });
    clipboardHint.appendText(
      "同时读取 clipboardData.files 与 clipboardData.items，并自动去重，避免 ZIP 等文件复制后无法生成链接。"
    );

    this.createSectionTitle(
      containerEl,
      "3. 命名与 Markdown 规则",
      "先判断附件是否适合直接预览，再自动决定文件名和 Markdown 形式；无需手工选择。"
    );

    const ruleGrid = containerEl.createDiv({
      cls: "mirror-attachments-rule-grid"
    });

    this.createRuleCard(ruleGrid, {
      title: "嵌入式资源",
      tag: "时间戳 + ![]()",
      extensions: "PNG / JPG / JPEG / GIF / WebP / BMP / SVG / AVIF / PDF",
      example: "![](/Attachments/A/B/文章/20260812151230001.png)",
      description: "图片和 PDF 使用毫秒级时间戳保存并直接嵌入正文，避免截图类文件名大量重复。",
      className: "is-embed"
    });

    this.createRuleCard(ruleGrid, {
      title: "非嵌入式附件",
      tag: "原文件名 + []()",
      extensions: "ZIP / RAR / 7Z / DOC / DOCX / XLS / XLSX / PPT / PPTX / 其他文件",
      example: "[项目源码.zip](/Attachments/A/B/文章/项目源码.zip)",
      description: "压缩包、Office 等保留可读原名；重名自动变为 (1)、(2)…，正文显示完整文件名和扩展名。",
      className: "is-link"
    });

    const namingNote = containerEl.createDiv({
      cls: "mirror-attachments-tip mirror-attachments-tip-accent"
    });
    namingNote.createEl("strong", { text: "文件名安全处理：" });
    namingNote.appendText(
      "普通附件仅替换 Windows 非法字符（\\ / : * ? \" < > |）并处理保留设备名；中文、空格和括号会尽量原样保留。"
    );

    const multiPasteNote = containerEl.createDiv({
      cls: "mirror-attachments-tip"
    });
    multiPasteNote.createEl("strong", { text: "批量粘贴：" });
    multiPasteNote.appendText(
      "多个附件之间自动留一个空行；单个文件失败不会中断整批导入，并会给出单独提示。"
    );

    const linkNote = containerEl.createDiv({
      cls: "mirror-attachments-tip"
    });
    linkNote.createEl("strong", { text: "路径规则：" });
    linkNote.appendText(
      "所有链接均从 Vault 根目录开始，例如 /Attachments/...，不会随着笔记层级变化生成 ../。"
    );

    this.createSectionTitle(
      containerEl,
      "4. 目录一致性",
      "检查 Notes 与 Attachments 是否仍保持一对一；可自动修复缺失目录和确定无用的孤立目录。"
    );

    const auditActions = new Setting(containerEl)
      .setName("一对一目录校错")
      .setDesc("重新扫描当前库，或自动修复能够安全确定的问题。");

    const auditPanel = containerEl.createDiv({
      cls: "mirror-attachments-audit-panel"
    });

    auditActions.addButton((button) =>
      button
        .setButtonText("重新校验")
        .onClick(async () => {
          button.setDisabled(true);
          try {
            await this.refreshAuditPanel(auditPanel);
          } finally {
            button.setDisabled(false);
          }
        })
    );

    auditActions.addButton((button) =>
      button
        .setButtonText("自动纠错")
        .setCta()
        .onClick(async () => {
          button.setDisabled(true);
          try {
            const audit = await this.plugin.auditFolderConsistency();
            const result = await this.plugin.repairFolderConsistency(audit);
            const conflictText = result.conflicts.length
              ? `，仍有 ${result.conflicts.length} 个冲突需手动处理`
              : "";

            new Notice(
              `xyblue135 私人·附件镜像：已补建 ${result.created} 个目录，回收 ${result.trashed} 个多余目录${conflictText}`,
              7000
            );
            await this.refreshAuditPanel(auditPanel);
          } catch (err) {
            console.error("[xyblue135 私人·附件镜像] repair failed:", err);
            new Notice("xyblue135 私人·附件镜像：自动纠错失败，请查看控制台。");
          } finally {
            button.setDisabled(false);
          }
        })
    );

    void this.refreshAuditPanel(auditPanel);

    this.createSectionTitle(
      containerEl,
      "5. 快捷操作",
      "减少手动查找附件目录的步骤。"
    );

    const shortcutCard = containerEl.createDiv({
      cls: "mirror-attachments-info-card mirror-attachments-shortcut-card"
    });
    shortcutCard.createEl("div", {
      cls: "mirror-attachments-info-title",
      text: "文件树右键"
    });
    shortcutCard.createEl("p", {
      text:
        "在左侧文件树右键任意受管理的 Markdown，选择“📂 打开对应附件目录”，即可定位到它的一对一附件文件夹。"
    });
  }

  createSectionTitle(containerEl, title, description) {
    const section = containerEl.createDiv({
      cls: "mirror-attachments-section-heading"
    });
    section.createEl("h3", { text: title });
    if (description) {
      section.createEl("p", { text: description });
    }
  }

  createRuleCard(containerEl, options) {
    const card = containerEl.createDiv({
      cls: `mirror-attachments-rule-card ${options.className || ""}`.trim()
    });
    const top = card.createDiv({
      cls: "mirror-attachments-rule-card-top"
    });
    top.createEl("strong", { text: options.title });
    top.createEl("span", {
      cls: "mirror-attachments-rule-tag",
      text: options.tag
    });
    card.createEl("div", {
      cls: "mirror-attachments-rule-exts",
      text: options.extensions
    });
    card.createEl("p", {
      text: options.description
    });
    card.createEl("code", {
      text: options.example
    });
  }

  async refreshAuditPanel(panelEl) {
    panelEl.empty();
    panelEl.createEl("div", {
      cls: "mirror-attachments-audit-loading",
      text: "正在校验……"
    });

    let audit;
    try {
      audit = await this.plugin.auditFolderConsistency();
    } catch (err) {
      console.error("[xyblue135 私人·附件镜像] audit failed:", err);
      panelEl.empty();
      panelEl.createEl("div", {
        cls: "mirror-attachments-audit-summary is-error",
        text: "校验失败，请查看开发者控制台。"
      });
      return;
    }

    panelEl.empty();

    if (!audit.supported) {
      panelEl.createEl("div", {
        cls: "mirror-attachments-audit-summary is-warning",
        text: "当前目录模式不支持一对一校验。"
      });
      return;
    }

    const issueCount =
      audit.missing.length + audit.extra.length + audit.conflicts.length;

    panelEl.createEl("div", {
      cls:
        "mirror-attachments-audit-summary " +
        (issueCount ? "is-warning" : "is-ok"),
      text: issueCount
        ? `发现 ${issueCount} 个问题：缺失 ${audit.missing.length}，多余 ${audit.extra.length}，冲突 ${audit.conflicts.length}。`
        : `校验正常：${audit.notesCount} 个 Markdown 与 ${audit.expectedCount} 个附件目录一一对应。`
    });

    if (audit.missing.length) {
      this.renderAuditGroup(
        panelEl,
        "缺失目录",
        audit.missing.map(
          (item) => `${item.notePath}  →  ${item.folderPath}`
        ),
        "is-missing"
      );
    }

    if (audit.extra.length) {
      this.renderAuditGroup(
        panelEl,
        "多余目录",
        audit.extra.map((item) => item.folderPath),
        "is-extra"
      );
    }

    if (audit.conflicts.length) {
      this.renderAuditGroup(
        panelEl,
        "路径冲突（需手动处理）",
        audit.conflicts.map(
          (item) => `${item.folderPath} — ${item.reason}`
        ),
        "is-conflict"
      );
    }
  }

  renderAuditGroup(panelEl, title, items, className) {
    const group = panelEl.createDiv({
      cls: `mirror-attachments-audit-group ${className}`
    });
    group.createEl("div", {
      cls: "mirror-attachments-audit-group-title",
      text: `${title}（${items.length}）`
    });

    const list = group.createEl("ul");
    for (const item of items) {
      list.createEl("li", { text: item });
    }
  }
}

/*
 * xyblue135 私人 · 代码块增强
 * 类型：xyblue135 私人插件（非公共发布版）
 * 说明：用户可见文案与维护注释已中文化；内部插件 ID 与 data.json 保持不变，以兼容原有设置和数据。
 */
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const obsidian_1 = require("obsidian");
const DEFAULT_SETTINGS = {
    wrapEnabled: false,
    styleMode: 'dark',
    showToolbarMarker: true,
    overrideCodeBackground: true,
    toolbarHeight: 20,
    copyButtonSize: 16,
    copyIconSize: 6,
    codePaddingVertical: 8,
    codePaddingHorizontal: 12,
    borderRadius: 7,
    scrollbarHeight: 6,
    codeBackground: '#10141b',
    toolbarBackground: '#171c24',
    borderColor: '#2a3140',
    codeTextColor: '#d7dde8',
    mutedColor: '#8994a6',
    hoverColor: '#252c39',
    accentColor: '#7aa2f7',
};
/**
 * xyblue135 私人 · 代码块增强 v1.2.0
 * - 保留 v1.1.4 的安全滚动条实现。
 * - 新增设置页和实时可调紧凑深色 UI。
 */
class CodeBlockWrapTogglePlugin extends obsidian_1.Plugin {
    constructor() {
        super(...arguments);
        this.settings = { ...DEFAULT_SETTINGS };
        this.syncingScroll = false;
        this.lineToScrollbar = new WeakMap();
        this.scrollbarToLines = new WeakMap();
        this.endLineToScrollbar = new WeakMap();
        this.lineHandlers = new Map();
        this.scrollbarHandlers = new Map();
    }
    async onload() {
        await this.loadSettings();
        this.applySettings();
        this.ribbonEl = this.addRibbonIcon('wrap-text', '代码块自动换行', () => void this.toggleCodeWrap());
        this.addCommand({
            id: 'toggle-code-block-wrap',
            name: '切换代码块自动换行',
            callback: () => void this.toggleCodeWrap(),
        });
        this.addSettingTab(new CodeBlockWrapSettingTab(this.app, this));
        this.updateRibbonState();
        this.editorObserver = new MutationObserver(() => this.scheduleEditorScrollbarSync());
        const workspaceRoot = document.querySelector('.workspace') ?? document.body;
        this.editorObserver.observe(workspaceRoot, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'style'],
        });
        this.registerDomEvent(window, 'resize', () => this.scheduleEditorScrollbarSync());
        this.registerDomEvent(document, 'scroll', () => this.scheduleEditorScrollbarSync(), true);
        this.scheduleEditorScrollbarSync();
    }
    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }
    async saveSettings() {
        await this.saveData(this.settings);
        this.applySettings();
    }
    applySettings() {
        const body = document.body;
        body.classList.toggle('xyblue135-code-wrap-enabled', this.settings.wrapEnabled);
        body.classList.toggle('xyblue135-code-custom-dark', this.settings.styleMode === 'dark');
        body.classList.toggle('xyblue135-code-hide-marker', !this.settings.showToolbarMarker);
        body.classList.toggle('xyblue135-code-bg-override', this.settings.overrideCodeBackground);
        const vars = {
            '--xy-code-toolbar-height': `${this.settings.toolbarHeight}px`,
            '--xy-code-copy-button-size': `${this.settings.copyButtonSize}px`,
            '--xy-code-copy-icon-size': `${this.settings.copyIconSize}px`,
            '--xy-code-padding-v': `${this.settings.codePaddingVertical}px`,
            '--xy-code-padding-h': `${this.settings.codePaddingHorizontal}px`,
            '--xy-code-radius': `${this.settings.borderRadius}px`,
            '--xy-code-scrollbar-height': `${this.settings.scrollbarHeight}px`,
            '--xy-code-bg-custom': this.settings.codeBackground,
            '--xy-code-toolbar-bg-custom': this.settings.toolbarBackground,
            '--xy-code-border-custom': this.settings.borderColor,
            '--xy-code-text-custom': this.settings.codeTextColor,
            '--xy-code-muted-custom': this.settings.mutedColor,
            '--xy-code-hover-custom': this.settings.hoverColor,
            '--xy-code-accent-custom': this.settings.accentColor,
        };
        for (const [name, value] of Object.entries(vars))
            body.style.setProperty(name, value);
        this.updateRibbonState();
        this.scheduleEditorScrollbarSync();
    }
    async resetSettings() {
        this.settings = { ...DEFAULT_SETTINGS };
        await this.saveSettings();
    }
    async toggleCodeWrap() {
        this.settings.wrapEnabled = !this.settings.wrapEnabled;
        await this.saveSettings();
        new obsidian_1.Notice(`代码块自动换行：${this.settings.wrapEnabled ? '开启' : '关闭'}`, 1500);
    }
    updateRibbonState() {
        if (!this.ribbonEl)
            return;
        const label = `代码块自动换行：${this.settings.wrapEnabled ? '开启' : '关闭'}`;
        this.ribbonEl.setAttribute('aria-label', label);
        this.ribbonEl.setAttribute('data-tooltip-position', 'right');
        this.ribbonEl.classList.toggle('xyblue135-code-wrap-active', this.settings.wrapEnabled);
    }
    scheduleEditorScrollbarSync() {
        if (this.syncRaf !== undefined)
            return;
        this.syncRaf = window.requestAnimationFrame(() => {
            this.syncRaf = undefined;
            this.syncEditorCodeBlockScrollbars();
        });
    }
    syncEditorCodeBlockScrollbars() {
        const allLines = Array.from(document.querySelectorAll('.markdown-source-view.mod-cm6 .cm-line.HyperMD-codeblock'));
        const activeLines = new Set(allLines);
        const activeScrollbars = new Set();
        for (const [line, handler] of this.lineHandlers) {
            if (!activeLines.has(line) || !line.isConnected) {
                line.removeEventListener('scroll', handler);
                this.lineHandlers.delete(line);
            }
        }
        let currentBlock = [];
        let insideBlock = false;
        const finishBlock = () => {
            if (currentBlock.length < 2) {
                currentBlock = [];
                insideBlock = false;
                return;
            }
            const endLine = currentBlock[currentBlock.length - 1];
            const hasExplicitEnd = endLine.classList.contains('HyperMD-codeblock-end');
            const contentLines = currentBlock.filter((line) => !line.classList.contains('HyperMD-codeblock-begin') &&
                !line.classList.contains('HyperMD-codeblock-end'));
            if (hasExplicitEnd && contentLines.length > 0) {
                const scrollbar = this.ensureOverlayScrollbar(endLine);
                const inner = scrollbar.firstElementChild;
                this.scrollbarToLines.set(scrollbar, contentLines);
                for (const line of contentLines) {
                    this.lineToScrollbar.set(line, scrollbar);
                    this.ensureLineScrollHandler(line);
                }
                this.ensureScrollbarHandler(scrollbar);
                activeScrollbars.add(scrollbar);
                if (this.settings.wrapEnabled) {
                    scrollbar.scrollLeft = 0;
                    for (const line of contentLines)
                        line.scrollLeft = 0;
                    scrollbar.classList.add('is-not-needed');
                }
                else {
                    scrollbar.classList.remove('is-not-needed');
                    const visible = this.positionOverlayScrollbar(scrollbar, endLine);
                    scrollbar.classList.toggle('is-outside-editor', !visible);
                    const viewportWidth = scrollbar.clientWidth;
                    const maxContentWidth = Math.max(viewportWidth, ...contentLines.map((line) => line.scrollWidth));
                    inner.style.width = `${Math.ceil(maxContentWidth)}px`;
                    const needsScrollbar = visible && maxContentWidth > viewportWidth + 1;
                    scrollbar.classList.toggle('is-not-needed', !needsScrollbar);
                    if (needsScrollbar) {
                        const maxLeft = Math.max(0, maxContentWidth - viewportWidth);
                        const left = Math.min(scrollbar.scrollLeft, maxLeft);
                        scrollbar.scrollLeft = left;
                        for (const line of contentLines)
                            line.scrollLeft = left;
                    }
                    else if (maxContentWidth <= viewportWidth + 1) {
                        scrollbar.scrollLeft = 0;
                        for (const line of contentLines)
                            line.scrollLeft = 0;
                    }
                }
            }
            currentBlock = [];
            insideBlock = false;
        };
        for (const line of allLines) {
            const isBegin = line.classList.contains('HyperMD-codeblock-begin');
            const isEnd = line.classList.contains('HyperMD-codeblock-end');
            if (isBegin) {
                if (insideBlock && currentBlock.length > 0)
                    finishBlock();
                insideBlock = true;
                currentBlock = [line];
            }
            else if (insideBlock) {
                currentBlock.push(line);
            }
            if (insideBlock && isEnd)
                finishBlock();
        }
        if (insideBlock)
            finishBlock();
        for (const [scrollbar, handler] of this.scrollbarHandlers) {
            if (!activeScrollbars.has(scrollbar) || !scrollbar.isConnected) {
                scrollbar.removeEventListener('scroll', handler);
                this.scrollbarHandlers.delete(scrollbar);
                if (scrollbar.isConnected)
                    scrollbar.remove();
            }
        }
        document.querySelectorAll('body > .xyblue135-codeblock-scrollbar-overlay').forEach((scrollbar) => {
            if (!activeScrollbars.has(scrollbar))
                scrollbar.remove();
        });
    }
    ensureOverlayScrollbar(endLine) {
        const existing = this.endLineToScrollbar.get(endLine);
        if (existing?.isConnected)
            return existing;
        const scrollbar = document.createElement('div');
        scrollbar.className = 'xyblue135-codeblock-scrollbar-overlay';
        scrollbar.setAttribute('aria-hidden', 'true');
        const inner = document.createElement('div');
        inner.className = 'xyblue135-codeblock-scrollbar-inner';
        scrollbar.appendChild(inner);
        document.body.appendChild(scrollbar);
        this.endLineToScrollbar.set(endLine, scrollbar);
        return scrollbar;
    }
    positionOverlayScrollbar(scrollbar, endLine) {
        const sourceView = endLine.closest('.markdown-source-view.mod-cm6');
        const scroller = sourceView?.querySelector('.cm-scroller');
        if (!sourceView || !scroller || !sourceView.isConnected || !endLine.isConnected)
            return false;
        const lineRect = endLine.getBoundingClientRect();
        const scrollerRect = scroller.getBoundingClientRect();
        const verticallyVisible = lineRect.bottom > scrollerRect.top && lineRect.top < scrollerRect.bottom;
        if (!verticallyVisible)
            return false;
        const left = Math.max(lineRect.left, scrollerRect.left);
        const right = Math.min(lineRect.right, scrollerRect.right);
        const width = Math.max(0, right - left);
        if (width <= 1)
            return false;
        const height = Math.max(4, this.settings.scrollbarHeight + 2);
        const top = Math.min(lineRect.bottom - height, scrollerRect.bottom - height);
        scrollbar.style.left = `${Math.round(left)}px`;
        scrollbar.style.top = `${Math.round(top)}px`;
        scrollbar.style.width = `${Math.round(width)}px`;
        return true;
    }
    ensureScrollbarHandler(scrollbar) {
        if (this.scrollbarHandlers.has(scrollbar))
            return;
        const handler = () => {
            if (this.syncingScroll || this.settings.wrapEnabled)
                return;
            this.syncingScroll = true;
            const lines = this.scrollbarToLines.get(scrollbar) ?? [];
            const left = scrollbar.scrollLeft;
            for (const line of lines)
                line.scrollLeft = left;
            this.syncingScroll = false;
        };
        scrollbar.addEventListener('scroll', handler, { passive: true });
        this.scrollbarHandlers.set(scrollbar, handler);
    }
    ensureLineScrollHandler(line) {
        if (this.lineHandlers.has(line))
            return;
        const handler = () => {
            if (this.syncingScroll || this.settings.wrapEnabled)
                return;
            const scrollbar = this.lineToScrollbar.get(line);
            if (!scrollbar)
                return;
            this.syncingScroll = true;
            const left = line.scrollLeft;
            scrollbar.scrollLeft = left;
            const lines = this.scrollbarToLines.get(scrollbar) ?? [];
            for (const peer of lines)
                if (peer !== line)
                    peer.scrollLeft = left;
            this.syncingScroll = false;
        };
        line.addEventListener('scroll', handler, { passive: true });
        this.lineHandlers.set(line, handler);
    }
    onunload() {
        document.body.classList.remove('xyblue135-code-wrap-enabled', 'xyblue135-code-custom-dark', 'xyblue135-code-hide-marker', 'xyblue135-code-bg-override');
        const vars = [
            '--xy-code-toolbar-height', '--xy-code-copy-button-size', '--xy-code-copy-icon-size',
            '--xy-code-padding-v', '--xy-code-padding-h', '--xy-code-radius', '--xy-code-scrollbar-height',
            '--xy-code-bg-custom', '--xy-code-toolbar-bg-custom', '--xy-code-border-custom', '--xy-code-text-custom',
            '--xy-code-muted-custom', '--xy-code-hover-custom', '--xy-code-accent-custom'
        ];
        for (const name of vars)
            document.body.style.removeProperty(name);
        this.editorObserver?.disconnect();
        if (this.syncRaf !== undefined)
            window.cancelAnimationFrame(this.syncRaf);
        for (const [line, handler] of this.lineHandlers) {
            line.removeEventListener('scroll', handler);
            line.scrollLeft = 0;
        }
        this.lineHandlers.clear();
        for (const [scrollbar, handler] of this.scrollbarHandlers)
            scrollbar.removeEventListener('scroll', handler);
        this.scrollbarHandlers.clear();
        document.querySelectorAll('body > .xyblue135-codeblock-scrollbar-overlay').forEach((el) => el.remove());
    }
}
class CodeBlockWrapSettingTab extends obsidian_1.PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }
    display() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: 'xyblue135 私人 · 代码块增强' });
        containerEl.createEl('p', {
            text: '调整后会实时应用到当前代码块。默认采用紧凑深色样式，所有参数都会自动保存。',
            cls: 'setting-item-description',
        });
        containerEl.createEl('h3', { text: '显示行为' });
        new obsidian_1.Setting(containerEl)
            .setName('代码块自动换行')
            .setDesc('关闭时长代码保持单行，并在底部使用横向滚动条。')
            .addToggle((toggle) => toggle.setValue(this.plugin.settings.wrapEnabled).onChange(async (value) => {
            this.plugin.settings.wrapEnabled = value;
            await this.plugin.saveSettings();
        }));
        new obsidian_1.Setting(containerEl)
            .setName('样式模式')
            .setDesc('“紧凑深色”使用下面的自定义颜色；“跟随主题”继续使用 Obsidian 当前主题颜色。')
            .addDropdown((dropdown) => dropdown
            .addOption('dark', '紧凑深色')
            .addOption('theme', '跟随 Obsidian 主题')
            .setValue(this.plugin.settings.styleMode)
            .onChange(async (value) => {
            this.plugin.settings.styleMode = value;
            await this.plugin.saveSettings();
        }));
        new obsidian_1.Setting(containerEl)
            .setName('显示左侧 >_ 标记')
            .setDesc('关闭后顶部细条更简洁，只保留右侧复制按钮。')
            .addToggle((toggle) => toggle.setValue(this.plugin.settings.showToolbarMarker).onChange(async (value) => {
            this.plugin.settings.showToolbarMarker = value;
            await this.plugin.saveSettings();
        }));
        new obsidian_1.Setting(containerEl)
            .setName('自定义代码块背景')
            .setDesc('开启后，代码正文背景色会独立覆盖当前 Obsidian 主题；下面的“代码块背景颜色”始终可以调整。')
            .addToggle((toggle) => toggle.setValue(this.plugin.settings.overrideCodeBackground).onChange(async (value) => {
            this.plugin.settings.overrideCodeBackground = value;
            await this.plugin.saveSettings();
        }));
        containerEl.createEl('h3', { text: '尺寸与紧凑度' });
        this.addSlider(containerEl, '工具栏高度', '顶部细条高度。推荐 18–22 px。', 'toolbarHeight', 16, 32, 1, ' px');
        this.addSlider(containerEl, '复制按钮大小', '右上角复制按钮点击区域。', 'copyButtonSize', 14, 26, 1, ' px');
        this.addSlider(containerEl, '复制图标大小', '按钮内部重叠方框图标大小。', 'copyIconSize', 4, 9, 1, ' px');
        this.addSlider(containerEl, '代码上下内边距', '控制代码块垂直紧凑程度。', 'codePaddingVertical', 4, 16, 1, ' px');
        this.addSlider(containerEl, '代码左右内边距', '控制代码与边框之间的左右距离。', 'codePaddingHorizontal', 6, 20, 1, ' px');
        this.addSlider(containerEl, '代码块圆角', '0 为直角，数值越大越圆润。', 'borderRadius', 0, 14, 1, ' px');
        this.addSlider(containerEl, '横向滚动条高度', '超长代码底部滚动条厚度。', 'scrollbarHeight', 4, 10, 1, ' px');
        containerEl.createEl('h3', { text: '颜色与背景' });
        this.addColor(containerEl, '代码块背景颜色', 'codeBackground');
        this.addColor(containerEl, '工具栏背景', 'toolbarBackground');
        this.addColor(containerEl, '边框颜色', 'borderColor');
        this.addColor(containerEl, '代码文字颜色', 'codeTextColor');
        this.addColor(containerEl, '弱化文字 / 图标', 'mutedColor');
        this.addColor(containerEl, '按钮悬停背景', 'hoverColor');
        this.addColor(containerEl, '启用状态强调色', 'accentColor');
        new obsidian_1.Setting(containerEl)
            .setName('恢复推荐默认值')
            .setDesc('恢复紧凑深色默认参数，不影响 Markdown 内容。')
            .addButton((button) => button.setButtonText('恢复默认').onClick(async () => {
            await this.plugin.resetSettings();
            this.display();
            new obsidian_1.Notice('已恢复推荐默认值', 1500);
        }));
    }
    addSlider(containerEl, name, desc, key, min, max, step, unit) {
        const setting = new obsidian_1.Setting(containerEl).setName(name).setDesc(desc);
        setting.addSlider((slider) => {
            slider.setLimits(min, max, step).setValue(this.plugin.settings[key]).setDynamicTooltip();
            slider.onChange(async (value) => {
                this.plugin.settings[key] = value;
                await this.plugin.saveSettings();
                const extra = setting.controlEl.querySelector('.xyblue135-setting-value');
                if (extra)
                    extra.textContent = `${value}${unit}`;
            });
        });
        setting.controlEl.createSpan({ text: `${this.plugin.settings[key]}${unit}`, cls: 'xyblue135-setting-value' });
    }
    addColor(containerEl, name, key) {
        const setting = new obsidian_1.Setting(containerEl).setName(name);
        let textControl;
        let pickerControl;
        setting.addColorPicker((picker) => {
            pickerControl = picker;
            picker.setValue(this.plugin.settings[key]).onChange(async (value) => {
                this.plugin.settings[key] = value;
                textControl?.setValue(value);
                await this.plugin.saveSettings();
            });
        });
        setting.addText((text) => {
            textControl = text;
            text.setPlaceholder('#10141b')
                .setValue(this.plugin.settings[key])
                .onChange(async (value) => {
                const normalized = value.trim();
                if (!/^#[0-9a-fA-F]{6}$/.test(normalized))
                    return;
                this.plugin.settings[key] = normalized;
                pickerControl?.setValue(normalized);
                await this.plugin.saveSettings();
            });
            text.inputEl.addClass('xyblue135-color-hex-input');
            text.inputEl.setAttribute('aria-label', `${name} HEX`);
        });
    }
}

module.exports = CodeBlockWrapTogglePlugin;

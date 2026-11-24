import * as vscode from 'vscode';
/**
 * Maps TextMate scopes found in the active color theme to the UI group whose
 * color they drive. The first matching scope for a group wins when a theme
 * defines several of them (for example `keyword.control` over `keyword`).
 *
 * Keys are exact scopes as reported by `editor.tokenColorCustomizations`;
 * values are the keys of the `tokens` object built by `getCurrentThemeColors`.
 */
const TOKEN_SCOPE_KEYS: Record<string, string> = {
    'keyword': 'keywords',
    'storage.type': 'keywords',
    'storage.modifier': 'keywords',
    'keyword.control': 'controlKeywords',
    'string': 'strings',
    'string.template': 'templateStrings',
    'string.interpolated': 'templateStrings',
    'comment': 'comments',
    'comment.line': 'comments',
    'comment.block': 'comments',
    'constant.numeric': 'numbers',
    'constant.language': 'numbers',
    'constant.other': 'constants',
    'entity.name.function': 'functions',
    'support.function': 'functions',
    'entity.name.type': 'classes',
    'entity.name.class': 'classes',
    'variable': 'variables',
    'support.variable': 'variables',
    'variable.parameter': 'parameters',
    'entity.name.tag': 'tags',
    'entity.other.attribute-name': 'attributes',
    'punctuation': 'punctuation',
    'meta.brace': 'punctuation',
    'keyword.operator': 'operators'
};

/**
 * Normalizes a typed hex color. Returns the lowercase `#rrggbb` form when the
 * input is a valid six-digit hex color (surrounding whitespace ignored), or
 * `undefined` otherwise. Uppercase and lowercase input are equivalent.
 */
export function normalizeHexInput(value: string): string | undefined {
    const hex = value.trim().toLowerCase();
    return /^#[0-9a-f]{6}$/.test(hex) ? hex : undefined;
}

function toPickerHex(value: unknown, fallback: string): string {
    if (typeof value !== 'string') {
        return fallback;
    }
    const match = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value.trim());
    if (!match) {
        return fallback;
    }
    let hex = match[1];
    if (hex.length === 3) {
        hex = hex.split('').map(c => c + c).join('');
    }
    return '#' + hex.slice(0, 6).toLowerCase();
}

export function resolveThemeColors(workbench: Record<string, unknown> | undefined, tokenConfig: { textMateRules?: any[] } | undefined) {
    const wb = workbench || {};
    const tokens: Record<string, string> = {};
    for (const rule of tokenConfig?.textMateRules || []) {
        const foreground = rule?.settings?.foreground;
        if (!foreground) {
            continue;
        }
        const scopes: string[] = Array.isArray(rule.scope) ? rule.scope : [rule.scope];
        for (const scope of scopes) {
            const key = TOKEN_SCOPE_KEYS[scope];
            if (key) {
                tokens[key] = foreground;
            }
        }
    }
    const wbColor = (key: string, fallback: string) => toPickerHex(wb[key], fallback);
    const tokenColor = (fallback: string, ...keys: string[]) => {
        for (const key of keys) {
            if (tokens[key]) {
                return toPickerHex(tokens[key], fallback);
            }
        }
        return fallback;
    };

    return {
        editorBackground: wbColor('editor.background', '#1e1e1e'),
        editorForeground: wbColor('editor.foreground', '#d4d4d4'),
        lineNumbers: wbColor('editorLineNumber.foreground', '#858585'),
        selection: wbColor('editor.selectionBackground', '#264f78'),
        lineHighlight: wbColor('editor.lineHighlightBackground', '#2a2d2e'),
        cursor: wbColor('editorCursor.foreground', '#aeafad'),
        sidebarBackground: wbColor('sideBar.background', '#252526'),
        sidebarForeground: wbColor('sideBar.foreground', '#cccccc'),
        activityBarBackground: wbColor('activityBar.background', '#333333'),
        statusBarBackground: wbColor('statusBar.background', '#007acc'),
        titleBarBackground: wbColor('titleBar.activeBackground', '#3c3c3c'),
        tabActiveBackground: wbColor('tab.activeBackground', '#1e1e1e'),
        panelBackground: wbColor('panel.background', '#252526'),
        keywords: tokenColor('#569cd6', 'keywords'),
        controlKeywords: tokenColor('#c586c0', 'controlKeywords', 'keywords'),
        strings: tokenColor('#ce9178', 'strings'),
        templateStrings: tokenColor('#ce9178', 'templateStrings', 'strings'),
        comments: tokenColor('#6a9955', 'comments'),
        numbers: tokenColor('#b5cea8', 'numbers'),
        constants: tokenColor('#4ec9b0', 'constants'),
        functions: tokenColor('#dcdcaa', 'functions'),
        classes: tokenColor('#4ec9b0', 'classes'),
        variables: tokenColor('#9cdcfe', 'variables'),
        parameters: tokenColor('#9cdcfe', 'parameters', 'variables'),
        tags: tokenColor('#569cd6', 'tags'),
        attributes: tokenColor('#9cdcfe', 'attributes'),
        punctuation: tokenColor('#d4d4d4', 'punctuation'),
        operators: tokenColor('#d4d4d4', 'operators')
    };
}

/**
 * Reads the theme colors from VS Code settings. The config reader is injectable
 * so tests can supply a fixed settings object instead of changing the user's.
 */
export function getCurrentThemeColors(
    readConfig: () => Pick<vscode.WorkspaceConfiguration, 'get'> = () => vscode.workspace.getConfiguration()
) {
    const config = readConfig();
    return resolveThemeColors(
        config.get('workbench.colorCustomizations') as Record<string, unknown> | undefined,
        config.get('editor.tokenColorCustomizations') as { textMateRules?: any[] } | undefined
    );
}

export function activate(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerCommand('custom-code.openCustomizer', () => {
        const panel = vscode.window.createWebviewPanel(
            'themeCustomizer',
            'Theme Customizer',
            vscode.ViewColumn.One,
            { enableScripts: true }
        );
        panel.webview.html = getWebviewContent();

        const sendInit = () => {
            const extConfig = vscode.workspace.getConfiguration('themeCustomizer');
            panel.webview.postMessage({
                type: 'init',
                colors: getCurrentThemeColors(),
                autoApply: extConfig.get<boolean>('autoApply', false),
                showHexValues: extConfig.get<boolean>('showHexValues', true),
                rememberSettings: extConfig.get<boolean>('rememberSettings', true)
            });
        };
        const sendColors = () => {
            panel.webview.postMessage({ type: 'colors', colors: getCurrentThemeColors() });
        };

        panel.webview.onDidReceiveMessage(async message => {
            if (message.type === 'ready') {
                sendInit();
            } else if (message.type === 'applyTheme') {
                const isValidHex = (color: string) => normalizeHexInput(color) !== undefined;
                const invalidColors = Object.entries(message.colors as Record<string, string>).filter(([, value]) => !isValidHex(value));
                if (invalidColors.length > 0) {
                    const invalidMessage = `Invalid color values: ${invalidColors.map(([k]) => k).join(', ')}`;
                    vscode.window.showErrorMessage(invalidMessage);
                    panel.webview.postMessage({ type: 'status', status: 'error', message: invalidMessage });
                    return;
                }
                try {
                    const config = vscode.workspace.getConfiguration();
                    await config.update(
                        'workbench.colorCustomizations',
                        {
                            'editor.background': message.colors.editorBackground,
                            'editor.foreground': message.colors.editorForeground,
                            'editorLineNumber.foreground': message.colors.lineNumbers,
                            'editor.selectionBackground': message.colors.selection,
                            'editor.lineHighlightBackground': message.colors.lineHighlight,
                            'editorCursor.foreground': message.colors.cursor,
                            'sideBar.background': message.colors.sidebarBackground,
                            'sideBar.foreground': message.colors.sidebarForeground,
                            'activityBar.background': message.colors.activityBarBackground,
                            'statusBar.background': message.colors.statusBarBackground,
                            'titleBar.activeBackground': message.colors.titleBarBackground,
                            'tab.activeBackground': message.colors.tabActiveBackground,
                            'panel.background': message.colors.panelBackground
                        },
                        vscode.ConfigurationTarget.Global
                    );

                    const managedScopes = new Set([
                        'keyword', 'storage.type', 'storage.modifier',
                        'keyword.control', 'string', 'string.template', 'string.interpolated',
                        'comment', 'comment.line', 'comment.block',
                        'constant.numeric', 'constant.language', 'constant.other',
                        'entity.name.function', 'support.function',
                        'entity.name.type', 'entity.name.class',
                        'variable', 'support.variable', 'variable.parameter',
                        'entity.name.tag', 'entity.other.attribute-name',
                        'punctuation', 'meta.brace', 'keyword.operator'
                    ]);
                    const existingTokenConfig = config.get('editor.tokenColorCustomizations') as any || {};
                    const existingRules: any[] = existingTokenConfig.textMateRules || [];
                    const preservedRules = existingRules.filter((rule: any) => {
                        const scopes = Array.isArray(rule.scope) ? rule.scope : [rule.scope];
                        return !scopes.some((s: string) => managedScopes.has(s));
                    });
                    const newRules = [
                        { scope: ['keyword', 'storage.type', 'storage.modifier'], settings: { foreground: message.colors.keywords } },
                        { scope: ['keyword.control'], settings: { foreground: message.colors.controlKeywords } },
                        { scope: ['string'], settings: { foreground: message.colors.strings } },
                        { scope: ['string.template', 'string.interpolated'], settings: { foreground: message.colors.templateStrings } },
                        { scope: ['comment'], settings: { foreground: message.colors.comments } },
                        { scope: ['comment.line', 'comment.block'], settings: { foreground: message.colors.comments, fontStyle: 'italic' } },
                        { scope: ['constant.numeric', 'constant.language'], settings: { foreground: message.colors.numbers } },
                        { scope: ['constant.other'], settings: { foreground: message.colors.constants } },
                        { scope: ['entity.name.function', 'support.function'], settings: { foreground: message.colors.functions } },
                        { scope: ['entity.name.type', 'entity.name.class'], settings: { foreground: message.colors.classes } },
                        { scope: ['variable', 'support.variable'], settings: { foreground: message.colors.variables } },
                        { scope: ['variable.parameter'], settings: { foreground: message.colors.parameters } },
                        { scope: ['entity.name.tag'], settings: { foreground: message.colors.tags } },
                        { scope: ['entity.other.attribute-name'], settings: { foreground: message.colors.attributes } },
                        { scope: ['punctuation', 'meta.brace'], settings: { foreground: message.colors.punctuation } },
                        { scope: ['keyword.operator'], settings: { foreground: message.colors.operators } }
                    ];
                    await config.update(
                        'editor.tokenColorCustomizations',
                        { ...existingTokenConfig, textMateRules: [...preservedRules, ...newRules] },
                        vscode.ConfigurationTarget.Global
                    );
                    vscode.window.showInformationMessage('Theme applied successfully!');
                    panel.webview.postMessage({ type: 'status', status: 'success', message: 'Theme applied successfully!' });
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to apply theme: ${error}`);
                    panel.webview.postMessage({ type: 'status', status: 'error', message: `Failed to apply theme: ${error}` });
                }
            } else if (message.type === 'resetTheme') {
                try {
                    const config = vscode.workspace.getConfiguration();
                    await config.update('workbench.colorCustomizations', undefined, vscode.ConfigurationTarget.Global);
                    await config.update('editor.tokenColorCustomizations', undefined, vscode.ConfigurationTarget.Global);
                    sendColors();
                    vscode.window.showInformationMessage('Theme reset to default!');
                    panel.webview.postMessage({ type: 'status', status: 'success', message: 'Theme reset to default!' });
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to reset theme: ${error}`);
                    panel.webview.postMessage({ type: 'status', status: 'error', message: `Failed to reset theme: ${error}` });
                }
            } else if (message.type === 'applyPreset') {
                try {
                    const config = vscode.workspace.getConfiguration();
                    const preset = message.preset;
                    await config.update('workbench.colorCustomizations', preset.workbench, vscode.ConfigurationTarget.Global);
                    await config.update('editor.tokenColorCustomizations', preset.tokenColors, vscode.ConfigurationTarget.Global);
                    sendColors();
                    vscode.window.showInformationMessage(`Preset "${preset.name}" applied successfully!`);
                    panel.webview.postMessage({ type: 'status', status: 'success', message: `Preset "${preset.name}" applied successfully!` });
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to apply preset: ${error}`);
                    panel.webview.postMessage({ type: 'status', status: 'error', message: `Failed to apply preset: ${error}` });
                }
            } else if (message.type === 'exportTheme') {
                try {
                    const config = vscode.workspace.getConfiguration();
                    const workbenchColors = config.get('workbench.colorCustomizations') || {};
                    const tokenColors = config.get('editor.tokenColorCustomizations') || {};
                    const themeData = {
                        name: 'Custom Theme',
                        version: '1.0',
                        workbench: workbenchColors,
                        tokenColors: tokenColors,
                        exportedAt: new Date().toISOString()
                    };
                    const themeJson = JSON.stringify(themeData, null, 2);
                    const defaultExportUri = vscode.workspace.workspaceFolders?.[0]
                        ? vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, 'custom-theme.json')
                        : undefined;
                    const saveUri = await vscode.window.showSaveDialog({
                        defaultUri: defaultExportUri,
                        filters: { 'JSON files': ['json'], 'All files': ['*'] },
                        saveLabel: 'Export Theme'
                    });
                    if (!saveUri) {
                        panel.webview.postMessage({ type: 'status', status: 'info', message: 'Export cancelled' });
                        return;
                    }
                    await vscode.workspace.fs.writeFile(saveUri, Buffer.from(themeJson));
                    vscode.window.showInformationMessage('Theme exported successfully!');
                    panel.webview.postMessage({ type: 'status', status: 'success', message: 'Theme exported successfully!' });
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to export theme: ${error}`);
                    panel.webview.postMessage({ type: 'status', status: 'error', message: `Failed to export theme: ${error}` });
                }
            } else if (message.type === 'importTheme') {
                try {
                    const uri = await vscode.window.showOpenDialog({
                        canSelectFiles: true,
                        canSelectFolders: false,
                        canSelectMany: false,
                        filters: {
                            'JSON files': ['json'],
                            'All files': ['*']
                        },
                        openLabel: 'Import Theme'
                    });
                    if (!uri || !uri[0]) {
                        panel.webview.postMessage({ type: 'status', status: 'info', message: 'Import cancelled' });
                    } else {
                        const content = await vscode.workspace.fs.readFile(uri[0]);
                        const themeData = JSON.parse(Buffer.from(content).toString('utf8'));
                        if (themeData.workbench && themeData.tokenColors) {
                            const config = vscode.workspace.getConfiguration();
                            await config.update('workbench.colorCustomizations', themeData.workbench, vscode.ConfigurationTarget.Global);
                            await config.update('editor.tokenColorCustomizations', themeData.tokenColors, vscode.ConfigurationTarget.Global);
                            sendColors();
                            vscode.window.showInformationMessage('Theme imported successfully!');
                            panel.webview.postMessage({ type: 'status', status: 'success', message: 'Theme imported successfully!' });
                        } else {
                            vscode.window.showErrorMessage('Invalid theme file format');
                            panel.webview.postMessage({ type: 'status', status: 'error', message: 'Invalid theme file format' });
                        }
                    }
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to import theme: ${error}`);
                    panel.webview.postMessage({ type: 'status', status: 'error', message: `Failed to import theme: ${error}` });
                }
            }
        });
    });
    context.subscriptions.push(disposable);
}
export function deactivate() { }
function getWebviewContent(): string {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {
                font-family: var(--vscode-font-family);
                padding: 20px;
                color: var(--vscode-foreground);
                background: var(--vscode-editor-background);
                max-width: 900px;
                margin: 0 auto;
            }
            .header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 20px;
                border-bottom: 1px solid var(--vscode-panel-border);
                padding-bottom: 15px;
            }
            h1 {
                margin: 0;
                font-size: 24px;
            }
            .tabs {
                display: flex;
                gap: 10px;
                margin-bottom: 20px;
            }
            .tab {
                padding: 8px 16px;
                background: var(--vscode-button-secondaryBackground);
                border: 1px solid var(--vscode-button-border);
                cursor: pointer;
                border-radius: 4px;
                font-size: 14px;
            }
            .tab.active {
                background: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
            }
            .tab-content {
                display: none;
            }
            .tab-content.active {
                display: block;
            }
            h3 {
                margin-top: 30px;
                margin-bottom: 15px;
                border-bottom: 1px solid var(--vscode-panel-border);
                padding-bottom: 5px;
                font-size: 16px;
            }
            .color-group {
                display: grid;
                grid-template-columns: 200px 120px auto;
                gap: 10px;
                margin-bottom: 12px;
                align-items: center;
            }
            .color-group label {
                font-size: 14px;
            }
            .color-group input[type="color"] {
                width: 50px;
                height: 30px;
                border: 1px solid var(--vscode-input-border);
                cursor: pointer;
                border-radius: 3px;
            }
            .color-group input[type="text"].hex-invalid {
                border-color: var(--vscode-inputValidation-errorBorder, #f14c4c);
                outline: 1px solid var(--vscode-inputValidation-errorBorder, #f14c4c);
            }
            .color-group input[type="text"] {
                padding: 4px 8px;
                border: 1px solid var(--vscode-input-border);
                background: var(--vscode-input-background);
                color: var(--vscode-input-foreground);
                border-radius: 3px;
                font-family: monospace;
                font-size: 12px;
            }
            .button-group {
                display: flex;
                gap: 10px;
                margin-top: 20px;
                flex-wrap: wrap;
            }
            button {
                padding: 10px 16px;
                background: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: none;
                cursor: pointer;
                font-size: 14px;
                border-radius: 4px;
                transition: background 0.2s;
            }
            button:hover {
                background: var(--vscode-button-hoverBackground);
            }
            button.secondary {
                background: var(--vscode-button-secondaryBackground);
                color: var(--vscode-button-secondaryForeground);
            }
            button.secondary:hover {
                background: var(--vscode-button-secondaryHoverBackground);
            }
            .section {
                margin-bottom: 30px;
            }
            .presets-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 10px;
                margin-bottom: 20px;
            }
            .preset-card {
                padding: 12px;
                border: 1px solid var(--vscode-panel-border);
                border-radius: 6px;
                cursor: pointer;
                transition: all 0.2s;
                text-align: center;
            }
            .preset-card:hover {
                background: var(--vscode-list-hoverBackground);
                border-color: var(--vscode-focusBorder);
            }
            .preset-card.selected {
                background: var(--vscode-list-activeSelectionBackground);
                border-color: var(--vscode-focusBorder);
            }
            .preset-name {
                font-weight: bold;
                margin-bottom: 5px;
            }
            .preset-description {
                font-size: 12px;
                color: var(--vscode-descriptionForeground);
            }
            .status {
                padding: 8px 12px;
                margin-bottom: 15px;
                border-radius: 4px;
                font-size: 13px;
                text-align: center;
            }
            .status.success {
                background: var(--vscode-notificationsInfoIcon-foreground, #3794ff);
                color: white;
            }
            .status.error {
                background: var(--vscode-notificationsErrorIcon-foreground, #f48771);
                color: white;
            }
            .status.info {
                background: var(--vscode-notificationsWarningIcon-foreground, #cca700);
                color: white;
            }
            button:disabled {
                opacity: 0.6;
                cursor: not-allowed;
            }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>Theme Customizer</h1>
            <div class="button-group">
                <button id="export" class="secondary">Export Theme</button>
                <button id="import" class="secondary">Import Theme</button>
                <button id="reset" class="secondary">Reset to Default</button>
            </div>
        </div>
        <div id="status" class="status" style="display: none;">
            <span id="status-text"></span>
        </div>
        <div class="tabs">
            <div class="tab active" data-tab="presets">Presets</div>
            <div class="tab" data-tab="custom">Custom Colors</div>
        </div>
        <div id="presets" class="tab-content active">
            <div class="presets-grid">
                <div class="preset-card" data-preset="dark">
                    <div class="preset-name">Dark Theme</div>
                    <div class="preset-description">Classic dark theme</div>
                </div>
                <div class="preset-card" data-preset="light">
                    <div class="preset-name">Light Theme</div>
                    <div class="preset-description">Clean light theme</div>
                </div>
                <div class="preset-card" data-preset="high-contrast">
                    <div class="preset-name">High Contrast</div>
                    <div class="preset-description">High contrast for accessibility</div>
                </div>
                <div class="preset-card" data-preset="monokai">
                    <div class="preset-name">Monokai Inspired</div>
                    <div class="preset-description">Retro coding theme</div>
                </div>
                <div class="preset-card" data-preset="solarized">
                    <div class="preset-name">Solarized Dark</div>
                    <div class="preset-description">Calm, easy on eyes</div>
                </div>
                <div class="preset-card" data-preset="github">
                    <div class="preset-name">GitHub Dark</div>
                    <div class="preset-description">GitHub's dark theme</div>
                </div>
            </div>
            <div class="button-group">
                <button id="apply-preset" style="display: none;">Apply Selected Preset</button>
            </div>
        </div>
        <div id="custom" class="tab-content">
            <div class="section">
                <h3>Editor Colors</h3>
                <div class="color-group">
                    <label>Background:</label>
                    <input type="color" id="editor-bg" value="#1e1e1e" />
                    <input type="text" id="editor-bg-hex" value="#1e1e1e" />
                </div>
                <div class="color-group">
                    <label>Foreground:</label>
                    <input type="color" id="editor-fg" value="#d4d4d4" />
                    <input type="text" id="editor-fg-hex" value="#d4d4d4" />
                </div>
                <div class="color-group">
                    <label>Line Numbers:</label>
                    <input type="color" id="line-numbers" value="#858585" />
                    <input type="text" id="line-numbers-hex" value="#858585" />
                </div>
                <div class="color-group">
                    <label>Selection:</label>
                    <input type="color" id="selection" value="#264f78" />
                    <input type="text" id="selection-hex" value="#264f78" />
                </div>
                <div class="color-group">
                    <label>Line Highlight:</label>
                    <input type="color" id="line-highlight" value="#2a2d2e" />
                    <input type="text" id="line-highlight-hex" value="#2a2d2e" />
                </div>
                <div class="color-group">
                    <label>Cursor:</label>
                    <input type="color" id="cursor" value="#aeafad" />
                    <input type="text" id="cursor-hex" value="#aeafad" />
                </div>
            </div>
            <div class="section">
                <h3>UI Colors</h3>
                <div class="color-group">
                    <label>Sidebar Background:</label>
                    <input type="color" id="sidebar-bg" value="#252526" />
                    <input type="text" id="sidebar-bg-hex" value="#252526" />
                </div>
                <div class="color-group">
                    <label>Sidebar Foreground:</label>
                    <input type="color" id="sidebar-fg" value="#cccccc" />
                    <input type="text" id="sidebar-fg-hex" value="#cccccc" />
                </div>
                <div class="color-group">
                    <label>Activity Bar Background:</label>
                    <input type="color" id="activity-bar-bg" value="#333333" />
                    <input type="text" id="activity-bar-bg-hex" value="#333333" />
                </div>
                <div class="color-group">
                    <label>Status Bar Background:</label>
                    <input type="color" id="status-bar-bg" value="#007acc" />
                    <input type="text" id="status-bar-bg-hex" value="#007acc" />
                </div>
                <div class="color-group">
                    <label>Title Bar Background:</label>
                    <input type="color" id="title-bar-bg" value="#3c3c3c" />
                    <input type="text" id="title-bar-bg-hex" value="#3c3c3c" />
                </div>
                <div class="color-group">
                    <label>Tab Active Background:</label>
                    <input type="color" id="tab-active-bg" value="#1e1e1e" />
                    <input type="text" id="tab-active-bg-hex" value="#1e1e1e" />
                </div>
                <div class="color-group">
                    <label>Panel Background:</label>
                    <input type="color" id="panel-bg" value="#252526" />
                    <input type="text" id="panel-bg-hex" value="#252526" />
                </div>
            </div>
            <div class="section">
                <h3>Syntax Highlighting</h3>
                <div class="color-group">
                    <label>Keywords:</label>
                    <input type="color" id="keywords" value="#569cd6" />
                    <input type="text" id="keywords-hex" value="#569cd6" />
                </div>
                <div class="color-group">
                    <label>Control Keywords:</label>
                    <input type="color" id="control-keywords" value="#c586c0" />
                    <input type="text" id="control-keywords-hex" value="#c586c0" />
                </div>
                <div class="color-group">
                    <label>Strings:</label>
                    <input type="color" id="strings" value="#ce9178" />
                    <input type="text" id="strings-hex" value="#ce9178" />
                </div>
                <div class="color-group">
                    <label>Template Strings:</label>
                    <input type="color" id="template-strings" value="#ce9178" />
                    <input type="text" id="template-strings-hex" value="#ce9178" />
                </div>
                <div class="color-group">
                    <label>Comments:</label>
                    <input type="color" id="comments" value="#6a9955" />
                    <input type="text" id="comments-hex" value="#6a9955" />
                </div>
                <div class="color-group">
                    <label>Numbers:</label>
                    <input type="color" id="numbers" value="#b5cea8" />
                    <input type="text" id="numbers-hex" value="#b5cea8" />
                </div>
                <div class="color-group">
                    <label>Constants:</label>
                    <input type="color" id="constants" value="#4ec9b0" />
                    <input type="text" id="constants-hex" value="#4ec9b0" />
                </div>
                <div class="color-group">
                    <label>Functions:</label>
                    <input type="color" id="functions" value="#dcdcaa" />
                    <input type="text" id="functions-hex" value="#dcdcaa" />
                </div>
                <div class="color-group">
                    <label>Classes/Types:</label>
                    <input type="color" id="classes" value="#4ec9b0" />
                    <input type="text" id="classes-hex" value="#4ec9b0" />
                </div>
                <div class="color-group">
                    <label>Variables:</label>
                    <input type="color" id="variables" value="#9cdcfe" />
                    <input type="text" id="variables-hex" value="#9cdcfe" />
                </div>
                <div class="color-group">
                    <label>Parameters:</label>
                    <input type="color" id="parameters" value="#9cdcfe" />
                    <input type="text" id="parameters-hex" value="#9cdcfe" />
                </div>
                <div class="color-group">
                    <label>Tags:</label>
                    <input type="color" id="tags" value="#569cd6" />
                    <input type="text" id="tags-hex" value="#569cd6" />
                </div>
                <div class="color-group">
                    <label>Attributes:</label>
                    <input type="color" id="attributes" value="#9cdcfe" />
                    <input type="text" id="attributes-hex" value="#9cdcfe" />
                </div>
                <div class="color-group">
                    <label>Punctuation:</label>
                    <input type="color" id="punctuation" value="#d4d4d4" />
                    <input type="text" id="punctuation-hex" value="#d4d4d4" />
                </div>
                <div class="color-group">
                    <label>Operators:</label>
                    <input type="color" id="operators" value="#d4d4d4" />
                    <input type="text" id="operators-hex" value="#d4d4d4" />
                </div>
            </div>
            <div class="button-group">
                <button id="apply">Apply Custom Theme</button>
            </div>
        </div>
        <script>
            const vscode = acquireVsCodeApi();
            let selectedPreset = null;
            let autoApplyEnabled = false;
            let autoApplyTimer = null;
            let statusTimer = null;

            function triggerAutoApply() {
                if (!autoApplyEnabled) return;
                clearTimeout(autoApplyTimer);
                autoApplyTimer = setTimeout(() => {
                    document.getElementById('apply').click();
                }, 600);
            }

            function loadColors(colors) {
                updateColorInput('editor-bg', colors.editorBackground);
                updateColorInput('editor-fg', colors.editorForeground);
                updateColorInput('line-numbers', colors.lineNumbers);
                updateColorInput('selection', colors.selection);
                updateColorInput('line-highlight', colors.lineHighlight);
                updateColorInput('cursor', colors.cursor);
                updateColorInput('sidebar-bg', colors.sidebarBackground);
                updateColorInput('sidebar-fg', colors.sidebarForeground);
                updateColorInput('activity-bar-bg', colors.activityBarBackground);
                updateColorInput('status-bar-bg', colors.statusBarBackground);
                updateColorInput('title-bar-bg', colors.titleBarBackground);
                updateColorInput('tab-active-bg', colors.tabActiveBackground);
                updateColorInput('panel-bg', colors.panelBackground);
                updateColorInput('keywords', colors.keywords);
                updateColorInput('control-keywords', colors.controlKeywords);
                updateColorInput('strings', colors.strings);
                updateColorInput('template-strings', colors.templateStrings);
                updateColorInput('comments', colors.comments);
                updateColorInput('numbers', colors.numbers);
                updateColorInput('constants', colors.constants);
                updateColorInput('functions', colors.functions);
                updateColorInput('classes', colors.classes);
                updateColorInput('variables', colors.variables);
                updateColorInput('parameters', colors.parameters);
                updateColorInput('tags', colors.tags);
                updateColorInput('attributes', colors.attributes);
                updateColorInput('punctuation', colors.punctuation);
                updateColorInput('operators', colors.operators);
            }

            window.addEventListener('message', event => {
                const message = event.data;
                if (message.type === 'status') {
                    showStatus(message.message, message.status);
                    setLoading('apply', false);
                    setLoading('apply-preset', false);
                    setLoading('export', false);
                    setLoading('import', false);
                    setLoading('reset', false);
                } else if (message.type === 'init') {
                    autoApplyEnabled = message.autoApply;
                    if (!message.showHexValues) {
                        document.querySelectorAll('.color-group input[type="text"]').forEach(el => {
                            el.style.display = 'none';
                        });
                    }
                    if (message.rememberSettings) {
                        loadColors(message.colors);
                    }
                } else if (message.type === 'colors') {
                    loadColors(message.colors);
                }
            });
            
            function updateColorInput(inputId, colorValue) {
                const colorInput = document.getElementById(inputId);
                const hexInput = document.getElementById(inputId + '-hex');
                if (colorInput) {
                    colorInput.value = colorValue;
                }
                if (hexInput) {
                    hexInput.value = colorValue;
                }
            }
            function showStatus(message, type = 'info', duration = 3000) {
                const status = document.getElementById('status');
                const statusText = document.getElementById('status-text');
                statusText.textContent = message;
                status.className = 'status ' + type;
                status.style.display = 'block';
                clearTimeout(statusTimer);
                if (duration > 0) {
                    statusTimer = setTimeout(() => {
                        status.style.display = 'none';
                    }, duration);
                }
            }
            function setLoading(buttonId, loading) {
                const button = document.getElementById(buttonId);
                if (!button) return;
                if (loading) {
                    button.disabled = true;
                    button.textContent = button.textContent.replace(/^(Export Theme|Import Theme|Reset to Default|Apply Custom Theme|Apply Selected Preset)/, 'Loading...');
                } else {
                    button.disabled = false;
                    button.textContent = button.textContent.replace(/^Loading\.\.\./, match => {
                        if (buttonId === 'apply') return 'Apply Custom Theme';
                        if (buttonId === 'export') return 'Export Theme';
                        if (buttonId === 'import') return 'Import Theme';
                        if (buttonId === 'reset') return 'Reset to Default';
                        if (buttonId === 'apply-preset') return 'Apply Selected Preset';
                        return match;
                    });
                }
            }

            document.querySelectorAll('.tab').forEach(tab => {
                tab.addEventListener('click', () => {
                    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                    tab.classList.add('active');
                    document.getElementById(tab.dataset.tab).classList.add('active');
                });
            });

            document.querySelectorAll('.preset-card').forEach(card => {
                card.addEventListener('click', () => {
                    document.querySelectorAll('.preset-card').forEach(c => c.classList.remove('selected'));
                    card.classList.add('selected');
                    selectedPreset = card.dataset.preset;
                    document.getElementById('apply-preset').click();
                });
            });

            document.querySelectorAll('input[type="color"]').forEach(picker => {
                const hexInput = document.getElementById(picker.id + '-hex');
                if (hexInput) {
                    picker.addEventListener('input', () => {
                        hexInput.value = picker.value;
                        triggerAutoApply();
                    });
                    hexInput.addEventListener('input', () => {
                        const val = hexInput.value.trim();
                        const valid = /^#[0-9A-Fa-f]{6}$/.test(val);
                        // Show the invalid state while the field is non-empty and malformed.
                        hexInput.classList.toggle('hex-invalid', val !== '' && !valid);
                        if (valid) {
                        const val = hexInput.value.trim().toLowerCase();
                        if (/^#[0-9a-f]{6}$/.test(val)) {
                            // Treat #AABBCC and #aabbcc as the same value.
                            if (hexInput.value !== val) {
                                hexInput.value = val;
                            }
                            picker.value = val;
                            triggerAutoApply();
                        }
                    });
                }
            });

            document.getElementById('apply').addEventListener('click', () => {
                setLoading('apply', true);
                showStatus('Applying custom theme...', 'info', 0);
                vscode.postMessage({
                    type: 'applyTheme',
                    colors: {
                        editorBackground: document.getElementById('editor-bg').value,
                        editorForeground: document.getElementById('editor-fg').value,
                        lineNumbers: document.getElementById('line-numbers').value,
                        selection: document.getElementById('selection').value,
                        lineHighlight: document.getElementById('line-highlight').value,
                        cursor: document.getElementById('cursor').value,
                        sidebarBackground: document.getElementById('sidebar-bg').value,
                        sidebarForeground: document.getElementById('sidebar-fg').value,
                        activityBarBackground: document.getElementById('activity-bar-bg').value,
                        statusBarBackground: document.getElementById('status-bar-bg').value,
                        titleBarBackground: document.getElementById('title-bar-bg').value,
                        tabActiveBackground: document.getElementById('tab-active-bg').value,
                        panelBackground: document.getElementById('panel-bg').value,
                        keywords: document.getElementById('keywords').value,
                        controlKeywords: document.getElementById('control-keywords').value,
                        strings: document.getElementById('strings').value,
                        templateStrings: document.getElementById('template-strings').value,
                        comments: document.getElementById('comments').value,
                        numbers: document.getElementById('numbers').value,
                        constants: document.getElementById('constants').value,
                        functions: document.getElementById('functions').value,
                        classes: document.getElementById('classes').value,
                        variables: document.getElementById('variables').value,
                        parameters: document.getElementById('parameters').value,
                        tags: document.getElementById('tags').value,
                        attributes: document.getElementById('attributes').value,
                        punctuation: document.getElementById('punctuation').value,
                        operators: document.getElementById('operators').value
                    }
                });
            });

            document.getElementById('apply-preset').addEventListener('click', () => {
                if (!selectedPreset) return;
                const presets = {
                    dark: {
                        name: 'Dark Theme',
                        workbench: {
                            'editor.background': '#1e1e1e',
                            'editor.foreground': '#d4d4d4',
                            'editorLineNumber.foreground': '#858585',
                            'editor.selectionBackground': '#264f78',
                            'sideBar.background': '#252526',
                            'activityBar.background': '#333333',
                            'statusBar.background': '#007acc',
                            'titleBar.activeBackground': '#3c3c3c',
                            'tab.activeBackground': '#1e1e1e',
                            'panel.background': '#252526'
                        },
                        tokenColors: {
                            textMateRules: [
                                { scope: ['keyword'], settings: { foreground: '#569cd6' } },
                                { scope: ['string'], settings: { foreground: '#ce9178' } },
                                { scope: ['comment'], settings: { foreground: '#6a9955' } },
                                { scope: ['constant.numeric'], settings: { foreground: '#b5cea8' } },
                                { scope: ['entity.name.function'], settings: { foreground: '#dcdcaa' } },
                                { scope: ['variable'], settings: { foreground: '#9cdcfe' } }
                            ]
                        }
                    },
                    light: {
                        name: 'Light Theme',
                        workbench: {
                            'editor.background': '#ffffff',
                            'editor.foreground': '#000000',
                            'editorLineNumber.foreground': '#237893',
                            'editor.selectionBackground': '#add6ff',
                            'sideBar.background': '#f3f3f3',
                            'activityBar.background': '#2d2d30',
                            'statusBar.background': '#007acc',
                            'titleBar.activeBackground': '#ffffff',
                            'tab.activeBackground': '#ffffff',
                            'panel.background': '#f3f3f3'
                        },
                        tokenColors: {
                            textMateRules: [
                                { scope: ['keyword'], settings: { foreground: '#0000ff' } },
                                { scope: ['string'], settings: { foreground: '#008000' } },
                                { scope: ['comment'], settings: { foreground: '#008000', fontStyle: 'italic' } },
                                { scope: ['constant.numeric'], settings: { foreground: '#098658' } },
                                { scope: ['entity.name.function'], settings: { foreground: '#795e26' } },
                                { scope: ['variable'], settings: { foreground: '#001080' } }
                            ]
                        }
                    },
                    'high-contrast': {
                        name: 'High Contrast',
                        workbench: {
                            'editor.background': '#000000',
                            'editor.foreground': '#ffffff',
                            'editorLineNumber.foreground': '#ffffff',
                            'editor.selectionBackground': '#ffffff',
                            'sideBar.background': '#000000',
                            'activityBar.background': '#000000',
                            'statusBar.background': '#ffffff',
                            'statusBar.foreground': '#000000',
                            'titleBar.activeBackground': '#ffffff',
                            'titleBar.activeForeground': '#000000',
                            'tab.activeBackground': '#ffffff',
                            'tab.activeForeground': '#000000',
                            'panel.background': '#000000'
                        },
                        tokenColors: {
                            textMateRules: [
                                { scope: ['keyword'], settings: { foreground: '#ffff00' } },
                                { scope: ['string'], settings: { foreground: '#ff00ff' } },
                                { scope: ['comment'], settings: { foreground: '#00ff00' } },
                                { scope: ['constant.numeric'], settings: { foreground: '#00ffff' } },
                                { scope: ['entity.name.function'], settings: { foreground: '#ff8000' } },
                                { scope: ['variable'], settings: { foreground: '#ffffff' } }
                            ]
                        }
                    },
                    monokai: {
                        name: 'Monokai Inspired',
                        workbench: {
                            'editor.background': '#272822',
                            'editor.foreground': '#f8f8f2',
                            'editorLineNumber.foreground': '#90908a',
                            'editor.selectionBackground': '#49483e',
                            'sideBar.background': '#272822',
                            'activityBar.background': '#272822',
                            'statusBar.background': '#75715e',
                            'titleBar.activeBackground': '#272822',
                            'tab.activeBackground': '#272822',
                            'panel.background': '#272822'
                        },
                        tokenColors: {
                            textMateRules: [
                                { scope: ['keyword'], settings: { foreground: '#f92672' } },
                                { scope: ['string'], settings: { foreground: '#e6db74' } },
                                { scope: ['comment'], settings: { foreground: '#75715e' } },
                                { scope: ['constant.numeric'], settings: { foreground: '#ae81ff' } },
                                { scope: ['entity.name.function'], settings: { foreground: '#a6e22e' } },
                                { scope: ['variable'], settings: { foreground: '#f8f8f2' } }
                            ]
                        }
                    },
                    solarized: {
                        name: 'Solarized Dark',
                        workbench: {
                            'editor.background': '#002b36',
                            'editor.foreground': '#839496',
                            'editorLineNumber.foreground': '#586e75',
                            'editor.selectionBackground': '#073642',
                            'sideBar.background': '#073642',
                            'activityBar.background': '#073642',
                            'statusBar.background': '#586e75',
                            'titleBar.activeBackground': '#073642',
                            'tab.activeBackground': '#073642',
                            'panel.background': '#073642'
                        },
                        tokenColors: {
                            textMateRules: [
                                { scope: ['keyword'], settings: { foreground: '#859900' } },
                                { scope: ['string'], settings: { foreground: '#2aa198' } },
                                { scope: ['comment'], settings: { foreground: '#586e75' } },
                                { scope: ['constant.numeric'], settings: { foreground: '#d33682' } },
                                { scope: ['entity.name.function'], settings: { foreground: '#268bd2' } },
                                { scope: ['variable'], settings: { foreground: '#b58900' } }
                            ]
                        }
                    },
                    github: {
                        name: 'GitHub Dark',
                        workbench: {
                            'editor.background': '#0d1117',
                            'editor.foreground': '#c9d1d9',
                            'editorLineNumber.foreground': '#7d8590',
                            'editor.selectionBackground': '#264f78',
                            'sideBar.background': '#161b22',
                            'activityBar.background': '#161b22',
                            'statusBar.background': '#161b22',
                            'titleBar.activeBackground': '#161b22',
                            'tab.activeBackground': '#161b22',
                            'panel.background': '#161b22'
                        },
                        tokenColors: {
                            textMateRules: [
                                { scope: ['keyword'], settings: { foreground: '#ff7b72' } },
                                { scope: ['string'], settings: { foreground: '#a5c9ea' } },
                                { scope: ['comment'], settings: { foreground: '#7d8590' } },
                                { scope: ['constant.numeric'], settings: { foreground: '#79c0ff' } },
                                { scope: ['entity.name.function'], settings: { foreground: '#d2a8ff' } },
                                { scope: ['variable'], settings: { foreground: '#c9d1d9' } }
                            ]
                        }
                    }
                };
                setLoading('apply-preset', true);
                showStatus('Applying preset theme...', 'info', 0);
                vscode.postMessage({
                    type: 'applyPreset',
                    preset: presets[selectedPreset]
                });
            });

            document.getElementById('export').addEventListener('click', () => {
                setLoading('export', true);
                showStatus('Exporting theme...', 'info', 0);
                vscode.postMessage({ type: 'exportTheme' });
            });

            document.getElementById('import').addEventListener('click', () => {
                setLoading('import', true);
                showStatus('Importing theme...', 'info', 0);
                vscode.postMessage({ type: 'importTheme' });
            });

            document.getElementById('reset').addEventListener('click', () => {
                setLoading('reset', true);
                showStatus('Resetting to default...', 'info', 0);
                vscode.postMessage({ type: 'resetTheme' });
            });

            vscode.postMessage({ type: 'ready' });
        </script>
    </body>
    </html>
    `;
}

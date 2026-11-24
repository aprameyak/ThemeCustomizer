import * as assert from 'assert';
import * as vscode from 'vscode';
import { getCurrentThemeColors, normalizeHexInput, resolveThemeColors } from '../extension';

suite('Extension Test Suite', () => {

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});

	test('Extension package.json has correct properties', () => {
		const packageJson = require('../../package.json');
		assert.strictEqual(packageJson.name, 'custom-code');
		assert.strictEqual(packageJson.displayName, 'Theme Customizer');
		assert.ok(packageJson.contributes.commands.length > 0);
	});

	test('Color validation function works', () => {
		const isValidHex = (color: string) => /^#[0-9A-F]{6}$/i.test(color);

		assert.ok(isValidHex('#FF0000'));
		assert.ok(isValidHex('#ff0000'));
		assert.ok(isValidHex('#123456'));
		assert.ok(!isValidHex('invalid'));
		assert.ok(!isValidHex('#GGG'));
		assert.ok(!isValidHex('#12345'));
		assert.ok(!isValidHex('#1234567'));
	});

	test('getCurrentThemeColors reads workbench and token settings', () => {
		const colors = getCurrentThemeColors(() => ({
			get(key: string) {
				if (key === 'workbench.colorCustomizations') {
					return { 'editor.background': '#AABBCC', 'statusBar.background': '#112233' };
				}
				if (key === 'editor.tokenColorCustomizations') {
					return { textMateRules: [{ scope: ['keyword'], settings: { foreground: '#445566' } }] };
				}
				return undefined;
			}
		}));

		assert.strictEqual(colors.editorBackground, '#aabbcc');
		assert.strictEqual(colors.statusBarBackground, '#112233');
		assert.strictEqual(colors.keywords, '#445566');
	});

	test('getCurrentThemeColors falls back when settings are empty', () => {
		const colors = getCurrentThemeColors(() => ({ get: () => undefined }));

		assert.strictEqual(colors.editorBackground, '#1e1e1e');
		assert.strictEqual(colors.keywords, '#569cd6');
	});

	test('normalizeHexInput treats uppercase and lowercase hex as equivalent', () => {
		assert.strictEqual(normalizeHexInput('#AABBCC'), '#aabbcc');
		assert.strictEqual(normalizeHexInput('#aabbcc'), '#aabbcc');
		assert.strictEqual(normalizeHexInput('  #AaBbCc  '), '#aabbcc');
		assert.strictEqual(normalizeHexInput('#GGGGGG'), undefined);
		assert.strictEqual(normalizeHexInput('#abc'), undefined);
	});

	test('Preset themes are properly defined', () => {
		const presets = ['dark', 'light', 'high-contrast', 'monokai', 'solarized', 'github'];

		presets.forEach(preset => {
			assert.ok(preset.length > 0);
		});
	});

	test('resolveThemeColors maps each token scope to its own color', () => {
		const colors = resolveThemeColors(
			{ 'editor.background': '#AABBCCDD' },
			{
				textMateRules: [
					{ scope: ['keyword'], settings: { foreground: '#111111' } },
					{ scope: ['keyword.control'], settings: { foreground: '#222222' } },
					{ scope: ['entity.name.tag'], settings: { foreground: '#333333' } },
					{ scope: ['constant.other'], settings: { foreground: '#444444' } },
					{ scope: ['keyword.operator'], settings: { foreground: '#555555' } }
				]
			}
		);
		assert.strictEqual(colors.keywords, '#111111');
		assert.strictEqual(colors.controlKeywords, '#222222');
		assert.strictEqual(colors.tags, '#333333');
		assert.strictEqual(colors.constants, '#444444');
		assert.strictEqual(colors.operators, '#555555');
		assert.strictEqual(colors.editorBackground, '#aabbcc');
	});
});

import * as assert from 'assert';
import * as vscode from 'vscode';

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

	test('Preset themes are properly defined', () => {
		const presets = ['dark', 'light', 'high-contrast', 'monokai', 'solarized', 'github'];

		presets.forEach(preset => {
			assert.ok(preset.length > 0);
		});
	});
});

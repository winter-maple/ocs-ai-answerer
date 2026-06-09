// @ts-check

const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

function loadTsModule(filePath) {
	const source = fs.readFileSync(filePath, 'utf8');
	const { outputText } = ts.transpileModule(source, {
		compilerOptions: {
			module: ts.ModuleKind.CommonJS,
			target: ts.ScriptTarget.ES2020,
			esModuleInterop: true
		},
		fileName: filePath
	});

	const mod = new Module(filePath, module);
	mod.filename = filePath;
	mod.paths = Module._nodeModulePaths(path.dirname(filePath));
	mod._compile(outputText, filePath);
	return mod.exports;
}

const configReliabilityPath = path.resolve(__dirname, '../packages/scripts/src/utils/config-reliability.ts');
const { collectSettingsForExport, normalizeDisabledAnswererNames, parseNotificationWebhooks } =
	loadTsModule(configReliabilityPath);

{
	const parsed = parseNotificationWebhooks(
		[
			'',
			'  # comment',
			'https://example.com/push?msg=${message}',
			'https://example.com/push?msg=${message}',
			'https://example.com/raw',
			'http://127.0.0.1/hook/${message}',
			'ftp://example.com/nope',
			'javascript:alert(1)',
			'not a url'
		].join('\n'),
		'通知 内容'
	);

	assert.deepStrictEqual(parsed.urls, [
		'https://example.com/push?msg=%E9%80%9A%E7%9F%A5%20%E5%86%85%E5%AE%B9',
		'https://example.com/raw',
		'http://127.0.0.1/hook/%E9%80%9A%E7%9F%A5%20%E5%86%85%E5%AE%B9'
	]);
	assert.deepStrictEqual(parsed.skipped, ['ftp://example.com/nope', 'javascript:alert(1)', 'not a url']);
}

{
	const values = new Map([
		['truthy', 'value'],
		['falseValue', false],
		['zero', 0],
		['emptyString', ''],
		['nullValue', null],
		['arrayValue', [1, 2]],
		['objectValue', { ok: true }],
		['undefinedValue', undefined],
		['__proto__', { polluted: true }],
		['constructor', 'blocked'],
		['prototype', 'blocked']
	]);

	const exported = collectSettingsForExport([...values.keys()], (key) => values.get(key));
	assert.strictEqual(Object.getPrototypeOf(exported), null);
	assert.deepStrictEqual(JSON.parse(JSON.stringify(exported)), {
		truthy: 'value',
		falseValue: false,
		zero: 0,
		emptyString: '',
		nullValue: null,
		arrayValue: [1, 2],
		objectValue: { ok: true }
	});
	assert.strictEqual({}.polluted, undefined);
}

{
	assert.deepStrictEqual(normalizeDisabledAnswererNames(['A', 'missing', 'B', 'A', 'C', 'B'], ['A', 'B', 'C']), [
		'A',
		'B',
		'C'
	]);
	assert.deepStrictEqual(normalizeDisabledAnswererNames(['missing'], ['A']), []);
}

console.log('config-notification tests passed');

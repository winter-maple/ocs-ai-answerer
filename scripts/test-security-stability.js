// @ts-check

const assert = require('assert');
const http = require('http');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

require('browser-env')();

function loadTsModule(filePath, mocks = {}) {
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

	const originalLoad = Module._load;
	Module._load = function (request, parent, isMain) {
		if (Object.prototype.hasOwnProperty.call(mocks, request)) {
			return mocks[request];
		}
		return originalLoad.apply(this, [request, parent, isMain]);
	};
	try {
		mod._compile(outputText, filePath);
	} finally {
		Module._load = originalLoad;
	}
	return mod.exports;
}

function createServer() {
	const server = http.createServer((req, res) => {
		if (req.url === '/json') {
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ ok: true }));
		} else if (req.url === '/bad-json') {
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end('not json');
		} else if (req.url === '/empty-json') {
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end('');
		} else {
			res.writeHead(500, { 'Content-Type': 'text/plain' });
			res.end('boom');
		}
	});

	return new Promise((resolve) => {
		server.listen(0, '127.0.0.1', () => resolve(server));
	});
}

(async () => {
	const safeRenderPath = path.resolve(__dirname, '../packages/scripts/src/elements/safe-render.ts');
	const settingsImportPath = path.resolve(__dirname, '../packages/scripts/src/utils/settings-import.ts');
	const requestPath = path.resolve(__dirname, '../packages/core/src/core/utils/request.ts');

	const { createSafeContentSpan, createSafeHomepageNode, getSafeTagColor, normalizeExternalText } =
		loadTsModule(safeRenderPath);
	const { parseSettingsImport } = loadTsModule(settingsImportPath);
	const { request } = loadTsModule(requestPath, {
		'../../utils/common': {
			$: {
				isInBrowser: () => false
			}
		}
	});

	{
		const span = createSafeContentSpan('<script>bad()</script><b>题目</b> https://example.com/a.png');
		assert.strictEqual(span.querySelector('script'), null);
		assert.strictEqual(span.querySelector('b'), null);
		assert.strictEqual(span.querySelectorAll('img').length, 1);
		assert.strictEqual(span.textContent.includes('题目'), true);
	}

	{
		const span = createSafeContentSpan('<img src="https://example.com/pic.jpg" onerror="bad()">');
		const img = span.querySelector('img');
		assert.ok(img);
		assert.strictEqual(img.getAttribute('onerror'), null);
		assert.strictEqual(img.src, 'https://example.com/pic.jpg');
	}

	{
		const node = createSafeHomepageNode('题库', 'javascript:alert(1)');
		assert.strictEqual(node.nodeType, Node.TEXT_NODE);
		assert.strictEqual(getSafeTagColor('red'), '');
		assert.strictEqual(getSafeTagColor('blue'), 'blue');
		assert.strictEqual(normalizeExternalText('<span>答案</span>'), '答案');
	}

	{
		assert.deepStrictEqual(parseSettingsImport('{"common.settings.auto":true}'), {
			'common.settings.auto': true
		});
		const parsed = parseSettingsImport('{"safe":1,"__proto__":{"polluted":true},"constructor":2,"prototype":3}');
		assert.deepStrictEqual(parsed, { safe: 1 });
		assert.strictEqual({}.polluted, undefined);
		assert.throws(() => parseSettingsImport('not json'), /不是有效 JSON/);
		assert.throws(() => parseSettingsImport('[]'), /根内容必须是一个对象/);
		assert.throws(() => parseSettingsImport('{"__proto__":{}}'), /没有可导入的设置项/);
	}

	const server = await createServer();
	try {
		const address = server.address();
		const baseUrl = `http://127.0.0.1:${address.port}`;
		assert.deepStrictEqual(await request(`${baseUrl}/json`, { type: 'fetch', responseType: 'json' }), { ok: true });
		await assert.rejects(
			() => request(`${baseUrl}/bad-json`, { type: 'fetch', responseType: 'json' }),
			/题库返回不是有效 JSON/
		);
		await assert.rejects(
			() => request(`${baseUrl}/empty-json`, { type: 'fetch', responseType: 'json' }),
			/题库返回不是有效 JSON/
		);
		await assert.rejects(
			() => request(`${baseUrl}/status`, { type: 'fetch', responseType: 'json' }),
			/题库请求失败（HTTP 500）：boom/
		);
	} finally {
		server.close();
	}

	console.log('security-stability tests passed');
})();

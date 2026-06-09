// @ts-check

const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const quickApiPath = path.resolve(__dirname, '../packages/scripts/src/projects/common/quick-api.ts');

function loadQuickApiModule(mocks = {}) {
	const source = fs.readFileSync(quickApiPath, 'utf8');
	const { outputText } = ts.transpileModule(source, {
		compilerOptions: {
			module: ts.ModuleKind.CommonJS,
			target: ts.ScriptTarget.ES2020,
			esModuleInterop: true
		},
		fileName: quickApiPath
	});

	const mod = new Module(quickApiPath, module);
	mod.filename = quickApiPath;
	mod.paths = Module._nodeModulePaths(path.dirname(quickApiPath));

	const originalLoad = Module._load;
	Module._load = function (request, parent, isMain) {
		if (Object.prototype.hasOwnProperty.call(mocks, request)) {
			return mocks[request];
		}
		return originalLoad.apply(this, [request, parent, isMain]);
	};
	try {
		mod._compile(outputText, quickApiPath);
	} finally {
		Module._load = originalLoad;
	}
	return mod.exports;
}

function evaluateReturnHandler(handler) {
	return new Function(handler)();
}

function renderValue(value, env) {
	if (value && typeof value === 'object' && typeof value.handler === 'string') {
		return evaluateReturnHandler(value.handler)(env);
	}
	if (typeof value === 'string') {
		return value
			.replaceAll('${title}', env.title || '')
			.replaceAll('${options}', env.options || '')
			.replaceAll('${type}', env.type || '');
	}
	if (Array.isArray(value)) {
		return value.map((item) => renderValue(item, env));
	}
	if (value && typeof value === 'object') {
		return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, renderValue(item, env)]));
	}
	return value;
}

async function liveRunner([wrapper], env) {
	const url = new URL(wrapper.url);
	const data = renderValue(wrapper.data || {}, env);
	const init = {
		method: wrapper.method.toUpperCase(),
		headers: wrapper.headers || {}
	};

	if (wrapper.method === 'get') {
		for (const [key, value] of Object.entries(data)) {
			url.searchParams.set(key, String(value));
		}
	} else {
		init.body = JSON.stringify(data);
	}

	const response = await fetch(url.toString(), init);
	const raw = await response.text();
	let responseData = raw;
	try {
		responseData = JSON.parse(raw);
	} catch {
		// Keep text response for custom text handlers.
	}

	if (!response.ok) {
		throw new Error(
			`HTTP ${response.status}: ${typeof responseData === 'string' ? responseData : JSON.stringify(responseData)}`
		);
	}

	const parsed = evaluateReturnHandler(wrapper.handler)(responseData);
	const results = Array.isArray(parsed)
		? parsed.every((item) => Array.isArray(item))
			? parsed.map((item) => ({ question: item[0], answer: item[1], extra_data: item[2] || {} }))
			: [{ question: parsed[0], answer: parsed[1], extra_data: parsed[2] || {} }]
		: [];

	return [
		{
			name: wrapper.name,
			url: wrapper.url,
			results,
			response: responseData,
			data
		}
	];
}

async function runUnitTests() {
	const { createQuickApiAnswererWrapper, maskSensitiveUrl, parseQuickApiConfig, runQuickApiSmokeTest } =
		loadQuickApiModule({
			'@ocsjs/core': {
				defaultAnswerWrapperHandler: async () => []
			}
		});

	const wrappers = [
		createQuickApiAnswererWrapper(
			parseQuickApiConfig('url: https://example.com/v1\nkey: sk-test\nmodel: gpt-test\nname: Good')
		),
		createQuickApiAnswererWrapper(
			parseQuickApiConfig('url: https://example.com/v1/responses\nkey: sk-test\nmodel: gpt-test\nname: Empty')
		)
	];

	const results = await runQuickApiSmokeTest(wrappers, async ([wrapper]) => {
		if (wrapper.name === 'Good') {
			return [
				{
					name: wrapper.name,
					url: wrapper.url,
					results: [{ question: 'What is 1 + 1?', answer: '2' }]
				}
			];
		}
		return [
			{
				name: wrapper.name,
				url: wrapper.url,
				results: [],
				error: '测试请求成功，但没有解析到答案。'
			}
		];
	});

	assert.strictEqual(results.length, 2);
	assert.strictEqual(results[0].ok, true);
	assert.deepStrictEqual(results[0].answers, ['2']);
	assert.strictEqual(results[0].api, 'chat');
	assert.strictEqual(results[1].ok, false);
	assert.strictEqual(results[1].api, 'responses');
	assert.match(results[1].error || '', /没有解析到答案/);

	const thrown = await runQuickApiSmokeTest([wrappers[0]], async () => {
		throw new Error('network failed');
	});
	assert.strictEqual(thrown[0].ok, false);
	assert.match(thrown[0].error || '', /network failed/);

	assert.strictEqual(
		maskSensitiveUrl('https://example.com/search?key=abc&token=def&api_key=ghi&safe=1'),
		'https://example.com/search?key=***&token=***&api_key=***&safe=1'
	);
}

async function runLiveSmokeIfConfigured() {
	const url = process.env.OCS_QUICK_API_SMOKE_URL;
	const key = process.env.OCS_QUICK_API_SMOKE_KEY;
	const model = process.env.OCS_QUICK_API_SMOKE_MODEL || 'gpt-5.4-mini';
	const api = process.env.OCS_QUICK_API_SMOKE_API;

	if (!url || !key) {
		console.log('quick-api live smoke skipped: OCS_QUICK_API_SMOKE_URL/KEY not set');
		return;
	}

	const { createQuickApiAnswererWrapper, parseQuickApiConfig, runQuickApiSmokeTest } = loadQuickApiModule();

	const wrapper = createQuickApiAnswererWrapper(
		parseQuickApiConfig(
			[`url: ${url}`, api ? `api: ${api}` : '', `key: ${key}`, `model: ${model}`, 'name: Quick API Smoke']
				.filter(Boolean)
				.join('\n')
		)
	);
	const [result] = await runQuickApiSmokeTest([wrapper], liveRunner);

	assert.ok(result.ok, result.error || 'live smoke did not parse an answer');
	assert.ok(
		result.answers.some((answer) => String(answer).includes('2')),
		'live smoke answer should include 2'
	);
	console.log(
		JSON.stringify(
			{
				ok: true,
				name: result.name,
				api: result.api,
				model: result.model,
				url: result.maskedUrl,
				answers: result.answers
			},
			null,
			2
		)
	);
}

(async () => {
	await runUnitTests();
	await runLiveSmokeIfConfigured();
	console.log('quick-api smoke tests passed');
})();

// @ts-check

const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const quickApiPath = path.resolve(__dirname, '../packages/scripts/src/projects/common/quick-api.ts');

function loadQuickApiModule() {
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
	mod._compile(outputText, quickApiPath);
	return mod.exports;
}

function evaluateReturnHandler(handler) {
	return new Function(handler)();
}

const { createQuickApiAnswererWrapper, parseQuickApiConfig } = loadQuickApiModule();

{
	const config = parseQuickApiConfig(`
url: https://api.deepseek.com
api: chat
key: sk-test
model: deepseek-v4-flash
name: DeepSeek
`);

	assert.deepStrictEqual(config, {
		url: 'https://api.deepseek.com',
		api: 'chat',
		key: 'sk-test',
		model: 'deepseek-v4-flash',
		name: 'DeepSeek'
	});
}

{
	const wrapper = createQuickApiAnswererWrapper(
		parseQuickApiConfig(`
url: https://api.deepseek.com
key: sk-test
model: deepseek-v4-flash
name: DeepSeek
`)
	);

	assert.strictEqual(wrapper.url, 'https://api.deepseek.com/chat/completions');
	assert.strictEqual(wrapper.headers.Authorization, 'Bearer sk-test');

	const createMessages = evaluateReturnHandler(wrapper.data.messages.handler);
	const messages = createMessages({
		type: 'single',
		title: '1+1 等于几？',
		options: '1\n2\n3'
	});

	assert.strictEqual(messages[0].role, 'system');
	assert.match(messages[1].content, /1\+1/);
}

{
	const wrapper = createQuickApiAnswererWrapper(
		parseQuickApiConfig(`
url: https://example.com/v1
api: responses
key: sk-test
model: gpt-test
`)
	);

	assert.strictEqual(wrapper.url, 'https://example.com/v1/responses');
	assert.strictEqual(wrapper.data.input.handler.includes('题目类型'), true);

	const parseResponse = evaluateReturnHandler(wrapper.handler);
	const answerPairs = parseResponse({
		output: [
			{
				content: [
					{
						type: 'output_text',
						text: '{"question":"1+1 等于几？","answers":["2"]}'
					}
				]
			}
		]
	});

	assert.deepStrictEqual(answerPairs, [['1+1 等于几？', '2']]);
}

{
	const wrapper = createQuickApiAnswererWrapper(
		parseQuickApiConfig(`
url: https://example.com/search
key: sk-test
method: get
`)
	);

	assert.strictEqual(wrapper.method, 'get');
	assert.strictEqual(wrapper.headers.Authorization, 'Bearer sk-test');
	assert.strictEqual(wrapper.headers['X-API-Key'], 'sk-test');
}

console.log('quick-api tests passed');

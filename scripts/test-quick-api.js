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

function assertThrowsMessage(fn, pattern) {
	assert.throws(fn, (error) => pattern.test(String(error.message)));
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
	const config = parseQuickApiConfig(
		JSON.stringify({
			baseUrl: 'https://example.com/v1',
			token: 'sk-json',
			api: 'responses',
			keyHeader: 'X-Test-Key'
		})
	);

	assert.deepStrictEqual(config, {
		url: 'https://example.com/v1',
		key: 'sk-json',
		api: 'responses',
		keyHeader: 'X-Test-Key'
	});
}

{
	assertThrowsMessage(() => parseQuickApiConfig('key: sk-test'), /缺少 url/);
	assertThrowsMessage(() => parseQuickApiConfig('url: not-a-url'), /不是合法 URL/);
	assertThrowsMessage(() => parseQuickApiConfig('url: https://example.com\nmethod: put'), /method 只支持 get 或 post/);
	assertThrowsMessage(
		() => parseQuickApiConfig('url: https://example.com\napi: assistants'),
		/api 只支持 chat 或 responses/
	);
	assertThrowsMessage(() => parseQuickApiConfig('url: https://example.com\nkeyHeader: bad header'), /keyHeader/);
	assertThrowsMessage(() => parseQuickApiConfig('{bad json'), /JSON 配置格式错误/);
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

	const parseResponse = evaluateReturnHandler(wrapper.handler);
	assert.deepStrictEqual(
		parseResponse({
			choices: [
				{
					message: {
						content: '```json\n{"question":"1+1 等于几？","answers":["2"]}\n```'
					}
				}
			]
		}),
		[['1+1 等于几？', '2']]
	);
	assert.deepStrictEqual(
		parseResponse({
			choices: [
				{
					message: {
						content: '{"question":"判断题","answer":"正确"}'
					}
				}
			]
		}),
		[['判断题', '正确']]
	);
	assert.strictEqual(
		parseResponse({
			choices: [
				{
					message: {
						content: '不是 JSON 的解释文本'
					}
				}
			]
		}),
		undefined
	);
}

{
	const wrapper = createQuickApiAnswererWrapper(
		parseQuickApiConfig(`
url: https://api.deepseek.com/v1/chat/completions
key: sk-test
model: deepseek-v4-flash
`)
	);

	assert.strictEqual(wrapper.url, 'https://api.deepseek.com/v1/chat/completions');
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
	assert.deepStrictEqual(
		parseResponse({
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
		}),
		[['1+1 等于几？', '2']]
	);
	assert.deepStrictEqual(
		parseResponse({
			output_text: '{"question":"多选题","answers":["A","C"]}'
		}),
		[
			['多选题', 'A'],
			['多选题', 'C']
		]
	);
	assert.strictEqual(parseResponse({ error: { message: 'bad request' } }), undefined);
}

{
	const wrapper = createQuickApiAnswererWrapper(
		parseQuickApiConfig(`
url: https://example.com/v1/responses
key: sk-test
model: gpt-test
keyHeader: X-API-Key
authPrefix: none
`)
	);

	assert.strictEqual(wrapper.url, 'https://example.com/v1/responses');
	assert.strictEqual(wrapper.headers['X-API-Key'], 'sk-test');
	assert.strictEqual(wrapper.headers.Authorization, undefined);
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

	const parseResponse = evaluateReturnHandler(wrapper.handler);
	assert.deepStrictEqual(
		parseResponse({
			question: '1+1 等于几？',
			answer: {
				allAnswer: [['2'], ['二']]
			}
		}),
		[
			['1+1 等于几？', '2'],
			['1+1 等于几？', '二']
		]
	);
	assert.deepStrictEqual(
		parseResponse({
			data: {
				question: '首都',
				result: {
					answer: [{ text: '北京' }]
				}
			}
		}),
		[['首都', '北京']]
	);
	assert.strictEqual(parseResponse({ data: { answer: [] } }), undefined);
}

console.log('quick-api tests passed');

/* eslint-disable no-template-curly-in-string */
import type { AnswererWrapper, SearchInformation } from '@ocsjs/core';

export type QuickApiConfig = {
	url: string;
	key?: string;
	name?: string;
	homepage?: string;
	model?: string;
	api?: 'chat' | 'responses';
	keyHeader?: string;
	authPrefix?: string;
	method?: 'post' | 'get';
};

type QuickApiConfigInput = Partial<QuickApiConfig> & {
	baseUrl?: string;
	token?: string;
	apiKey?: string;
};

const DEFAULT_MODEL = 'mimo-v2.5-pro';
const SENSITIVE_URL_PARAM_NAMES = ['key', 'token', 'api_key', 'apikey', 'api-key', 'access_token', 'authorization'];
export const QUICK_API_SMOKE_TEST_ENV = {
	type: 'single',
	title: 'What is 1 + 1?',
	options: '1\n2\n3\n4'
};

export type QuickApiSmokeTestResult = {
	name: string;
	url: string;
	maskedUrl: string;
	api: 'chat' | 'responses' | 'generic';
	model?: string;
	ok: boolean;
	answers: string[];
	error?: string;
};

export type QuickApiSmokeTestRunner = (
	answererWrappers: AnswererWrapper[],
	env: typeof QUICK_API_SMOKE_TEST_ENV
) => Promise<SearchInformation[]>;

const ANSWER_SYSTEM_PROMPT = [
	'你是一个网课自动答题助手。',
	'请根据题目类型和选项直接给出最可能正确的答案。',
	'必须只返回 JSON，不要输出 markdown，不要解释，不要多余文本。',
	'JSON 格式固定为：{"question":"题目","answers":["答案1","答案2"]}。',
	'单选题和判断题只返回 1 个答案。',
	'多选题返回多个答案，每个答案单独放在 answers 数组里。',
	'如果有选项，尽量返回与选项文字完全一致的答案文本，不要只返回字母。'
];

const QUESTION_INPUT_HANDLER = `return (env)=>[
	'题目类型：' + (env.type || 'unknown'),
	'题目：' + (env.title || ''),
	'选项：',
	env.options || '无'
].join('\\n')`;

const ANSWER_JSON_HANDLER_BODY = `
	const normalize = (value)=>{
		if (value === undefined || value === null) return '';
		if (Array.isArray(value)) return value.map(normalize).filter(Boolean).join('#');
		if (typeof value === 'object') {
			return normalize(value.answer ?? value.content ?? value.text ?? value.value ?? value.name);
		}
		return String(value).trim();
	};

	const stripMarkdownFence = (text)=>{
		const trimmed = String(text || '').trim();
		const fenced = trimmed.match(/^\\\`\\\`\\\`(?:json)?\\s*([\\s\\S]*?)\\s*\\\`\\\`\\\`$/i);
		return fenced ? fenced[1].trim() : trimmed;
	};

	const parseJson = (text)=>{
		const normalizedText = stripMarkdownFence(text);
		try {
			return JSON.parse(normalizedText);
		} catch {
			const match = normalizedText.match(/\\{[\\s\\S]*\\}/);
			if (!match) return undefined;
			try {
				return JSON.parse(match[0]);
			} catch {
				return undefined;
			}
		}
	};

	const parsed = parseJson(content);
	if (!parsed || parsed.error) return undefined;

	const question = normalize(parsed.question || parsed.title || parsed.data?.question || '');
	const answerValue =
		parsed.answers ??
		parsed.answer ??
		parsed.data?.answers ??
		parsed.data?.answer ??
		parsed.result?.answers ??
		parsed.result?.answer;
	const answers = Array.isArray(answerValue)
		? answerValue.map((item)=> normalize(item)).filter(Boolean)
		: normalize(answerValue)
			? [normalize(answerValue)]
			: [];

	if (answers.length === 0) return undefined;
	return answers.map((answer)=> [question, answer]);
`;

export function parseQuickApiConfig(raw: string): QuickApiConfig {
	const text = raw.trim();
	if (!text) {
		throw new Error('URL+Key 配置不能为空，请至少填写 url。');
	}

	if (text.startsWith('{')) {
		try {
			return normalizeQuickApiConfig(JSON.parse(text) as QuickApiConfigInput);
		} catch (error: any) {
			if (error instanceof SyntaxError) {
				throw new Error('URL+Key JSON 配置格式错误，请检查是否缺少逗号、引号或右括号。');
			}
			throw error;
		}
	}

	const config: QuickApiConfigInput = {};
	for (const line of text.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) {
			continue;
		}

		const matched = trimmed.match(/^([\w-]+)\s*[:：]\s*(.+)$/);
		if (!matched) {
			continue;
		}

		const key = matched[1].toLowerCase();
		const value = matched[2].trim();

		if (['url', 'baseurl', 'base-url', 'base_url'].includes(key)) {
			config.url = value;
		} else if (['key', 'token', 'apikey', 'api-key', 'api_key'].includes(key)) {
			config.key = value;
		} else if (key === 'name') {
			config.name = value;
		} else if (['model', 'modelname', 'model-name', 'model_name'].includes(key)) {
			config.model = value;
		} else if (['api', 'endpoint', 'mode'].includes(key)) {
			config.api = parseApiMode(value);
		} else if (['homepage', 'home'].includes(key)) {
			config.homepage = value;
		} else if (['header', 'keyheader', 'key-header', 'key_header', 'authheader', 'auth-header'].includes(key)) {
			config.keyHeader = value;
		} else if (['prefix', 'authprefix', 'auth-prefix', 'auth_prefix', 'scheme', 'authorization'].includes(key)) {
			config.authPrefix = value;
		} else if (key === 'method') {
			config.method = parseMethod(value);
		}
	}

	return normalizeQuickApiConfig(config);
}

export function createQuickApiAnswererWrapper(config: QuickApiConfig): AnswererWrapper {
	const normalized = normalizeQuickApiConfig(config);

	if (isResponsesApiQuickApi(normalized)) {
		return createResponsesApiAnswererWrapper(normalized);
	}

	if (isOpenAICompatibleQuickApi(normalized)) {
		return createOpenAICompatibleAnswererWrapper(normalized);
	}

	return createGenericApiAnswererWrapper(normalized);
}

export async function runQuickApiSmokeTest(
	answererWrappers: AnswererWrapper[],
	runner: QuickApiSmokeTestRunner
): Promise<QuickApiSmokeTestResult[]> {
	const results: QuickApiSmokeTestResult[] = [];

	for (const wrapper of answererWrappers) {
		const details = getQuickApiWrapperDetails(wrapper);
		try {
			const [searchInfo] = await runner([wrapper], QUICK_API_SMOKE_TEST_ENV);
			const answers = (searchInfo?.results || []).map((item) => String(item.answer || '').trim()).filter(Boolean);
			results.push({
				...details,
				ok: answers.length > 0 && !searchInfo?.error,
				answers,
				...(searchInfo?.error || answers.length === 0
					? { error: searchInfo?.error || '测试请求成功，但没有解析到答案。' }
					: {})
			});
		} catch (error: any) {
			results.push({
				...details,
				ok: false,
				answers: [],
				error: error?.message || '测试请求失败。'
			});
		}
	}

	return results;
}

export function maskSensitiveUrl(value: string): string {
	try {
		const url = new URL(value);
		for (const key of Array.from(url.searchParams.keys())) {
			if (SENSITIVE_URL_PARAM_NAMES.includes(key.toLowerCase())) {
				url.searchParams.set(key, '***');
			}
		}
		return url.toString();
	} catch {
		return value;
	}
}

function normalizeQuickApiConfig(input: QuickApiConfigInput): QuickApiConfig {
	const config: QuickApiConfigInput = { ...input };
	config.url = String(config.url || config.baseUrl || '').trim();
	config.key = optionalString(config.key || config.token || config.apiKey);
	config.name = optionalString(config.name);
	config.homepage = optionalString(config.homepage);
	config.model = optionalString(config.model);
	config.keyHeader = optionalString(config.keyHeader);
	config.authPrefix = optionalString(config.authPrefix);

	if (!config.url) {
		throw new Error('URL+Key 配置缺少 url 字段，例如：url: https://example.com/v1。');
	}

	validateUrl(config.url, 'url');

	if (config.homepage) {
		validateUrl(config.homepage, 'homepage');
	}

	if (config.api !== undefined) {
		config.api = parseApiMode(config.api);
	}

	if (config.method !== undefined) {
		config.method = parseMethod(config.method);
	}

	if (config.keyHeader && !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(config.keyHeader)) {
		throw new Error('URL+Key 配置中的 keyHeader 不是合法请求头名称，请只使用英文、数字和横线。');
	}

	return {
		url: config.url,
		...(config.key ? { key: config.key } : {}),
		...(config.name ? { name: config.name } : {}),
		...(config.homepage ? { homepage: config.homepage } : {}),
		...(config.model ? { model: config.model } : {}),
		...(config.api ? { api: config.api } : {}),
		...(config.keyHeader ? { keyHeader: config.keyHeader } : {}),
		...(config.authPrefix ? { authPrefix: config.authPrefix } : {}),
		...(config.method ? { method: config.method } : {})
	};
}

function getQuickApiWrapperDetails(wrapper: AnswererWrapper) {
	const api = /responses\/?$/i.test(wrapper.url)
		? 'responses'
		: /chat\/completions\/?$/i.test(wrapper.url)
		? 'chat'
		: 'generic';
	const model = typeof wrapper.data?.model === 'string' ? wrapper.data.model : undefined;

	return {
		name: wrapper.name,
		url: wrapper.url,
		maskedUrl: maskSensitiveUrl(wrapper.url),
		api,
		...(model ? { model } : {})
	} as Pick<QuickApiSmokeTestResult, 'name' | 'url' | 'maskedUrl' | 'api' | 'model'>;
}

function optionalString(value: unknown) {
	if (value === undefined || value === null) {
		return undefined;
	}
	const text = String(value).trim();
	return text || undefined;
}

function validateUrl(value: string, field: 'url' | 'homepage') {
	let parsed: URL;
	try {
		parsed = new URL(value);
	} catch {
		throw new Error(`URL+Key 配置中的 ${field} 不是合法 URL，请填写完整地址，例如：https://example.com/v1。`);
	}

	if (!['http:', 'https:'].includes(parsed.protocol)) {
		throw new Error(`URL+Key 配置中的 ${field} 只支持 http 或 https 地址。`);
	}
}

function parseApiMode(value: unknown): QuickApiConfig['api'] {
	const text = String(value || '')
		.trim()
		.toLowerCase();
	if (!text) {
		return undefined;
	}
	if (text.includes('responses')) {
		return 'responses';
	}
	if (['chat', 'chat-completions', 'chat_completions', 'completion', 'completions'].includes(text)) {
		return 'chat';
	}
	throw new Error('URL+Key 配置中的 api 只支持 chat 或 responses。');
}

function parseMethod(value: unknown): QuickApiConfig['method'] {
	const text = String(value || '')
		.trim()
		.toLowerCase();
	if (!text) {
		return undefined;
	}
	if (text === 'get' || text === 'post') {
		return text;
	}
	throw new Error('URL+Key 配置中的 method 只支持 get 或 post。');
}

function createGenericApiAnswererWrapper(config: QuickApiConfig): AnswererWrapper {
	const method = config.method || 'post';
	const headers = createAuthHeaders(config, true);

	return {
		name: config.name || 'API题库',
		url: config.url,
		homepage: config.homepage || new URL(config.url).origin,
		method,
		type: 'GM_xmlhttpRequest',
		contentType: 'json',
		headers,
		data:
			method === 'get'
				? {
						question: '${title}',
						title: '${title}',
						options: {
							handler: "return (env)=>env.options ? env.options.split('\\n').filter(Boolean).join('#') : ''"
						},
						type: {
							handler:
								"return (env)=> env.type === 'single' ? 0 : env.type === 'multiple' ? 1 : env.type === 'completion' ? 3 : env.type === 'judgement' ? 4 : env.type"
						}
				  }
				: {
						question: '${title}',
						title: '${title}',
						options: {
							handler: "return (env)=>env.options ? env.options.split('\\n').filter(Boolean) : []"
						},
						type: {
							handler:
								"return (env)=> env.type === 'single' ? 0 : env.type === 'multiple' ? 1 : env.type === 'completion' ? 3 : env.type === 'judgement' ? 4 : env.type"
						}
				  },
		handler: `return (res)=>{
			if (!res || res.error) return undefined;

			const question = res?.question || res?.data?.question || res?.result?.question || '';
			const toAnswerString = (value)=>{
				if (value === undefined || value === null) return '';
				if (Array.isArray(value)) return value.map(toAnswerString).filter(Boolean).join('#');
				if (typeof value === 'object') {
					return toAnswerString(value.answer ?? value.content ?? value.text ?? value.value ?? value.name);
				}
				return String(value).trim();
			};
			const answers =
				res?.answer?.allAnswer ??
				res?.data?.answer?.allAnswer ??
				res?.data?.answers ??
				res?.answers ??
				res?.data?.answer ??
				res?.answer ??
				res?.result?.answers ??
				res?.result?.answer ??
				res?.data?.result?.answers ??
				res?.data?.result?.answer;

			if (answers === undefined || answers === null || answers === '') return undefined;

			let normalized;
			if (Array.isArray(answers)) {
				if (answers.length === 0) return undefined;
				if (answers.every((item)=> Array.isArray(item))) {
					normalized = answers.map((item)=> toAnswerString(item)).filter(Boolean);
				} else if (answers.every((item)=> typeof item !== 'object' || item === null)) {
					normalized = [toAnswerString(answers)].filter(Boolean);
				} else {
					normalized = answers.map((item)=> toAnswerString(item)).filter(Boolean);
				}
			} else {
				normalized = [toAnswerString(answers)].filter(Boolean);
			}

			if (normalized.length === 0) return undefined;
			return normalized.map((answer)=> [question, answer]);
		}`
	};
}

function isResponsesApiQuickApi(config: QuickApiConfig) {
	return String(config.api || '').toLowerCase() === 'responses' || /responses\/?$/i.test(config.url);
}

function isOpenAICompatibleQuickApi(config: QuickApiConfig) {
	return Boolean(config.model) || /chat\/completions\/?$/i.test(config.url) || /\/v\d+(?:\.\d+)?\/?$/i.test(config.url);
}

function createResponsesApiAnswererWrapper(config: QuickApiConfig): AnswererWrapper {
	const url = /responses\/?$/i.test(config.url) ? config.url : config.url.replace(/\/$/, '') + '/responses';
	const headers = createAuthHeaders(config);

	return {
		name: config.name || 'Responses兼容题库',
		url,
		homepage: config.homepage || new URL(config.url).origin,
		method: 'post',
		type: 'GM_xmlhttpRequest',
		contentType: 'json',
		headers,
		data: {
			model: config.model || DEFAULT_MODEL,
			temperature: 0.2,
			instructions: ANSWER_SYSTEM_PROMPT.join('\n'),
			input: {
				handler: QUESTION_INPUT_HANDLER
			}
		},
		handler: `return (res)=>{
			if (!res || res.error) return undefined;

			const extractText = (value)=>{
				if (!value) return '';
				if (typeof value === 'string') return value;
				if (Array.isArray(value)) return value.map(extractText).filter(Boolean).join('\\n');
				if (typeof value === 'object') {
					return extractText(
						value.output_text ??
						value.data?.output_text ??
						value.text ??
						value.value ??
						value.content ??
						value.message?.content ??
						value.message ??
						value.output ??
						value.response ??
						value.choices?.[0]?.message?.content
					);
				}
				return String(value);
			};
			const content = extractText(
				res?.output_text ??
				res?.data?.output_text ??
				res?.output ??
				res?.data?.output ??
				res?.content ??
				res?.message?.content ??
				res?.message ??
				res?.response ??
				res?.choices?.[0]?.message?.content
			);
			if (!content || typeof content !== 'string') return undefined;

			${ANSWER_JSON_HANDLER_BODY}
		}`
	};
}

function createOpenAICompatibleAnswererWrapper(config: QuickApiConfig): AnswererWrapper {
	const url = /chat\/completions\/?$/i.test(config.url)
		? config.url
		: config.url.replace(/\/$/, '') + '/chat/completions';
	const headers = createAuthHeaders(config);

	return {
		name: config.name || 'OpenAI兼容题库',
		url,
		homepage: config.homepage || new URL(config.url).origin,
		method: 'post',
		type: 'GM_xmlhttpRequest',
		contentType: 'json',
		headers,
		data: {
			model: config.model || DEFAULT_MODEL,
			temperature: 0.2,
			messages: {
				handler: `return (env)=>[
					{
						role: 'system',
						content: ${JSON.stringify(ANSWER_SYSTEM_PROMPT.join('\n'))}
					},
					{
						role: 'user',
						content: [
							'题目类型：' + (env.type || 'unknown'),
							'题目：' + (env.title || ''),
							'选项：',
							env.options || '无'
						].join('\\n')
					}
				]`
			}
		},
		handler: `return (res)=>{
			if (!res || res.error) return undefined;

			const content = res?.choices?.[0]?.message?.content ?? res?.data?.choices?.[0]?.message?.content;
			if (!content || typeof content !== 'string') return undefined;

			${ANSWER_JSON_HANDLER_BODY}
		}`
	};
}

function createAuthHeaders(config: QuickApiConfig, includeGenericAliases = false) {
	const headers: Record<string, string> = {
		'Content-Type': 'application/json'
	};

	if (!config.key) {
		return headers;
	}

	const prefixedKey = formatAuthValue(config);
	if (config.keyHeader) {
		headers[config.keyHeader] = prefixedKey;
		return headers;
	}

	headers.Authorization = prefixedKey;

	if (includeGenericAliases) {
		headers['X-API-Key'] = config.key;
		headers.token = config.key;
		headers.apikey = config.key;
	}

	return headers;
}

function formatAuthValue(config: QuickApiConfig) {
	if (!config.key) {
		return '';
	}

	if (config.authPrefix === undefined) {
		return `Bearer ${config.key}`;
	}

	const prefix = config.authPrefix.trim();
	if (['none', 'raw'].includes(prefix.toLowerCase())) {
		return config.key;
	}

	return `${prefix} ${config.key}`;
}

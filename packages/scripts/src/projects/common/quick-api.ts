import type { AnswererWrapper } from '@ocsjs/core';

type QuickApiConfig = {
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
		return String(value).trim();
	};

	const parseJson = (text)=>{
		try {
			return JSON.parse(text);
		} catch {
			const match = text.match(/\\{[\\s\\S]*\\}/);
			if (!match) return undefined;
			try {
				return JSON.parse(match[0]);
			} catch {
				return undefined;
			}
		}
	};

	const parsed = parseJson(content);
	if (!parsed) return [[content.trim(), content.trim()]];

	const question = normalize(parsed.question || parsed.title || '');
	const answers = Array.isArray(parsed.answers)
		? parsed.answers.map((item)=> normalize(item)).filter(Boolean)
		: normalize(parsed.answer)
			? [normalize(parsed.answer)]
			: [];

	if (answers.length === 0) return undefined;
	return answers.map((answer)=> [question, answer]);
`;

export function parseQuickApiConfig(raw: string): QuickApiConfig {
	const text = raw.trim();

	if (text.startsWith('{')) {
		const parsed = JSON.parse(text) as QuickApiConfig;
		if (!parsed?.url) {
			throw new Error('URL+Key 配置缺少 url 字段。');
		}
		return parsed;
	}

	const config: Partial<QuickApiConfig> = {};
	for (const line of text.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed) {
			continue;
		}

		const matched = trimmed.match(/^([\w-]+)\s*[:：]\s*(.+)$/);
		if (!matched) {
			continue;
		}

		const key = matched[1].toLowerCase();
		const value = matched[2].trim();

		if (key === 'url') {
			config.url = value;
		} else if (['key', 'token', 'apikey', 'api-key'].includes(key)) {
			config.key = value;
		} else if (key === 'name') {
			config.name = value;
		} else if (['model', 'modelname', 'model-name'].includes(key)) {
			config.model = value;
		} else if (['api', 'endpoint', 'mode'].includes(key)) {
			config.api = value.toLowerCase().includes('responses') ? 'responses' : 'chat';
		} else if (['homepage', 'home'].includes(key)) {
			config.homepage = value;
		} else if (['header', 'keyheader', 'key-header', 'authheader', 'auth-header'].includes(key)) {
			config.keyHeader = value;
		} else if (['prefix', 'authprefix', 'auth-prefix', 'scheme', 'authorization'].includes(key)) {
			config.authPrefix = value;
		} else if (key === 'method') {
			config.method = value.toLowerCase() === 'get' ? 'get' : 'post';
		}
	}

	if (!config.url) {
		throw new Error(
			'URL+Key 配置格式错误，请至少填写 url，例如：url: https://example.com/search 和 key: your-key'
		);
	}

	return config as QuickApiConfig;
}

export function createQuickApiAnswererWrapper(config: QuickApiConfig): AnswererWrapper {
	if (isResponsesApiQuickApi(config)) {
		return createResponsesApiAnswererWrapper(config);
	}

	if (isOpenAICompatibleQuickApi(config)) {
		return createOpenAICompatibleAnswererWrapper(config);
	}

	return createGenericApiAnswererWrapper(config);
}

function createGenericApiAnswererWrapper(config: QuickApiConfig): AnswererWrapper {
	const method = config.method || 'post';
	const headers: Record<string, string> = {
		'Content-Type': 'application/json'
	};

	if (config.key) {
		const prefix =
			config.authPrefix === undefined
				? 'Bearer '
				: ['none', 'raw'].includes(config.authPrefix.toLowerCase())
					? ''
					: config.authPrefix.endsWith(' ')
						? config.authPrefix
						: config.authPrefix + ' ';

		if (config.keyHeader) {
			headers[config.keyHeader] = prefix + config.key;
		} else {
			headers.Authorization = prefix + config.key;
			headers['X-API-Key'] = config.key;
			headers.token = config.key;
			headers.apikey = config.key;
		}
	}

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
			const question = res?.question || res?.data?.question || '';
			const toAnswerString = (value)=>{
				if (value === undefined || value === null) return '';
				if (Array.isArray(value)) return value.map(toAnswerString).filter(Boolean).join('#');
				if (typeof value === 'object') return toAnswerString(value.answer ?? value.content ?? value.text ?? value.value);
				return String(value);
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

			return normalized.map((answer)=> [question, answer]);
		}`
	};
}

function isResponsesApiQuickApi(config: QuickApiConfig) {
	return String(config.api || '').toLowerCase() === 'responses' || /responses\/?$/i.test(config.url);
}

function isOpenAICompatibleQuickApi(config: QuickApiConfig) {
	return (
		Boolean(config.model) ||
		/chat\/completions\/?$/i.test(config.url) ||
		/\/v\d+(?:\.\d+)?\/?$/i.test(config.url)
	);
}

function createResponsesApiAnswererWrapper(config: QuickApiConfig): AnswererWrapper {
	const url = /responses\/?$/i.test(config.url) ? config.url : config.url.replace(/\/$/, '') + '/responses';
	const headers = createBearerHeaders(config);

	return {
		name: config.name || 'Responses兼容题库',
		url,
		homepage: config.homepage || new URL(config.url).origin,
		method: 'post',
		type: 'GM_xmlhttpRequest',
		contentType: 'json',
		headers,
		data: {
			model: config.model || 'mimo-v2.5-pro',
			temperature: 0.2,
			instructions: ANSWER_SYSTEM_PROMPT.join('\n'),
			input: {
				handler: QUESTION_INPUT_HANDLER
			}
		},
		handler: `return (res)=>{
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
						value.message ??
						value.output ??
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
				res?.message ??
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
	const headers = createBearerHeaders(config);

	return {
		name: config.name || 'OpenAI兼容题库',
		url,
		homepage: config.homepage || new URL(config.url).origin,
		method: 'post',
		type: 'GM_xmlhttpRequest',
		contentType: 'json',
		headers,
		data: {
			model: config.model || 'mimo-v2.5-pro',
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
			const content = res?.choices?.[0]?.message?.content;
			if (!content || typeof content !== 'string') return undefined;

			${ANSWER_JSON_HANDLER_BODY}
		}`
	};
}

function createBearerHeaders(config: QuickApiConfig) {
	const headers: Record<string, string> = {
		'Content-Type': 'application/json'
	};

	if (config.key) {
		if (config.keyHeader) {
			headers[config.keyHeader] = config.key;
		} else {
			headers.Authorization = `Bearer ${config.key}`;
		}
	}

	return headers;
}

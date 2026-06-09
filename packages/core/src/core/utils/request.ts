import { $ } from '../../utils/common';

/**
 * 发起请求
 * @param url 请求地址
 * @param opts 请求参数
 */
export function request<T extends 'json' | 'text'>(
	url: string,
	opts: {
		type: 'fetch' | 'GM_xmlhttpRequest';
		method?: 'get' | 'post' | 'head';
		responseType?: T;
		headers?: Record<string, string>;
		data?: Record<string, any>;
	}
): Promise<T extends 'json' ? any : string> {
	return new Promise((resolve, reject) => {
		try {
			/** 默认参数 */
			const { responseType = 'json', method = 'get', type = 'fetch', data = {}, headers = {} } = opts || {};
			/** 环境变量 */
			const env = $.isInBrowser() ? 'browser' : 'node';

			/** 如果是跨域模式并且是浏览器环境 */
			if (type === 'GM_xmlhttpRequest' && env === 'browser') {
				if (typeof GM_xmlhttpRequest !== 'undefined') {
					const contentType = headers['Content-Type'] || headers['content-type'];
					const requestData =
						contentType === 'application/x-www-form-urlencoded'
							? new URLSearchParams(data).toString()
							: Object.keys(data).length
							? JSON.stringify(data)
							: undefined;
					// eslint-disable-next-line no-undef
					GM_xmlhttpRequest({
						url,
						method: method.toUpperCase() as 'GET' | 'HEAD' | 'POST',
						data: requestData,
						headers: Object.keys(headers).length ? headers : undefined,
						responseType: responseType === 'json' ? 'json' : undefined,
						onload: (response) => {
							if (response.status >= 200 && response.status < 300) {
								if (responseType === 'json') {
									resolve(
										parseJsonResponse(response.response ?? response.responseText) as T extends 'json' ? any : string
									);
								} else {
									resolve((response.responseText || '') as T extends 'json' ? any : string);
								}
							} else {
								reject(createRequestError(response.status, response.responseText));
							}
						},
						onerror: (err) => {
							console.error('GM_xmlhttpRequest error', err);
							reject(new Error('题库连接失败，请检查网络或跨域权限。'));
						}
					});
				} else {
					reject(new Error('GM_xmlhttpRequest is not defined'));
				}
			} else {
				const fet: typeof fetch = env === 'node' ? require('node-fetch').default : fetch;

				fet(url, { body: method === 'post' ? JSON.stringify(data) : undefined, method, headers })
					.then(async (response) => {
						const text = await response.text();
						if (!response.ok) {
							throw createRequestError(response.status, text || response.statusText);
						}

						if (responseType === 'json') {
							resolve(parseJsonResponse(text) as T extends 'json' ? any : string);
						} else {
							resolve(text as T extends 'json' ? any : string);
						}
					})
					.catch((error) => {
						reject(error instanceof Error ? error : new Error(String(error)));
					});
			}
		} catch (error) {
			reject(error);
		}
	});
}

export function parseJsonResponse(value: unknown) {
	if (value !== undefined && value !== null && typeof value !== 'string') {
		return value;
	}

	const text = String(value || '').trim();
	if (!text) {
		throw new Error('题库返回不是有效 JSON');
	}

	try {
		return JSON.parse(text);
	} catch {
		throw new Error('题库返回不是有效 JSON');
	}
}

export function createRequestError(status: number, body?: string) {
	const detail = String(body || '')
		.trim()
		.slice(0, 120);
	return new Error(`题库请求失败（HTTP ${status}）${detail ? '：' + detail : ''}`);
}

const BLOCKED_SETTING_KEYS = ['__proto__', 'constructor', 'prototype'];

export function parseSettingsImport(raw: string): Record<string, unknown> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new Error('文件不是有效 JSON，请确认导入的是 .ocssetting 设置文件。');
	}

	if (!isPlainObject(parsed)) {
		throw new Error('设置文件格式错误，根内容必须是一个对象。');
	}

	const safeSettings: Record<string, unknown> = {};
	for (const key of Object.keys(parsed)) {
		if (BLOCKED_SETTING_KEYS.includes(key)) {
			continue;
		}
		safeSettings[key] = parsed[key];
	}

	if (Object.keys(safeSettings).length === 0) {
		throw new Error('设置文件中没有可导入的设置项。');
	}

	return safeSettings;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	if (Object.prototype.toString.call(value) !== '[object Object]') {
		return false;
	}

	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

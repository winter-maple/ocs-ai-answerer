const BLOCKED_SETTING_KEYS = ['__proto__', 'constructor', 'prototype'];

export interface ParsedNotificationWebhooks {
	urls: string[];
	skipped: string[];
}

export function parseNotificationWebhooks(raw: string, message: string): ParsedNotificationWebhooks {
	const encodedMessage = encodeURIComponent(message);
	const urls: string[] = [];
	const skipped: string[] = [];
	const seen = new Set<string>();

	for (const line of raw.split(/\r?\n/)) {
		const webhook = line.trim();
		if (!webhook || webhook.startsWith('#')) {
			continue;
		}

		// eslint-disable-next-line no-template-curly-in-string
		const resolved = webhook.split('${message}').join(encodedMessage);
		if (!isHttpUrl(resolved)) {
			skipped.push(webhook);
			continue;
		}

		if (!seen.has(resolved)) {
			seen.add(resolved);
			urls.push(resolved);
		}
	}

	return { urls, skipped };
}

export function collectSettingsForExport(keys: string[], getValue: (key: string) => unknown): Record<string, unknown> {
	const settings = Object.create(null) as Record<string, unknown>;

	for (const key of keys) {
		if (isBlockedSettingKey(key)) {
			continue;
		}

		const value = getValue(key);
		if (value !== undefined) {
			settings[key] = value;
		}
	}

	return settings;
}

export function normalizeDisabledAnswererNames(disabledNames: string[], answererNames: string[]): string[] {
	const available = new Set(answererNames);
	const normalized: string[] = [];
	const seen = new Set<string>();

	for (const name of disabledNames) {
		if (!available.has(name) || seen.has(name)) {
			continue;
		}
		seen.add(name);
		normalized.push(name);
	}

	return normalized;
}

function isHttpUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return url.protocol === 'http:' || url.protocol === 'https:';
	} catch {
		return false;
	}
}

function isBlockedSettingKey(key: string): boolean {
	return BLOCKED_SETTING_KEYS.includes(key);
}

const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif)$/i;
const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;
const SAFE_TAG_COLORS = ['blue', 'gray'];

export function normalizeExternalText(value: unknown, fallback = '') {
	const text = value === undefined || value === null ? '' : String(value);
	if (!text.trim()) {
		return fallback;
	}

	const template = document.createElement('template');
	template.innerHTML = text;
	for (const img of Array.from(template.content.querySelectorAll('img'))) {
		img.replaceWith(document.createTextNode(' ' + (img.getAttribute('src') || img.src || '') + ' '));
	}

	const normalized = (template.content.textContent || text).trim();
	return normalized || fallback;
}

export function createSafeContentNodes(value: unknown, fallback = '') {
	const text = normalizeExternalText(value, fallback);
	const nodes: Node[] = [];
	let lastIndex = 0;

	text.replace(URL_PATTERN, (url, index) => {
		if (index > lastIndex) {
			nodes.push(document.createTextNode(text.slice(lastIndex, index)));
		}

		if (isSafeImageUrl(url)) {
			const img = document.createElement('img');
			img.src = url;
			img.alt = '题目图片';
			img.loading = 'lazy';
			img.referrerPolicy = 'no-referrer';
			nodes.push(img);
		} else {
			nodes.push(document.createTextNode(url));
		}

		lastIndex = index + url.length;
		return url;
	});

	if (lastIndex < text.length) {
		nodes.push(document.createTextNode(text.slice(lastIndex)));
	}

	return nodes.length ? nodes : [document.createTextNode(fallback)];
}

export function createSafeContentSpan(value: unknown, fallback = '') {
	const span = document.createElement('span');
	span.append(...createSafeContentNodes(value, fallback));
	return span;
}

export function createSafeCode(value: unknown, fallback = '') {
	const code = document.createElement('code');
	code.append(...createSafeContentNodes(value, fallback));
	return code;
}

export function createSafeHomepageNode(name: unknown, homepage: unknown) {
	const label = normalizeExternalText(name, '未知题库');
	const href = safeHttpUrl(homepage);
	if (!href) {
		return document.createTextNode(label);
	}

	const anchor = document.createElement('a');
	anchor.href = href;
	anchor.target = '_blank';
	anchor.rel = 'noreferrer noopener';
	anchor.textContent = label;
	return anchor;
}

export function getSafeTagColor(color: unknown) {
	const value = normalizeExternalText(color).toLowerCase();
	return SAFE_TAG_COLORS.includes(value) ? value : '';
}

export function safeHttpUrl(value: unknown) {
	const text = value === undefined || value === null ? '' : String(value).trim();
	if (!text) {
		return undefined;
	}

	try {
		const url = new URL(text);
		return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined;
	} catch {
		return undefined;
	}
}

function isSafeImageUrl(value: string) {
	const href = safeHttpUrl(value);
	if (!href) {
		return false;
	}
	return IMAGE_EXTENSIONS.test(new URL(href).pathname);
}

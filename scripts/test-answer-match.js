// @ts-check

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

require('browser-env')();

function installTsRequireHook() {
	const previous = require.extensions['.ts'];
	require.extensions['.ts'] = function (mod, filename) {
		const source = fs.readFileSync(filename, 'utf8');
		const { outputText } = ts.transpileModule(source, {
			compilerOptions: {
				module: ts.ModuleKind.CommonJS,
				target: ts.ScriptTarget.ES2020,
				esModuleInterop: true
			},
			fileName: filename
		});
		mod._compile(outputText, filename);
	};
	return () => {
		if (previous) {
			require.extensions['.ts'] = previous;
		} else {
			delete require.extensions['.ts'];
		}
	};
}

const restoreTsRequireHook = installTsRequireHook();
const { createDefaultQuestionResolver } = require(path.resolve(
	__dirname,
	'../packages/core/src/core/worker/question.resolver.ts'
));
restoreTsRequireHook();

function createOption(text) {
	const option = document.createElement('label');
	option.textContent = text;
	option.innerText = text;
	return option;
}

function createInfos(answer) {
	return [
		{
			name: 'test',
			results: [{ question: 'question', answer }]
		}
	];
}

function createContext(type, answerMatchMode = 'exact') {
	return {
		root: document.createElement('div'),
		elements: { options: [] },
		searchInfos: [],
		type,
		answerSeparators: ['#', '|', ';', '；'],
		answerMatchMode
	};
}

async function resolve(type, answer, optionTexts, answerMatchMode = 'exact') {
	const ctx = createContext(type, answerMatchMode);
	const options = optionTexts.map(createOption);
	const selected = [];
	const result = await createDefaultQuestionResolver(ctx)[type](
		createInfos(answer),
		options,
		async (_, ans, option) => {
			selected.push({ answer: ans, text: option.innerText });
		}
	);
	return { result, selected };
}

(async () => {
	for (const [answer, expected] of [
		['A', 'Alpha'],
		['a', 'Alpha'],
		['答案：B', 'Beta'],
		['答案是 B', 'Beta'],
		['选项 C', 'Gamma'],
		['A. Alpha', 'Alpha']
	]) {
		const { result, selected } = await resolve('single', answer, ['Alpha', 'Beta', 'Gamma', 'Delta']);
		assert.strictEqual(result.finish, true, answer);
		assert.deepStrictEqual(
			selected.map((item) => item.text),
			[expected],
			answer
		);
	}

	for (const answer of ['AC', 'A,C', 'A、C', 'A C', '答案：A/C', 'A,A,C']) {
		const { result, selected } = await resolve('multiple', answer, ['Alpha', 'Beta', 'Gamma', 'Delta']);
		assert.strictEqual(result.finish, true, answer);
		assert.deepStrictEqual(
			selected.map((item) => item.text),
			['Alpha', 'Gamma'],
			answer
		);
	}

	{
		const { result, selected } = await resolve('single', 'E', ['Alpha', 'Beta', 'Gamma', 'Delta']);
		assert.strictEqual(result.finish, false);
		assert.deepStrictEqual(selected, []);
	}

	{
		const { result, selected } = await resolve('single', 'A/C because unsure', ['Alpha', 'Beta', 'Gamma', 'Delta']);
		assert.strictEqual(result.finish, false);
		assert.deepStrictEqual(selected, []);
	}

	{
		const { result, selected } = await resolve('multiple', 'A,E', ['Alpha', 'Beta', 'Gamma', 'Delta']);
		assert.strictEqual(result.finish, false);
		assert.deepStrictEqual(selected, []);
	}

	{
		const { result, selected } = await resolve('single', 'Beta', ['Alpha', 'Beta', 'Gamma'], 'exact');
		assert.strictEqual(result.finish, true);
		assert.deepStrictEqual(
			selected.map((item) => item.text),
			['Beta']
		);
	}

	console.log('answer-match tests passed');
})();

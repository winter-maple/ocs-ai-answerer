// @ts-check

const { series } = require('gulp');
const del = require('del');
const util = require('util');
const { version } = require('../package.json');
const execOut = util.promisify(require('./utils').execOut);
const path = require('path');
const dotenv = require('dotenv');
const fs = require('fs');

dotenv.config();

const distPath = process.env.BUILD_PATH || '../dist';
console.log('BUILD_PATH: ', distPath);
const distResolvedPath = path.resolve(__dirname, distPath);
process.env.VITE_BUILD_PATH =
	process.env.VITE_BUILD_PATH || path.relative(path.resolve(__dirname, '../packages/core'), distResolvedPath);

function cleanOutput() {
	return del([distPath, '../lib'], { force: true });
}

async function buildPackages() {
	// @ts-ignore
	await execOut('tsc', { cwd: '../packages/utils' });
	// @ts-ignore
	await execOut('tsc', { cwd: '../packages/core' });
	// @ts-ignore
	await execOut('vite build', { cwd: '../packages/core' });
	// @ts-ignore
	await execOut('tsc', { cwd: '../packages/scripts' });
	// @ts-ignore
	await execOut('vite build', { cwd: '../packages/scripts' });
}

async function createUserJs() {
	const { createUserScript } = require('../packages/utils');

	/** 模拟浏览器环境 */
	require('browser-env')();

	// @ts-ignore
	globalThis.unsafeWindow = {};

	/** @type {import('../packages/scripts/src/index')} */
	// @ts-ignore
	const ocs = require(path.join(distPath, 'index.js'));

	/** @return {import('../packages/utils').CreateOptions} */
	const createOptions = () => {
		const { CXProject, ZHSProject, ZJYProject, IcveMoocProject, ICourseProject, YKTProject } = ocs;
		const projectList = [CXProject, ZHSProject, ZJYProject, IcveMoocProject, ICourseProject, YKTProject]
			.map((s) => `【${s.name}】`)
			.join(' ');

		const matchMetadata = Array.from(
			new Set(
				ocs
					.definedProjects()
					.map((p) => (p.domains || []).map((d) => `*://*.${d}/*`))
					.flat()
			)
		);

		return {
			parseRequire: true,
			parseResource: true,
			resourceBuilder: (key, value) => `const ${key} = \`${value}\`;`,
			metaDataFormatter: {
				header: '==UserScript==',
				footer: '==/UserScript==',
				prefix: '// ',
				symbol: '@',
				gap: '\t'.repeat(4)
			},
			metadata: {
				name: 'OCS 网课助手',
				version: version,
				description: [
					'OCS AI Answerer 基于 ocsjs/ocsjs，增加 OpenAI 兼容题库接入能力。',
					'原 OCS(online-course-script) 网课助手官网 https://docs.ocsjs.com ，专注于帮助大学生从网课中释放出来',
					'让自己的时间把握在自己的手中，拥有人性化的操作页面，流畅的步骤提示，支持 ',
					projectList,
					'等网课的学习，作业。具体的功能请查看脚本悬浮窗中的教程页面。'
				].join(' '),
				author: ['winter-maple', 'enncy'],
				license: 'MIT',
				namespace: 'https://github.com/winter-maple/ocs-ai-answerer',
				homepage: 'https://github.com/winter-maple/ocs-ai-answerer',
				source: 'https://github.com/winter-maple/ocs-ai-answerer',
				supportURL: 'https://github.com/winter-maple/ocs-ai-answerer/issues',
				icon: 'https://cdn.ocsjs.com/logo.png',
				connect: [
					'enncy.cn',
					'icodef.com',
					'ocsjs.com',
					'zaizhexue.top',
					'xiaomimimo.com',
					'deepseek.com',
					'localhost',
					'127.0.0.1'
				],
				match: matchMetadata,
				grant: [
					'GM_info',
					'GM_getTab',
					'GM_saveTab',
					'GM_setValue',
					'GM_getValue',
					'unsafeWindow',
					'GM_listValues',
					'GM_deleteValue',
					'GM_notification',
					'GM_xmlhttpRequest',
					'GM_getResourceText',
					'GM_addValueChangeListener',
					'GM_removeValueChangeListener'
				],
				require: [path.join(__dirname, distPath, 'index.js')],
				resource: [`STYLE ${path.join(__dirname, '../packages/scripts/assets/css/style.css')}`],
				'run-at': 'document-start',
				antifeature: 'payment'
			},
			entry: path.join(__dirname, '../packages/scripts/entry.js'),
			dist: path.join(__dirname, distPath, 'ocs.user.js')
		};
	};

	const officialOpts = createOptions();
	officialOpts.metadata.downloadURL =
		'https://raw.githubusercontent.com/winter-maple/ocs-ai-answerer/main/userscripts/ocs.user.js';
	officialOpts.metadata.updateURL =
		'https://raw.githubusercontent.com/winter-maple/ocs-ai-answerer/main/userscripts/ocs.user.js';
	console.log('CreateUserScript: ', officialOpts.metadata.name, officialOpts.dist);
	await createUserScript(officialOpts);

	/** 创建调试脚本 */
	const devOpts = createOptions();
	devOpts.parseRequire = false;
	devOpts.parseResource = false;
	devOpts.metadata.name = devOpts.metadata.name + '(dev)';
	devOpts.metadata.require = ['file:///' + path.join(distResolvedPath, 'index.js')];
	devOpts.metadata.resource = [`STYLE file:///${path.join(__dirname, '../packages/scripts/assets/css/style.css')}`];
	devOpts.entry = path.join(__dirname, '../packages/scripts/entry.dev.js');
	devOpts.dist = path.join(distResolvedPath, 'ocs.dev.user.js');
	/** 导出样式文件 */
	fs.copyFileSync(
		path.join(__dirname, '../packages/scripts/assets/css/style.css'),
		path.join(distResolvedPath, 'style.css')
	);
	console.log('createUserScript: ', devOpts.metadata.name, devOpts.dist);
	await createUserScript(devOpts);

	/** 创建全Connect域名通用脚本 */
	const commonOpts = createOptions();
	commonOpts.metadata.name = commonOpts.metadata.name + ' - 全域名通用版';
	commonOpts.metadata.downloadURL =
		'https://raw.githubusercontent.com/winter-maple/ocs-ai-answerer/main/userscripts/ocs.common.user.js';
	commonOpts.metadata.updateURL =
		'https://raw.githubusercontent.com/winter-maple/ocs-ai-answerer/main/userscripts/ocs.common.user.js';
	const connect = Array.isArray(commonOpts.metadata.connect) ? commonOpts.metadata.connect : [];
	connect.push('*');
	commonOpts.metadata.connect = connect;
	commonOpts.entry = path.join(__dirname, '../packages/scripts/entry.common.js');
	commonOpts.dist = path.join(distResolvedPath, 'ocs.common.user.js');

	console.log('createUserScript: ', commonOpts.metadata.name, commonOpts.dist);
	await createUserScript(commonOpts);

	const userscriptsPath = path.resolve(__dirname, '../userscripts');
	fs.mkdirSync(userscriptsPath, { recursive: true });
	fs.copyFileSync(officialOpts.dist, path.join(userscriptsPath, 'ocs.user.js'));
	fs.copyFileSync(commonOpts.dist, path.join(userscriptsPath, 'ocs.common.user.js'));
}

exports.default = series(cleanOutput, buildPackages, createUserJs);

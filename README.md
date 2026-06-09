# OCS AI Answerer

OCS AI Answerer 是基于 [ocsjs/ocsjs](https://github.com/ocsjs/ocsjs) 的网课助手增强版，重点补充了 AI 大模型题库接入能力。

原项目 OCS (Online Course Script) 是网课助手脚本，支持超星学习通、知到智慧树、职教云、智慧职教、中国大学 MOOC、雨课堂等平台。原项目官网及教程见 [docs.ocsjs.com](https://docs.ocsjs.com)。

## 这个版本新增了什么

- `URL+Key` 题库解析器支持 OpenAI 兼容接口。
- 支持 `/v1/chat/completions` 接口。
- 支持 `/v1/responses` 接口。
- 构建脚本内置 `xiaomimimo.com` 跨域白名单。
- 可接入 MiMo 或其他兼容 OpenAI 协议的中转站 API。

## 安装脚本

安装前请先准备一个用户脚本管理器，例如 [Tampermonkey](https://www.tampermonkey.net/) 或 [脚本猫](https://scriptcat.org/)。

推荐优先安装普通版：

[一键安装普通版](https://raw.githubusercontent.com/winter-maple/ocs-ai-answerer/main/userscripts/ocs.user.js)

如果遇到第三方 API 跨域请求限制，可改用全域名通用版：

[一键安装全域名通用版](https://raw.githubusercontent.com/winter-maple/ocs-ai-answerer/main/userscripts/ocs.common.user.js)

也可以在仓库中手动查看脚本：

- [userscripts/ocs.user.js](userscripts/ocs.user.js)
- [userscripts/ocs.common.user.js](userscripts/ocs.common.user.js)

## Chat Completions 配置

打开脚本面板：

```text
通用 -> 全局设置 -> 题库配置
```

解析器选择：

```text
URL+Key
```

填写后可以先点击 `测试URL+Key`，脚本会用一题简单单选题检查接口地址、key、模型和返回解析是否可用；测试不会保存配置，也不会展示你的 key。

填写示例：

```text
url: https://你的中转站/v1
key: 你的 key
model: 你的模型名
name: AI Answerer
```

如果你的中转站要求完整路径，也可以写：

```text
url: https://你的中转站/v1/chat/completions
key: 你的 key
model: 你的模型名
name: AI Answerer
```

## Responses API 配置

如果中转站使用 Responses API，可以直接填写：

```text
url: https://你的中转站/v1/responses
key: 你的 key
model: 你的模型名
name: Responses Answerer
```

也可以用 `/v1` 加 `api: responses`：

```text
url: https://你的中转站/v1
api: responses
key: 你的 key
model: 你的模型名
name: Responses Answerer
```

## MiMo 配置示例

```text
url: https://token-plan-cn.xiaomimimo.com/v1
key: 你的 key
model: mimo-v2.5-pro
name: Xiaomi Mimo
```

## DeepSeek 配置示例

```text
url: https://api.deepseek.com
key: 你的 key
model: deepseek-v4-flash
name: DeepSeek
```

## 安全与设置导入

- 第三方题库返回的题目、答案和标签会被当作不可信内容处理，脚本只会把图片 URL 渲染为图片，其他内容按普通文本显示。
- 不要把真实 key 发到 issue、PR、截图或公开聊天里；如果 key 已经泄露，请到对应平台后台轮换或删除。
- 导入 `.ocssetting` 设置文件时，请确认文件来自可信来源。导入失败通常是因为文件不是 JSON、根内容不是 OCS 设置对象，或文件内容已经损坏。
- 通知回调只会请求 `http/https` 地址；`${message}` 会替换为 URL 编码后的通知内容，非法配置行会被忽略。
- 导出 `.ocssetting` 会保留 `false`、`0`、空字符串等有效配置值，避免恢复设置时丢失用户选择。

## 开发说明

常用命令：

```bash
pnpm install
pnpm build
```

当前项目仍沿用原 OCS 的工程结构。AI 快捷题库配置逻辑位于：

```text
packages/scripts/src/projects/common/quick-api.ts
```

用户脚本构建元信息位于：

```text
scripts/build-core.js
```

## 来源与协议

本项目基于 [ocsjs/ocsjs](https://github.com/ocsjs/ocsjs) 修改，原作者为 enncy，原项目采用 MIT 协议。

本仓库继续遵循 MIT 协议。请保留 `LICENSE` 文件和原项目来源说明。

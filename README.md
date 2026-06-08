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

构建后的用户脚本在 `dist` 或本地导出的 `outputs` 目录中。

推荐优先安装：

```text
ocs.user.js
```

如果遇到第三方 API 跨域请求限制，可改用：

```text
ocs.common.user.js
```

## Chat Completions 配置

打开脚本面板：

```text
通用 -> 全局设置 -> 题库配置
```

解析器选择：

```text
URL+Key
```

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

## 开发说明

常用命令：

```bash
pnpm install
pnpm build
```

当前项目仍沿用原 OCS 的工程结构。核心题库配置逻辑位于：

```text
packages/scripts/src/projects/common.ts
```

用户脚本构建元信息位于：

```text
scripts/build-core.js
```

## 来源与协议

本项目基于 [ocsjs/ocsjs](https://github.com/ocsjs/ocsjs) 修改，原作者为 enncy，原项目采用 MIT 协议。

本仓库继续遵循 MIT 协议。请保留 `LICENSE` 文件和原项目来源说明。

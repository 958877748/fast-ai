# @guolei1994/fast-ai

轻量、同构（Node.js 与浏览器）的 AI 工具库，提供 OpenAI 风格的对话与函数调用（Tools / Function Calling）能力，默认兼容 ModelScope OpenAI 接口。

- **同构运行**: 一套 API 同时适用于 Node 与浏览器
- **OpenAI 风格接口**: 使用 `chat/completions` 语义，默认基于 `https://api-inference.modelscope.cn/v1`
- **函数调用（Tools）**: 基于 `zod` 定义参数，自动转换为 JSON Schema
- **按需集成**: 导出 `createOpenAI`、`generateText`、`createTool` 等实用方法

## 安装

请同时安装 peer dependencies：`zod` 与 `zod-to-json-schema`。

```bash
# npm
yarn add @guolei1994/fast-ai zod zod-to-json-schema
# 或者
npm i @guolei1994/fast-ai zod zod-to-json-schema
# 或者
pnpm add @guolei1994/fast-ai zod zod-to-json-schema
```

Node.js 18+（或支持 fetch 的运行时）推荐。

## 快速开始（Node / ESM）

```ts
import { createOpenAI, generateText } from '@guolei1994/fast-ai';

// 你可以使用 ModelScope 的 API Key，或兼容的 OpenAI 风格服务
const client = createOpenAI({
  // 可选：自定义 baseURL。默认 https://api-inference.modelscope.cn/v1
  // baseURL: 'https://api-inference.modelscope.cn/v1',
  apiKey: process.env.MODELSCOPE_API_KEY!,
});

async function main() {
  const { text } = await generateText({
    client,
    model: 'Qwen/Qwen2.5-7B-Instruct', // 具体模型名称按服务商实际为准
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: '用一句话解释什么是同构库。' },
    ],
  });
  console.log(text);
}

main();
```

## 函数调用（Tools）示例

使用 `zod` 定义工具的参数，`generateText` 会在模型触发工具调用时自动执行并把结果回传给模型，直到返回自然语言回复。

```ts
import { z } from 'zod';
import { createOpenAI, generateText, createTool } from '@guolei1994/fast-ai';

const weatherTool = createTool({
  name: 'get_weather',
  description: '查询某城市当前天气',
  parameters: z.object({ city: z.string() }),
  async execute({ city }) {
    // 这里用真实 API 替换即可
    return `${city} 晴，28℃`;
  },
});

const client = createOpenAI({ apiKey: process.env.MODELSCOPE_API_KEY! });

const { text } = await generateText({
  client,
  model: 'Qwen/Qwen2.5-7B-Instruct',
  messages: [
    { role: 'user', content: '今天上海天气怎么样？' },
  ],
  tools: [weatherTool],
  onToolCall: (name) => console.log('调用工具:', name),
});

console.log(text);
```

## 浏览器使用

本包提供 IIFE 版本：`dist/fast-ai.global.js` 与 `dist/fast-ai.global.min.js`，全局变量名为 `FastAI`。

如使用全局构建，需在其前以全局方式引入 `zod` 与 `zod-to-json-schema`（不同 CDN 的 UMD/全局构建入口可能不同，请参考各库发布说明）：

```html
<!-- 示例（路径仅供参考，请以实际 CDN 路径为准） -->
<script src="https://cdn.jsdelivr.net/npm/zod@3/dist/index.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/zod-to-json-schema@3/dist/umd/index.umd.js"></script>
<script src="https://unpkg.com/@guolei1994/fast-ai/dist/fast-ai.global.min.js"></script>
<script>
  const { createOpenAI, generateText, createTool } = window.FastAI;
  const client = createOpenAI({ apiKey: 'YOUR_API_KEY' });
  generateText({
    client,
    model: 'Qwen/Qwen2.5-7B-Instruct',
    messages: [{ role: 'user', content: '你好' }],
  }).then(({ text }) => {
    document.body.innerText = text;
  });
</script>
```

## API 参考

- **createOpenAI(options)**
  - `options.baseURL?: string` 可选，默认 `https://api-inference.modelscope.cn/v1`
  - `options.apiKey: string` 必填
  - 返回 `OpenAIClient`，可用于 `generateText`

- **generateText(options)**
  - 两种调用方式：
    - `{ client: OpenAIClient, model: string, messages: ChatMessage[], tools?, onToolCall? }`
    - `{ model: ChatModelRef, messages: ChatMessage[], tools?, onToolCall? }`（传入由 `createOpenAI` 构造的 `ChatModelRef`）
  - 返回 `{ text: string }`
  - 自动处理工具调用循环，直到模型不再返回 `tool_calls`

- **createTool({ name, description?, parameters, execute })**
  - `parameters` 使用 `zod` schema 定义；内部将自动用 `zod-to-json-schema` 转换为 JSON Schema
  - `execute` 可返回字符串或 `Promise<string>`

- 其他导出：
  - `detectEnvironment(): 'node' | 'browser'`
  - `hello(name?: string): string`

类型与导出可参见源码：`src/index.ts`、`src/fastai.ts`。

## 开发

```bash
# 清理构建产物
npm run clean

# 构建（tsup + rollup 全量构建）
npm run build

# 本地开发（watch）
npm run dev

# 运行测试（vitest）
npm test

# Lint
yarn lint
```

- 生成的类型声明、ESM/CJS 构建产物位于 `dist/`
- 浏览器全局构建产物：`dist/fast-ai.global.js`、`dist/fast-ai.global.min.js`

### 发布

- **自动发布到 npm**: 提交并打上语义化版本标签（例如 `v0.3.0`）后推送到远端，会触发 GitHub Actions，自动构建并发布到 npm。
- **发布步骤**:
  1. 更新版本号：修改 `package.json` 中的 `version`
  2. 提交与打标签：
     ```bash
     git add -A
     git commit -m "chore(release): 0.3.0"
     git tag v0.3.0
     git push && git push --tags
     ```
  3. 推送后，CI 将运行构建与测试，并在成功后执行 `npm publish`（需仓库已配置发布用的 npm token）。

## 许可证

MIT

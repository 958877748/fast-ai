export type Environment = 'node' | 'browser';
export declare function detectEnvironment(): Environment;
export declare function hello(name?: string): string;
declare const _default: {
    detectEnvironment: typeof detectEnvironment;
    hello: typeof hello;
};
export default _default;
export { createOpenAI, generateText, createTool, } from './fastai';
export type { ChatMessage, Tool, } from './fastai';
//# sourceMappingURL=index.d.ts.map
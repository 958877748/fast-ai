import { z } from 'zod';

type ChatMessage = {
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    tool_calls?: Array<ToolCall>;
    tool_call_id?: string;
};
type Tool<T extends z.ZodTypeAny> = {
    name: string;
    description?: string;
    parameters: T;
    execute: (args: z.infer<T>) => Promise<string>;
};
type ToolCall = {
    index: number;
    id: string;
    type: string;
    function: {
        name: string;
        arguments: string;
    };
};
type CreateOpenAIOptions = {
    baseURL?: string;
    apiKey: string;
};
type ChatModelRef = {
    provider: 'openai';
    endpoint: string;
    model: string;
    apiKey: string;
};
type OpenAIClient = ((modelName: string) => ChatModelRef) & {
    baseURL: string;
    apiKey: string;
    chat: (modelName: string) => ChatModelRef;
};
declare function createOpenAI(options: CreateOpenAIOptions): OpenAIClient;
type GenerateTextOptions = {
    model: ChatModelRef;
    messages: ChatMessage[];
    tools?: Array<Tool<z.ZodTypeAny>> | Record<string, Tool<z.ZodTypeAny>>;
    onToolCall?: (toolName: string) => void;
} | {
    client: OpenAIClient;
    model: string;
    messages: ChatMessage[];
    tools?: Array<Tool<z.ZodTypeAny>> | Record<string, Tool<z.ZodTypeAny>>;
    onToolCall?: (toolName: string) => void;
};
declare function generateText(options: GenerateTextOptions): Promise<{
    text: string;
}>;

type Environment = 'node' | 'browser';
declare function detectEnvironment(): Environment;
declare function hello(name?: string): string;
declare const _default: {
    detectEnvironment: typeof detectEnvironment;
    hello: typeof hello;
};

export { type ChatMessage, type Environment, type Tool, createOpenAI, _default as default, detectEnvironment, generateText, hello };

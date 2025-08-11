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
declare function createTool<T extends z.ZodTypeAny>(options: {
    name: string;
    description?: string;
    parameters: T;
    execute: (args: z.infer<T>) => Promise<string> | string;
}): Tool<T>;
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
type GenerateObjectOptions<TSchema extends z.ZodTypeAny> = {
    model: ChatModelRef;
    schema: TSchema;
    prompt: string;
    system?: string;
} | {
    client: OpenAIClient;
    model: string;
    schema: TSchema;
    prompt: string;
    system?: string;
};
/**
 * Generate a structured object validated by the provided Zod schema.
 * Uses tool-calling to force the model to return the object via a single tool call.
 */
declare function generateObject<TSchema extends z.ZodTypeAny>(options: GenerateObjectOptions<TSchema>): Promise<{
    object: z.infer<TSchema>;
}>;

type Environment = 'node' | 'browser';
declare function detectEnvironment(): Environment;
declare function hello(name?: string): string;
declare const _default: {
    detectEnvironment: typeof detectEnvironment;
    hello: typeof hello;
};

export { type ChatMessage, type Environment, type Tool, createOpenAI, createTool, _default as default, detectEnvironment, generateObject, generateText, hello };

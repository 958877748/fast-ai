import { z } from 'zod';
export type ChatMessage = {
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    tool_calls?: Array<ToolCall>;
    tool_call_id?: string;
};
export type Tool<T extends z.ZodTypeAny> = {
    name: string;
    description?: string;
    parameters: T;
    execute: (args: z.infer<T>) => Promise<string>;
};
export declare function createTool<T extends z.ZodTypeAny>(options: {
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
export type CreateOpenAIOptions = {
    baseURL?: string;
    apiKey: string;
};
export type ChatModelRef = {
    provider: 'openai';
    endpoint: string;
    model: string;
    apiKey: string;
};
export type OpenAIClient = ((modelName: string) => ChatModelRef) & {
    baseURL: string;
    apiKey: string;
    chat: (modelName: string) => ChatModelRef;
};
export declare function createOpenAI(options: CreateOpenAIOptions): OpenAIClient;
export type GenerateTextOptions = {
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
export declare function generateText(options: GenerateTextOptions): Promise<{
    text: string;
}>;
export {};
//# sourceMappingURL=fastai.d.ts.map
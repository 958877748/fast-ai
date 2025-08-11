import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

export type ChatMessage = {
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    tool_calls?: Array<ToolCall>
    tool_call_id?: string
};

export type Tool<T extends z.ZodTypeAny> = {
    name: string;
    description?: string;
    parameters: T;
    execute: (args: z.infer<T>) => Promise<string>;
};

type ToolCall = {
    index: number
    id: string
    type: string
    function: {
        name: string
        arguments: string
    }
}

type ChatRespose = {
    choices: Array<{
        message: ChatMessage
    }>
}

// Lightweight OpenAI-style client and text generation with tool support
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

export function createOpenAI(options: CreateOpenAIOptions): OpenAIClient {
    const base = (options.baseURL ?? 'https://api-inference.modelscope.cn/v1').replace(/\/$/, '');
    const apiKey = options.apiKey;
    if (!apiKey) {
        throw new Error('apiKey is required');
    }
    const builder = ((modelName: string): ChatModelRef => ({
        provider: 'openai',
        endpoint: `${base}/chat/completions`,
        model: modelName,
        apiKey,
    })) as OpenAIClient;
    builder.baseURL = base;
    builder.apiKey = apiKey;
    builder.chat = (modelName: string) => builder(modelName);
    return builder;
}

export type GenerateTextOptions =
    | {
          model: ChatModelRef; // legacy: pass pre-bound model ref
          messages: ChatMessage[];
          tools?: Array<Tool<z.ZodTypeAny>> | Record<string, Tool<z.ZodTypeAny>>;
          onToolCall?: (toolName: string) => void;
      }
    | {
          client: OpenAIClient; // preferred: pass client and model string
          model: string;
          messages: ChatMessage[];
          tools?: Array<Tool<z.ZodTypeAny>> | Record<string, Tool<z.ZodTypeAny>>;
          onToolCall?: (toolName: string) => void;
      };

export async function generateText(options: GenerateTextOptions): Promise<{ text: string }> {
    const { messages, onToolCall } = options as any;
    const messageHistory: ChatMessage[] = [...messages];

    // Normalize tools to a Map for easy lookup
    const toolMap = new Map<string, Tool<z.ZodTypeAny>>();
    const toolsInput = (options as any).tools as Array<Tool<z.ZodTypeAny>> | Record<string, Tool<z.ZodTypeAny>> | undefined;
    if (Array.isArray(toolsInput)) {
        for (const t of toolsInput) toolMap.set(t.name, t as Tool<z.ZodTypeAny>);
    } else if (toolsInput && typeof toolsInput === 'object') {
        for (const [name, t] of Object.entries(toolsInput)) toolMap.set(name, t as Tool<z.ZodTypeAny>);
    }

    const toolsJsonSchema = toolMap.size
        ? Array.from(toolMap.values()).map(t => ({
              type: 'function' as const,
              function: {
                  name: t.name,
                  description: t.description,
                  parameters: zodToJsonSchema(t.parameters),
              },
          }))
        : undefined;

    // Normalize transport pieces
    const baseURL = ('client' in options
        ? (options.client as OpenAIClient).baseURL
        : (options.model as ChatModelRef).endpoint.replace(/\/chat\/completions$/, '')).replace(/\/$/, '');

    const endpoint = `${baseURL}/chat/completions`;
    const apiKey = 'client' in options ? options.client.apiKey : (options.model as ChatModelRef).apiKey;
    const modelName = 'client' in options ? (options.model as string) : (options.model as ChatModelRef).model;

    while (true) {
        const res: ChatRespose = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: modelName,
                messages: messageHistory,
                tools: toolsJsonSchema,
            }),
        }).then(r => r.json());

        const assistant = res.choices?.[0]?.message;
        if (!assistant) {
            throw new Error('No message returned');
        }

        messageHistory.push(assistant);

        const tool_calls = assistant.tool_calls;
        if (!tool_calls || tool_calls.length === 0) {
            return { text: assistant.content };
        }

        if (onToolCall) {
            const toolNames = tool_calls.map(c => c.function.name);
            toolNames.forEach(name => onToolCall(name));
        }

        // Execute tools in sequence (can be parallelized if needed)
        for (const call of tool_calls) {
            const tool = toolMap.get(call.function.name);
            if (!tool) {
                throw new Error(`Tool ${call.function.name} not found`);
            }

            const args = tool.parameters.parse(JSON.parse(call.function.arguments));
            const result = await tool.execute(args);

            messageHistory.push({
                role: 'tool',
                content: result,
                tool_call_id: call.id,
            });
        }
        // Loop will continue, sending the tool outputs back to the model
    }
}

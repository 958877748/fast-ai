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

// Helper to create a typed tool with Zod parameters
export function createTool<T extends z.ZodTypeAny>(options: {
    name: string;
    description?: string;
    parameters: T;
    execute: (args: z.infer<T>) => Promise<string> | string;
}): Tool<T> {
    const wrappedExecute = async (args: z.infer<T>): Promise<string> => {
        return Promise.resolve(options.execute(args));
    };
    return {
        name: options.name,
        description: options.description,
        parameters: options.parameters,
        execute: wrappedExecute,
    };
}

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
    apiKey?: string;
};

export type ChatModelRef = {
    endpoint: string;
    model: string;
    apiKey: string;
};

export type OpenAIClient = ((modelName: string) => ChatModelRef) & {
    baseURL: string;
    apiKey: string;
    chat: (modelName: string) => ChatModelRef;
};

export function createOpenAI(options: CreateOpenAIOptions = {}): OpenAIClient {
    const rawBase = options.baseURL ?? process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
    const base = rawBase.replace(/\/$/, '');
    const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error('apiKey is required');
    }
    const builder = ((modelName: string): ChatModelRef => {
        const finalModel = modelName || process.env.OPENAI_MODEL;
        if (!finalModel) {
            throw new Error('model is required');
        }
        return {
            endpoint: `${base}/chat/completions`,
            model: finalModel,
            apiKey,
        };
    }) as OpenAIClient;
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

export async function generateText(options: GenerateTextOptions): Promise<string> {
    const { messages, onToolCall } = options as any;
    const messageHistory: ChatMessage[] = messages;

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
    if (!modelName) {
        throw new Error('model is required');
    }

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
            return assistant.content || '';
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

export type GenerateObjectOptions<TSchema extends z.ZodTypeAny> =
    | {
          model: ChatModelRef;
          schema: TSchema;
          prompt: string;
          system?: string;
      }
    | {
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
export async function generateObject<TSchema extends z.ZodTypeAny>(
    options: GenerateObjectOptions<TSchema>
): Promise<{ object: z.infer<TSchema> }> {
    const schema = options.schema;

    const baseURL = ('client' in options
        ? (options.client as OpenAIClient).baseURL
        : (options.model as ChatModelRef).endpoint.replace(/\/(?:chat\/completions)?$/, ''))
        .replace(/\/$/, '');

    const endpoint = `${baseURL}/chat/completions`;
    const apiKey = 'client' in options ? options.client.apiKey : (options.model as ChatModelRef).apiKey;
    const modelName = 'client' in options ? (options.model as string) : (options.model as ChatModelRef).model;

    const systemPreamble =
        options.system ??
        'You are a structured output assistant. Understand what the user wants, and then respond by calling the tool `submit_object` once, with the parameter being the JSON data that the user wants.';

    const messages: ChatMessage[] = [
        { role: 'system', content: systemPreamble },
        { role: 'user', content: options.prompt },
    ];

    const tools = [
        {
            type: 'function' as const,
            function: {
                name: 'submit_object',
                description: 'Submit the final structured object that matches the required schema.',
                parameters: zodToJsonSchema(schema),
            },
        },
    ];

    const res: ChatRespose = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: modelName,
            messages,
            tools,
        }),
    }).then(r => r.json());

    const assistant = res.choices?.[0]?.message;
    if (!assistant) {
        throw new Error('No message returned');
    }

    // Prefer tool call for guaranteed structure
    const toolCalls = assistant.tool_calls ?? [];
    const submitCall = toolCalls.find(c => c.function?.name === 'submit_object');
    if (submitCall) {
        const rawArgs = submitCall.function.arguments || '{}';
        const parsed = JSON.parse(rawArgs);
        const validated = schema.parse(parsed);
        return { object: validated };
    }

    // Fallback: try to parse the assistant content as JSON and validate
    if (assistant.content) {
        try {
            const fallback = JSON.parse(assistant.content);
            const validated = schema.parse(fallback);
            return { object: validated };
        } catch (_err) {
            // continue to throw structured error below
        }
    }

    throw new Error('Model did not return a structured object. Ensure the model supports tool calling.');
}

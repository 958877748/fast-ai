import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

export type ChatMessage = {
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    tool_calls?: Array<ToolCall>
    tool_call_id?: string
}

export type Tool<T extends z.ZodTypeAny> = {
    name: string
    description?: string
    parameters: T
    execute: (args: z.infer<T>) => Promise<string>
}

export function createTool<T extends z.ZodTypeAny>(options: Tool<T>): Tool<z.ZodTypeAny> {
    return options as any
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

export type CreateOpenAIOptions = {
    baseURL?: string
    apiKey?: string
    model?: string
}

export class OpenAI {
    private _baseURL: string
    apiKey: string
    endpoint: string
    model: string
    set baseURL(baseURL: string) {
        this._baseURL = baseURL.replace(/\/$/, '')
        this.endpoint = `${this._baseURL}/chat/completions`
    }
    messages: ChatMessage[] = []
    tools: Tool<z.ZodTypeAny>[] = []
    onToolCall?: (toolName: string) => void
    async chat(msg?: string, generateObject = false): Promise<string> {
        if (msg) {
            this.messages.push({ role: 'user', content: msg })
        }
        while (true) {
            const res: ChatRespose = await fetch(this.endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${this.apiKey}`,
                },
                body: JSON.stringify({
                    model: this.model,
                    messages: this.messages,
                    tools: generateToolsJsonSchema(this.tools || []),
                }),
            }).then(r => r.json())

            const assistant = res.choices?.[0]?.message
            if (!assistant) {
                throw new Error('No assistant message returned')
            }

            this.messages.push(assistant)

            const tool_calls = assistant.tool_calls
            if (!tool_calls || tool_calls.length === 0) {
                return assistant.content || ''
            }

            if (this.onToolCall) {
                tool_calls.forEach(call => {
                    this.onToolCall?.(call.function.name)
                })
            }

            for (const call of tool_calls) {
                const tool = this.tools?.find(t => t.name === call.function.name)
                if (!tool) {
                    throw new Error(`Tool ${call.function.name} not found`)
                }

                if (generateObject) {
                    return call.function.arguments
                }

                const args = tool.parameters.parse(JSON.parse(call.function.arguments))
                const result = await tool.execute(args)

                this.messages.push({
                    role: 'tool',
                    content: result,
                    tool_call_id: call.id,
                })
            }
        }
    }

    /**
     * Stream chat completions
     * @param onMsg Callback function that receives chunks of the streaming response
     */
    async stream(prompt: string, onMsg: (msg: string, isStop?: boolean) => void): Promise<void> {
        this.messages.push({
            role: 'user', content: prompt
        })

        const controller = new AbortController();
        const signal = controller.signal;

        const response = await fetch(this.endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
                model: this.model,
                messages: this.messages,
                tools: generateToolsJsonSchema(this.tools || []),
                stream: true
            }),
            signal
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        if (!response.body) {
            throw new Error('Response body is null');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        try {
            while (true) {
                const { done, value } = await reader.read();

                if (done) {
                    // If we have remaining buffer, send it as final message
                    if (buffer.trim()) {
                        onMsg(buffer.trim(), true);
                    }
                    break;
                }

                const chunk = decoder.decode(value);
                buffer += chunk;

                // Process complete lines
                let lines = buffer.split('\n');
                buffer = lines.pop() || ''; // Keep incomplete line in buffer

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;

                    const dataStr = line.slice(6); // Remove 'data: '
                    if (dataStr === '[DONE]') {
                        onMsg('', true); // Signal end of stream
                        return;
                    }

                    try {
                        const data = JSON.parse(dataStr);

                        // Extract content from delta
                        const delta = data.choices?.[0]?.delta;
                        if (delta && delta.content) {
                            onMsg(delta.content, false);
                        }
                    } catch (e) {
                        // Handle parsing errors gracefully
                        console.error('Error parsing stream data:', e);
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }
    }
}

export function createOpenAI(options: CreateOpenAIOptions = {}): OpenAI {
    let openai = new OpenAI()
    openai.baseURL = options.baseURL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
    openai.model = options.model || process.env.OPENAI_MODEL || ''
    openai.apiKey = options.apiKey || process.env.OPENAI_API_KEY || ''
    return openai
}

export type GenerateTextOptions = {
    openai?: OpenAI
    messages: ChatMessage[]
    tools?: Array<Tool<z.ZodTypeAny>>
    onToolCall?: (toolName: string) => void
}

function generateToolsJsonSchema(tools: Tool<z.ZodTypeAny>[]) {
    if (!tools) return null
    if (tools.length === 0) return null
    return tools.map(t => ({
        type: 'function' as const,
        function: {
            name: t.name,
            description: t.description,
            parameters: zodToJsonSchema(t.parameters),
        },
    }))
}

export async function generateText(options: GenerateTextOptions): Promise<string> {
    const openai = options.openai || createOpenAI()
    openai.messages = options.messages
    openai.tools = options.tools || []
    return openai.chat()
}

export type GenerateObjectOptions<TSchema extends z.ZodTypeAny> = {
    openai?: OpenAI
    messages: ChatMessage[]
    schema: TSchema
}

/**
 * Generate a structured object validated by the provided Zod schema.
 * Uses tool-calling to force the model to return the object via a single tool call.
 */
export async function generateObject<TSchema extends z.ZodTypeAny>(
    options: GenerateObjectOptions<TSchema>
): Promise<{ object: z.infer<TSchema> }> {
    const openai = options.openai || createOpenAI()
    openai.messages = options.messages

    if (!options.messages.find(m => m.role === 'system')) {
        options.messages.push({
            role: 'system',
            content: 'You are a structured output assistant. Understand what the user wants, and then respond by calling the tool `submit_object` once, with the parameter being the JSON data that the user wants.'
        })
    }

    const submit_object = createTool({
        name: 'submit_object',
        description: 'Submit the final structured object that matches the required schema.',
        parameters: options.schema,
        execute: async (args) => {
            return 'Object submitted.'
        }
    })

    openai.tools = [submit_object as any]

    const res = await openai.chat(undefined, true)

    if (res) {
        try {
            const obj = JSON.parse(res)
            const parsed = options.schema.parse(obj)
            return parsed
        } catch (e) {
            console.error(res)
            throw new Error(`Failed to parse generated object: ${e}`)
        }
    }

    throw new Error('Model did not return a structured object. Ensure the model supports tool calling.')
}

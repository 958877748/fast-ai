var FastAI = (function (exports, zodToJsonSchema) {
    'use strict';

    // Helper to create a typed tool with Zod parameters
    function createTool(options) {
        const wrappedExecute = async (args) => {
            return Promise.resolve(options.execute(args));
        };
        return {
            name: options.name,
            description: options.description,
            parameters: options.parameters,
            execute: wrappedExecute,
        };
    }
    function createOpenAI(options) {
        const base = (options.baseURL ?? 'https://api-inference.modelscope.cn/v1').replace(/\/$/, '');
        const apiKey = options.apiKey;
        if (!apiKey) {
            throw new Error('apiKey is required');
        }
        const builder = ((modelName) => ({
            provider: 'openai',
            endpoint: `${base}/chat/completions`,
            model: modelName,
            apiKey,
        }));
        builder.baseURL = base;
        builder.apiKey = apiKey;
        builder.chat = (modelName) => builder(modelName);
        return builder;
    }
    async function generateText(options) {
        const { messages, onToolCall } = options;
        const messageHistory = [...messages];
        // Normalize tools to a Map for easy lookup
        const toolMap = new Map();
        const toolsInput = options.tools;
        if (Array.isArray(toolsInput)) {
            for (const t of toolsInput)
                toolMap.set(t.name, t);
        }
        else if (toolsInput && typeof toolsInput === 'object') {
            for (const [name, t] of Object.entries(toolsInput))
                toolMap.set(name, t);
        }
        const toolsJsonSchema = toolMap.size
            ? Array.from(toolMap.values()).map(t => ({
                type: 'function',
                function: {
                    name: t.name,
                    description: t.description,
                    parameters: zodToJsonSchema.zodToJsonSchema(t.parameters),
                },
            }))
            : undefined;
        // Normalize transport pieces
        const baseURL = ('client' in options
            ? options.client.baseURL
            : options.model.endpoint.replace(/\/chat\/completions$/, '')).replace(/\/$/, '');
        const endpoint = `${baseURL}/chat/completions`;
        const apiKey = 'client' in options ? options.client.apiKey : options.model.apiKey;
        const modelName = 'client' in options ? options.model : options.model.model;
        while (true) {
            const res = await fetch(endpoint, {
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
    /**
     * Generate a structured object validated by the provided Zod schema.
     * Uses tool-calling to force the model to return the object via a single tool call.
     */
    async function generateObject(options) {
        const schema = options.schema;
        const baseURL = ('client' in options
            ? options.client.baseURL
            : options.model.endpoint.replace(/\/(?:chat\/completions)?$/, ''))
            .replace(/\/$/, '');
        const endpoint = `${baseURL}/chat/completions`;
        const apiKey = 'client' in options ? options.client.apiKey : options.model.apiKey;
        const modelName = 'client' in options ? options.model : options.model.model;
        const systemPreamble = options.system ??
            'You are a structured-output assistant. Always respond by calling the tool `submit_object` exactly once with the final JSON object. Do not include any other text.';
        const messages = [
            { role: 'system', content: systemPreamble },
            { role: 'user', content: options.prompt },
        ];
        const tools = [
            {
                type: 'function',
                function: {
                    name: 'submit_object',
                    description: 'Submit the final structured object that matches the required schema.',
                    parameters: zodToJsonSchema.zodToJsonSchema(schema),
                },
            },
        ];
        const res = await fetch(endpoint, {
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
            }
            catch (_err) {
                // continue to throw structured error below
            }
        }
        throw new Error('Model did not return a structured object. Ensure the model supports tool calling.');
    }

    function detectEnvironment() {
        const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
        return isBrowser ? 'browser' : 'node';
    }
    function hello(name = 'world') {
        return `Hello, ${name}! from ${detectEnvironment()}`;
    }
    var index = {
        detectEnvironment,
        hello,
    };

    exports.createOpenAI = createOpenAI;
    exports.createTool = createTool;
    exports.default = index;
    exports.detectEnvironment = detectEnvironment;
    exports.generateObject = generateObject;
    exports.generateText = generateText;
    exports.hello = hello;

    Object.defineProperty(exports, '__esModule', { value: true });

    return exports;

})({}, zodToJsonSchema);
//# sourceMappingURL=fast-ai.global.js.map

var FastAI = (function (exports, zodToJsonSchema) {
    'use strict';

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
    exports.default = index;
    exports.detectEnvironment = detectEnvironment;
    exports.generateText = generateText;
    exports.hello = hello;

    Object.defineProperty(exports, '__esModule', { value: true });

    return exports;

})({}, zodToJsonSchema);
//# sourceMappingURL=fast-ai.global.js.map

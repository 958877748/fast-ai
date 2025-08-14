import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createOpenAI } from '../src/fastai';

// Mock fetch globally
global.fetch = vi.fn();

describe('OpenAI.stream', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  
  beforeEach(() => {
    mockFetch = vi.fn();
    (global.fetch as ReturnType<typeof vi.fn>) = mockFetch;
  });
  
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should stream responses correctly', async () => {
    const mockResponse = new Response(
      `data: {"choices": [{"delta": {"content": "Hello"}}]}\n\n` +
      `data: {"choices": [{"delta": {"content": " world"}}]}\n\n` +
      `data: {"choices": [{"delta": {"content": "!"}}]}\n\n` +
      `data: [DONE]\n\n`,
      {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' }
      }
    );
    
    mockFetch.mockResolvedValue(mockResponse);

    const openai = createOpenAI({
      baseURL: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-4'
    });

    openai.messages = [
      { role: 'user', content: 'Hello' }
    ];
    
    const messages: string[] = [];
    const onMsg = (msg: string, isStop?: boolean) => {
      if (!isStop) {
        messages.push(msg);
      }
    };

    await openai.stream(onMsg);
    
    expect(messages).toEqual(['Hello', ' world', '!']);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Hello' }],
          tools: null,
          stream: true
        })
      })
    );
  });

  it('should handle empty stream correctly', async () => {
    const mockResponse = new Response(
      `data: [DONE]\n\n`,
      {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' }
      }
    );
    
    mockFetch.mockResolvedValue(mockResponse);

    const openai = createOpenAI({
      baseURL: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-4'
    });

    openai.messages = [
      { role: 'user', content: 'Hello' }
    ];
    
    const messages: string[] = [];
    const onMsg = (msg: string, isStop?: boolean) => {
      if (!isStop) {
        messages.push(msg);
      }
    };

    await openai.stream(onMsg);
    
    expect(messages).toEqual([]);
  });

  it('should handle stream errors properly', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const openai = createOpenAI({
      baseURL: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-4'
    });

    openai.messages = [
      { role: 'user', content: 'Hello' }
    ];
    
    const onMsg = vi.fn();
    
    await expect(openai.stream(onMsg)).rejects.toThrow('Network error');
  });
});
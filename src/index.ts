export type Environment = 'node' | 'browser';

export function detectEnvironment(): Environment {
  const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
  return isBrowser ? 'browser' : 'node';
}

export function hello(name: string = 'world'): string {
  return `Hello, ${name}! from ${detectEnvironment()}`;
}

export default {
  detectEnvironment,
  hello,
};

export {
  createOpenAI,
  generateText,
  generateObject,
  createTool,
} from './fastai';

export type {
  ChatMessage,
  Tool,
} from './fastai';

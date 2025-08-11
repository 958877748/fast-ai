import { describe, it, expect } from 'vitest';
import { detectEnvironment, hello } from '../src/index';

describe('fast-ai', () => {
  it('detects environment', () => {
    const env = detectEnvironment();
    expect(env === 'node' || env === 'browser').toBe(true);
  });

  it('greets', () => {
    expect(hello('dev')).toMatch(/Hello, dev!/);
  });
});

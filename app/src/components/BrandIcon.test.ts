import { describe, expect, it } from 'bun:test';
import { brandKeyForName } from './BrandIcon';

describe('brandKeyForName', () => {
  it('prefers the concrete provider brand over an OpenAI-compatible protocol label', () => {
    expect(brandKeyForName('openai-compatible Qwen')).toBe('qwen');
    expect(brandKeyForName('openai-compatible Alibaba DashScope')).toBe('qwen');
    expect(brandKeyForName('openai-compatible Ollama local')).toBe('ollama');
  });

  it('keeps OpenAI and unknown providers distinct', () => {
    expect(brandKeyForName('openai-compatible OpenAI')).toBe('openai');
    expect(brandKeyForName('GPT-5.4')).toBe('openai');
    expect(brandKeyForName('custom local gateway')).toBeNull();
  });
});

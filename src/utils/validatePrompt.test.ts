import { describe, it, expect } from 'vitest';
import { validatePromptLength, MAX_PROMPT_LENGTH } from './validatePrompt';

describe('validatePromptLength', () => {
  it('최대 길이 상수는 500이다', () => {
    expect(MAX_PROMPT_LENGTH).toBe(500);
  });

  it('500자 이하면 유효하다', () => {
    expect(validatePromptLength('a'.repeat(500))).toEqual({ valid: true, length: 500 });
  });

  it('501자면 유효하지 않다', () => {
    expect(validatePromptLength('a'.repeat(501))).toEqual({ valid: false, length: 501 });
  });

  it('빈 문자열은 길이 0으로 유효하다', () => {
    expect(validatePromptLength('')).toEqual({ valid: true, length: 0 });
  });

  it('앞뒤 공백은 길이에서 제외한다 (제출 시 trim되므로)', () => {
    expect(validatePromptLength(`  ${'a'.repeat(500)}  `)).toEqual({ valid: true, length: 500 });
  });
});

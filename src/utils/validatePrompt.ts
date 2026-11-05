export const MAX_PROMPT_LENGTH = 500;

export interface PromptValidation {
  valid: boolean;
  length: number;
}

/** 제출 시 trim되는 값을 기준으로 프롬프트 길이가 제한 이내인지 검증한다. */
export function validatePromptLength(prompt: string): PromptValidation {
  const length = prompt.trim().length;
  return { valid: length <= MAX_PROMPT_LENGTH, length };
}

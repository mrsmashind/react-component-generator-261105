export const MAX_HISTORY = 20;

/** 프롬프트를 히스토리 맨 앞에 추가한다. 공백 제거, 중복 제거, 최대 개수 제한을 적용한다. */
export function addToHistory(history: string[], prompt: string, max: number = MAX_HISTORY): string[] {
  const trimmed = prompt.trim();
  if (!trimmed) return history;
  return [trimmed, ...history.filter((h) => h !== trimmed)].slice(0, max);
}

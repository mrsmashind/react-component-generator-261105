import { useState, useCallback } from 'react';

interface Options<T> {
  /** 저장된 JSON 값을 앱에서 쓰는 형태로 복원한다 (예: 문자열 → Date). */
  revive?: (raw: unknown) => T;
}

function read<T>(key: string, initial: T, revive?: (raw: unknown) => T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return initial;
    const parsed: unknown = JSON.parse(raw);
    return revive ? revive(parsed) : (parsed as T);
  } catch {
    return initial;
  }
}

export function useLocalStorage<T>(
  key: string,
  initial: T,
  options: Options<T> = {},
): [T, (value: T | ((prev: T) => T)) => void] {
  const { revive } = options;
  const [value, setValue] = useState<T>(() => read(key, initial, revive));

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
        try {
          localStorage.setItem(key, JSON.stringify(resolved));
        } catch {
          // 용량 초과·접근 차단 시에도 메모리 상태는 유지한다.
        }
        return resolved;
      });
    },
    [key],
  );

  return [value, set];
}

import { useState, useCallback } from 'react';
import type { GeneratedComponent, Provider } from '../types';
import { useLocalStorage } from './useLocalStorage';
import { parseNdjson } from '../utils/ndjson';

interface StreamEvent {
  delta?: string;
  done?: boolean;
  code?: string;
  error?: string;
}

export const COMPONENTS_STORAGE_KEY = 'rcg:components';
export const MAX_COMPONENTS = 50;

/** 저장된 JSON을 GeneratedComponent[]로 복원한다. 형식이 맞지 않는 항목은 버린다. */
function reviveComponents(raw: unknown): GeneratedComponent[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry: unknown): GeneratedComponent[] => {
    const item = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
    if (
      typeof item.id === 'string' &&
      typeof item.prompt === 'string' &&
      typeof item.code === 'string'
    ) {
      const createdAt = new Date(item.createdAt as string | number);
      return [
        {
          id: item.id,
          prompt: item.prompt,
          code: item.code,
          createdAt: isNaN(createdAt.getTime()) ? new Date() : createdAt,
        },
      ];
    }
    return [];
  });
}

interface UseComponentGeneratorReturn {
  components: GeneratedComponent[];
  isLoading: boolean;
  error: string | null;
  /** 생성 중 서버에서 받은 부분 코드. 생성이 끝나면 빈 문자열로 돌아간다. */
  streamingCode: string;
  generate: (prompt: string, apiKey: string | undefined, provider: Provider) => Promise<boolean>;
  removeComponent: (id: string) => void;
  clearAll: () => void;
}

export function useComponentGenerator(): UseComponentGeneratorReturn {
  const [components, setComponents] = useLocalStorage<GeneratedComponent[]>(COMPONENTS_STORAGE_KEY, [], {
    revive: reviveComponents,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamingCode, setStreamingCode] = useState('');

  const generate = useCallback(async (prompt: string, apiKey: string | undefined, provider: Provider): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    setStreamingCode('');
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, ...(apiKey && { apiKey }), provider, stream: true }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to generate component');
      }

      if (!res.body) {
        throw new Error('응답 스트림을 읽을 수 없습니다.');
      }

      reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';
      let finalCode: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let parsed: ReturnType<typeof parseNdjson>;
        try {
          parsed = parseNdjson(buffer);
        } catch {
          throw new Error('서버 응답을 해석할 수 없습니다. 다시 시도해주세요.');
        }
        buffer = parsed.rest;

        for (const event of parsed.events as StreamEvent[]) {
          if (event.error) throw new Error(event.error);
          if (event.delta) {
            accumulated += event.delta;
            setStreamingCode(accumulated);
          }
          if (event.done) finalCode = event.code ?? accumulated;
        }
      }

      if (finalCode === null) {
        throw new Error('응답이 중간에 끊겼습니다. 다시 시도해주세요.');
      }

      const newComponent: GeneratedComponent = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        prompt,
        code: finalCode,
        createdAt: new Date(),
      };

      setComponents((prev) => [newComponent, ...prev].slice(0, MAX_COMPONENTS));
      return true;
    } catch (err) {
      // 실패 시 서버 연결이 남지 않도록 응답 스트림을 닫는다.
      void reader?.cancel().catch(() => {});
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      return false;
    } finally {
      setStreamingCode('');
      setIsLoading(false);
    }
  }, [setComponents]);

  const removeComponent = useCallback((id: string) => {
    setComponents((prev) => prev.filter((c) => c.id !== id));
  }, [setComponents]);

  const clearAll = useCallback(() => {
    setComponents([]);
  }, [setComponents]);

  return { components, isLoading, error, streamingCode, generate, removeComponent, clearAll };
}

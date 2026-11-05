// 업스트림(Anthropic/Google) SSE 스트림을 해석하는 순수 함수들.
// 부수효과가 없어 단위 테스트가 가능하다.
import { stripCodeFences, ensureRenderCall, classifyError } from './generator';

/** 버퍼에서 완성된 SSE 이벤트의 data payload를 추출하고, 미완성 꼬리는 rest로 돌려준다. */
export function parseSSE(buffer: string): { payloads: string[]; rest: string } {
  const normalized = buffer.replace(/\r\n/g, '\n');
  const blocks = normalized.split('\n\n');
  const rest = blocks.pop() ?? '';

  const payloads = blocks.flatMap((block) => {
    const data = block
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');
    return data ? [data] : [];
  });

  return { payloads, rest };
}

function safeParse(payload: string): unknown {
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

/** Anthropic content_block_delta(text_delta) 이벤트에서 텍스트 조각을 꺼낸다. */
export function extractAnthropicDelta(payload: string): string {
  const event = safeParse(payload) as {
    type?: string;
    delta?: { type?: string; text?: string };
  } | null;
  if (event?.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
    return event.delta.text ?? '';
  }
  return '';
}

export interface StreamChunk {
  text: string;
  finishReason?: string;
  /** 업스트림이 스트림 도중 보낸 에러. classifyError가 매핑할 수 있게 상태 코드를 포함한 형식이다. */
  error?: string;
}

/** Anthropic 이벤트에서 텍스트 델타 또는 스트림 도중 에러(overloaded/rate_limit)를 꺼낸다. */
export function extractAnthropicChunk(payload: string): StreamChunk {
  const event = safeParse(payload) as { type?: string; error?: { type?: string } } | null;
  if (event?.type === 'error') {
    const kind = event.error?.type;
    const code = kind === 'overloaded_error' ? '503' : kind === 'rate_limit_error' ? '429' : (kind ?? 'unknown');
    return { text: '', error: `Claude API error: ${code}` };
  }
  return { text: extractAnthropicDelta(payload) };
}

/** Google streamGenerateContent 청크에서 텍스트, finishReason, 스트림 도중 에러를 꺼낸다. */
export function extractGoogleChunk(payload: string): StreamChunk {
  const chunk = safeParse(payload) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      finishReason?: string;
    }>;
    error?: { code?: number };
  } | null;
  if (chunk?.error) {
    return { text: '', error: `Gemini API error: ${chunk.error.code ?? 'unknown'}` };
  }
  const candidate = chunk?.candidates?.[0];
  return {
    text: candidate?.content?.parts?.map((part) => part.text ?? '').join('') ?? '',
    finishReason: candidate?.finishReason,
  };
}

/** 업스트림 SSE 본문을 텍스트 조각 스트림으로 변환한다. 소비가 중단되면 업스트림 reader를 cancel한다. */
export async function* readSSE(
  body: ReadableStream<Uint8Array>,
  extract: (payload: string) => StreamChunk,
): AsyncGenerator<string, void, undefined> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  function* handle(payloads: string[]): Generator<string, void, undefined> {
    for (const payload of payloads) {
      const { text, finishReason, error } = extract(payload);
      if (error) throw new Error(error);
      if (text) yield text;
      if (finishReason === 'MAX_TOKENS') {
        throw new Error('생성된 코드가 너무 길어 잘렸습니다. 더 간단한 컴포넌트를 요청해주세요.');
      }
    }
  }

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parsed = parseSSE(buffer);
      buffer = parsed.rest;
      yield* handle(parsed.payloads);
    }
    // 마지막 이벤트가 빈 줄 없이 끝났을 수 있으므로 남은 버퍼를 비우고 한 번 더 파싱한다.
    buffer += decoder.decode();
    yield* handle(parseSSE(`${buffer}\n\n`).payloads);
  } finally {
    await reader.cancel().catch(() => {});
  }
}

/** 텍스트 스트림을 NDJSON(`{delta}` … `{done, code}` | `{error}`) 바이트 스트림으로 변환한다. */
export function toNdjsonStream(
  source: AsyncGenerator<string, void, undefined>,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const line = (event: object) => encoder.encode(`${JSON.stringify(event)}\n`);
  let full = '';

  // pull 방식이라 다운스트림이 cancel된 뒤에는 enqueue가 일어나지 않는다.
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const result = await source.next();
        if (result.done) {
          controller.enqueue(line({ done: true, code: ensureRenderCall(stripCodeFences(full)) }));
          controller.close();
          return;
        }
        full += result.value;
        controller.enqueue(line({ delta: result.value }));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        controller.enqueue(line({ error: classifyError(message).error }));
        controller.close();
      }
    },
    async cancel() {
      await source.return(undefined);
    },
  });
}

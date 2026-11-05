import { describe, it, expect, vi } from 'vitest';
import {
  parseSSE,
  extractAnthropicDelta,
  extractGoogleChunk,
  extractAnthropicChunk,
  readSSE,
  toNdjsonStream,
} from './stream';

const enc = new TextEncoder();

function bodyOf(chunks: string[]) {
  return new ReadableStream<Uint8Array>({
    start(c) {
      chunks.forEach((s) => c.enqueue(enc.encode(s)));
      c.close();
    },
  });
}

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const v of iter) out.push(v);
  return out;
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<object[]> {
  const text = await new Response(stream).text();
  return text.split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

const googleEvent = (text: string, finishReason?: string) =>
  `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, finishReason }] })}\n\n`;

const anthropicEvent = (text: string) =>
  `data: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text } })}\n\n`;

describe('extractAnthropicChunk', () => {
  it('텍스트 델타를 text로 반환한다', () => {
    const payload = JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'a' } });
    expect(extractAnthropicChunk(payload)).toEqual({ text: 'a' });
  });

  it('overloaded_error 이벤트는 503 형식의 error로 반환한다', () => {
    const payload = JSON.stringify({ type: 'error', error: { type: 'overloaded_error' } });
    expect(extractAnthropicChunk(payload).error).toBe('Claude API error: 503');
  });

  it('rate_limit_error 이벤트는 429 형식의 error로 반환한다', () => {
    const payload = JSON.stringify({ type: 'error', error: { type: 'rate_limit_error' } });
    expect(extractAnthropicChunk(payload).error).toBe('Claude API error: 429');
  });
});

describe('readSSE', () => {
  it('SSE 이벤트 중간에서 청크가 끊겨도 텍스트를 복원한다', async () => {
    const whole = googleEvent('ab') + googleEvent('cd');
    const body = bodyOf([whole.slice(0, 15), whole.slice(15)]);
    expect(await collect(readSSE(body, extractGoogleChunk))).toEqual(['ab', 'cd']);
  });

  it('끝에 빈 줄 없이 닫힌 마지막 이벤트도 처리한다', async () => {
    const body = bodyOf([googleEvent('ab'), googleEvent('cd').trimEnd()]);
    expect(await collect(readSSE(body, extractGoogleChunk))).toEqual(['ab', 'cd']);
  });

  it('MAX_TOKENS를 받으면 그 텍스트를 내보낸 뒤 에러를 던진다', async () => {
    const body = bodyOf([googleEvent('ab'), googleEvent('cd', 'MAX_TOKENS')]);
    const seen: string[] = [];
    await expect(
      (async () => {
        for await (const t of readSSE(body, extractGoogleChunk)) seen.push(t);
      })(),
    ).rejects.toThrow('너무 길어');
    expect(seen).toEqual(['ab', 'cd']);
  });

  it('업스트림 error 이벤트를 받으면 해당 메시지로 던진다', async () => {
    const errEvent = `data: ${JSON.stringify({ type: 'error', error: { type: 'overloaded_error' } })}\n\n`;
    const body = bodyOf([anthropicEvent('a'), errEvent]);
    await expect(collect(readSSE(body, extractAnthropicChunk))).rejects.toThrow('Claude API error: 503');
  });

  it('소비를 중단하면 업스트림 reader를 cancel한다', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.encode(googleEvent('ab')));
      },
      cancel,
    });
    const it = readSSE(body, extractGoogleChunk);
    await it.next();
    await it.return(undefined);
    expect(cancel).toHaveBeenCalled();
  });
});

describe('extractGoogleChunk 에러', () => {
  it('error 페이로드는 Gemini API error 형식의 error로 반환한다', () => {
    const payload = JSON.stringify({ error: { code: 503, message: 'overloaded' } });
    expect(extractGoogleChunk(payload).error).toBe('Gemini API error: 503');
  });
});

async function* gen(items: string[], failWith?: Error) {
  for (const i of items) yield i;
  if (failWith) throw failWith;
}

describe('toNdjsonStream', () => {
  it('delta를 줄 단위 JSON으로 내보내고 마지막에 done을 보낸다', async () => {
    const events = await readAll(toNdjsonStream(gen(['const A', ' = 1;'])));
    expect(events).toEqual([
      { delta: 'const A' },
      { delta: ' = 1;' },
      { done: true, code: 'const A = 1;' },
    ]);
  });

  it('done 코드는 코드펜스를 제거하고 render 호출을 보장한다', async () => {
    const events = await readAll(toNdjsonStream(gen(['```jsx\nconst Card = () => null;\n```'])));
    expect(events.at(-1)).toEqual({
      done: true,
      code: 'const Card = () => null;\n\nrender(<Card />);',
    });
  });

  it('소스가 503 에러를 던지면 과부하 안내 error 이벤트로 바꾼다', async () => {
    const events = await readAll(toNdjsonStream(gen(['a'], new Error('Gemini API error: 503'))));
    expect(events.at(-1)).toEqual({
      error: 'API 서버가 일시적으로 과부하 상태입니다. 잠시 후 다시 시도해주세요.',
    });
    expect(events.some((e) => 'done' in e)).toBe(false);
  });

  it('다운스트림이 cancel되면 소스를 종료한다', async () => {
    const source = gen(['a', 'b', 'c']);
    const returnSpy = vi.spyOn(source, 'return');
    const reader = toNdjsonStream(source).getReader();
    await reader.read();
    await reader.cancel();
    expect(returnSpy).toHaveBeenCalled();
  });
});

describe('parseSSE', () => {
  it('빈 줄로 끝난 이벤트의 data를 추출한다', () => {
    const { payloads, rest } = parseSSE('data: {"a":1}\n\ndata: {"a":2}\n\n');
    expect(payloads).toEqual(['{"a":1}', '{"a":2}']);
    expect(rest).toBe('');
  });

  it('아직 끝나지 않은 이벤트는 rest로 남긴다', () => {
    const { payloads, rest } = parseSSE('data: {"a":1}\n\ndata: {"a"');
    expect(payloads).toEqual(['{"a":1}']);
    expect(rest).toBe('data: {"a"');
  });

  it('CRLF 구분자도 처리한다', () => {
    const { payloads } = parseSSE('data: x\r\n\r\ndata: y\r\n\r\n');
    expect(payloads).toEqual(['x', 'y']);
  });

  it('event: 줄은 무시하고 data만 추출한다', () => {
    const { payloads } = parseSSE('event: content_block_delta\ndata: {"a":1}\n\n');
    expect(payloads).toEqual(['{"a":1}']);
  });
});

describe('extractAnthropicDelta', () => {
  it('text_delta 이벤트에서 텍스트를 꺼낸다', () => {
    const payload = JSON.stringify({
      type: 'content_block_delta',
      delta: { type: 'text_delta', text: 'const A' },
    });
    expect(extractAnthropicDelta(payload)).toBe('const A');
  });

  it('텍스트 델타가 아닌 이벤트는 빈 문자열을 반환한다', () => {
    expect(extractAnthropicDelta(JSON.stringify({ type: 'message_start' }))).toBe('');
  });

  it('JSON이 아닌 payload는 빈 문자열을 반환한다', () => {
    expect(extractAnthropicDelta('not json')).toBe('');
  });
});

describe('extractGoogleChunk', () => {
  it('candidates의 parts 텍스트를 이어 붙인다', () => {
    const payload = JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'ab' }, { text: 'cd' }] } }],
    });
    expect(extractGoogleChunk(payload)).toEqual({ text: 'abcd', finishReason: undefined });
  });

  it('finishReason을 함께 반환한다', () => {
    const payload = JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'x' }] }, finishReason: 'MAX_TOKENS' }],
    });
    expect(extractGoogleChunk(payload).finishReason).toBe('MAX_TOKENS');
  });

  it('candidates가 없으면 빈 텍스트를 반환한다', () => {
    expect(extractGoogleChunk('{}')).toEqual({ text: '', finishReason: undefined });
  });

  it('JSON이 아닌 payload는 빈 텍스트를 반환한다', () => {
    expect(extractGoogleChunk('oops').text).toBe('');
  });
});

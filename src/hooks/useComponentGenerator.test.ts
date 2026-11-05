import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useComponentGenerator, MAX_COMPONENTS } from './useComponentGenerator';

const KEY = 'rcg:components';

const encoder = new TextEncoder();
const line = (event: object) => encoder.encode(`${JSON.stringify(event)}\n`);

/** 주어진 이벤트를 NDJSON 스트림으로 내려주는 응답을 만든다. */
function streamResponse(events: object[]) {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      events.forEach((e) => controller.enqueue(line(e)));
      controller.close();
    },
  });
  return { ok: true, body };
}

function mockFetchOk(code: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(streamResponse([{ delta: code }, { done: true, code }])),
  );
}

/** 테스트가 청크 전달 시점을 직접 제어하는 스트림 응답을 만든다. */
function controllableStream() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  return {
    response: { ok: true, body },
    push: (event: object) => controller.enqueue(line(event)),
    close: () => controller.close(),
  };
}

describe('useComponentGenerator 영속성', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('생성한 컴포넌트가 다시 마운트해도 복원된다', async () => {
    mockFetchOk('const A = () => <div />;');
    const first = renderHook(() => useComponentGenerator());
    await act(() => first.result.current.generate('카드', undefined, 'google'));
    await waitFor(() => expect(first.result.current.components).toHaveLength(1));
    first.unmount();

    const second = renderHook(() => useComponentGenerator());
    expect(second.result.current.components).toHaveLength(1);
    expect(second.result.current.components[0].prompt).toBe('카드');
    expect(second.result.current.components[0].code).toBe('const A = () => <div />;');
  });

  it('복원된 컴포넌트의 createdAt은 Date 객체이다', async () => {
    mockFetchOk('x');
    const first = renderHook(() => useComponentGenerator());
    await act(() => first.result.current.generate('카드', undefined, 'google'));
    first.unmount();

    const second = renderHook(() => useComponentGenerator());
    expect(second.result.current.components[0].createdAt).toBeInstanceOf(Date);
  });

  it('컴포넌트를 삭제하면 저장소에서도 사라진다', async () => {
    mockFetchOk('x');
    const { result } = renderHook(() => useComponentGenerator());
    await act(() => result.current.generate('카드', undefined, 'google'));
    const id = result.current.components[0].id;

    act(() => result.current.removeComponent(id));
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual([]);
  });

  it('전체 삭제하면 저장소도 비워진다', async () => {
    mockFetchOk('x');
    const { result } = renderHook(() => useComponentGenerator());
    await act(() => result.current.generate('카드', undefined, 'google'));

    act(() => result.current.clearAll());
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual([]);
  });

  it('저장된 데이터 형식이 올바르지 않으면 빈 목록으로 시작한다', () => {
    localStorage.setItem(KEY, JSON.stringify({ not: 'an array' }));
    const { result } = renderHook(() => useComponentGenerator());
    expect(result.current.components).toEqual([]);
  });

  it('필수 필드가 없는 항목은 복원에서 제외한다', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify([
        { id: '1', prompt: 'p', code: 'c', createdAt: new Date().toISOString() },
        { id: '2', prompt: 'p' },
      ]),
    );
    const { result } = renderHook(() => useComponentGenerator());
    expect(result.current.components.map((c) => c.id)).toEqual(['1']);
  });

  it('생성에 성공하면 generate가 true를 반환한다', async () => {
    mockFetchOk('x');
    const { result } = renderHook(() => useComponentGenerator());
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.generate('카드', undefined, 'google');
    });
    expect(ok).toBe(true);
  });

  it('생성에 실패하면 generate가 false를 반환한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'fail' }) }),
    );
    const { result } = renderHook(() => useComponentGenerator());
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.generate('카드', undefined, 'google');
    });
    expect(ok).toBe(false);
  });

  it('저장하는 컴포넌트 수는 MAX_COMPONENTS로 제한되고 오래된 것부터 버린다', async () => {
    const existing = Array.from({ length: MAX_COMPONENTS }, (_, i) => ({
      id: `old-${i}`,
      prompt: 'p',
      code: 'c',
      createdAt: new Date().toISOString(),
    }));
    localStorage.setItem(KEY, JSON.stringify(existing));
    mockFetchOk('new-code');
    const { result } = renderHook(() => useComponentGenerator());
    await act(() => result.current.generate('새 프롬프트', undefined, 'google'));

    expect(result.current.components).toHaveLength(MAX_COMPONENTS);
    expect(result.current.components[0].code).toBe('new-code');
    expect(result.current.components.at(-1)!.id).toBe(`old-${MAX_COMPONENTS - 2}`);
    expect(JSON.parse(localStorage.getItem(KEY)!)).toHaveLength(MAX_COMPONENTS);
  });
});

describe('useComponentGenerator 스트리밍', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('요청 본문에 stream: true를 포함한다', async () => {
    mockFetchOk('x');
    const { result } = renderHook(() => useComponentGenerator());
    await act(() => result.current.generate('카드', undefined, 'google'));

    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.stream).toBe(true);
  });

  it('delta를 받을 때마다 streamingCode가 누적된다', async () => {
    const stream = controllableStream();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(stream.response));
    const { result } = renderHook(() => useComponentGenerator());

    let promise!: Promise<boolean>;
    act(() => {
      promise = result.current.generate('카드', undefined, 'google');
    });

    stream.push({ delta: 'const A' });
    await waitFor(() => expect(result.current.streamingCode).toBe('const A'));
    stream.push({ delta: ' = 1;' });
    await waitFor(() => expect(result.current.streamingCode).toBe('const A = 1;'));

    stream.push({ done: true, code: 'const A = 1;' });
    stream.close();
    await act(() => promise);
  });

  it('완료되면 서버가 후처리한 최종 코드를 저장하고 streamingCode를 비운다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        streamResponse([{ delta: '```\nconst A' }, { done: true, code: 'const A;\nrender(<A />);' }]),
      ),
    );
    const { result } = renderHook(() => useComponentGenerator());
    await act(() => result.current.generate('카드', undefined, 'google'));

    expect(result.current.components[0].code).toBe('const A;\nrender(<A />);');
    expect(result.current.streamingCode).toBe('');
    expect(result.current.isLoading).toBe(false);
  });

  it('스트림 중 error 이벤트를 받으면 false를 반환하고 에러를 설정한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(streamResponse([{ delta: 'const' }, { error: '중간에 실패' }])),
    );
    const { result } = renderHook(() => useComponentGenerator());
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.generate('카드', undefined, 'google');
    });

    expect(ok).toBe(false);
    expect(result.current.error).toBe('중간에 실패');
    expect(result.current.components).toHaveLength(0);
    expect(result.current.streamingCode).toBe('');
  });

  it('done 없이 스트림이 끝나면 실패로 처리한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse([{ delta: 'const' }])));
    const { result } = renderHook(() => useComponentGenerator());
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.generate('카드', undefined, 'google');
    });

    expect(ok).toBe(false);
    expect(result.current.components).toHaveLength(0);
  });

  it('해석할 수 없는 줄을 받으면 SyntaxError 대신 안내 메시지로 실패한다', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(encoder.encode('<html>proxy error</html>\n'));
        c.close();
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, body }));
    const { result } = renderHook(() => useComponentGenerator());
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.generate('카드', undefined, 'google');
    });

    expect(ok).toBe(false);
    expect(result.current.error).toBe('서버 응답을 해석할 수 없습니다. 다시 시도해주세요.');
  });

  it('error 이벤트로 실패하면 응답 스트림을 cancel한다', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(line({ error: '실패' }));
      },
      cancel,
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, body }));
    const { result } = renderHook(() => useComponentGenerator());
    await act(() => result.current.generate('카드', undefined, 'google'));

    expect(cancel).toHaveBeenCalled();
  });

  it('여러 청크로 쪼개져 줄 중간에서 끊겨도 이벤트를 복원한다', async () => {
    const whole = `${JSON.stringify({ delta: 'ab' })}\n${JSON.stringify({ done: true, code: 'ab' })}\n`;
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(encoder.encode(whole.slice(0, 10)));
        c.enqueue(encoder.encode(whole.slice(10)));
        c.close();
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, body }));
    const { result } = renderHook(() => useComponentGenerator());
    await act(() => result.current.generate('카드', undefined, 'google'));

    expect(result.current.components[0].code).toBe('ab');
  });
});

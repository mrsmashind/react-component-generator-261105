import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useComponentGenerator, MAX_COMPONENTS } from './useComponentGenerator';

const KEY = 'rcg:components';

function mockFetchOk(code: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ code }) }),
  );
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

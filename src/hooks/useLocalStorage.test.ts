import { StrictMode } from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLocalStorage } from './useLocalStorage';

describe('useLocalStorage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('저장된 값이 없으면 초기값을 반환한다', () => {
    const { result } = renderHook(() => useLocalStorage('k', 'init'));
    expect(result.current[0]).toBe('init');
  });

  it('저장된 값이 있으면 초기값 대신 그 값을 반환한다', () => {
    localStorage.setItem('k', JSON.stringify('saved'));
    const { result } = renderHook(() => useLocalStorage('k', 'init'));
    expect(result.current[0]).toBe('saved');
  });

  it('값을 변경하면 localStorage에 JSON으로 저장한다', () => {
    const { result } = renderHook(() => useLocalStorage('k', 'init'));
    act(() => result.current[1]('next'));
    expect(localStorage.getItem('k')).toBe(JSON.stringify('next'));
  });

  it('함수형 업데이트를 지원한다', () => {
    const { result } = renderHook(() => useLocalStorage('k', 1));
    act(() => result.current[1]((prev) => prev + 1));
    expect(result.current[0]).toBe(2);
    expect(localStorage.getItem('k')).toBe('2');
  });

  it('저장된 JSON이 깨져 있으면 초기값을 반환한다', () => {
    localStorage.setItem('k', '{broken');
    const { result } = renderHook(() => useLocalStorage('k', 'init'));
    expect(result.current[0]).toBe('init');
  });

  it('revive가 있으면 저장된 값을 변환해 반환한다', () => {
    localStorage.setItem('k', JSON.stringify(['a']));
    const { result } = renderHook(() =>
      useLocalStorage<string[]>('k', [], { revive: (raw) => (raw as string[]).map((s) => s.toUpperCase()) }),
    );
    expect(result.current[0]).toEqual(['A']);
  });

  it('revive가 예외를 던지면 초기값을 반환한다', () => {
    localStorage.setItem('k', JSON.stringify('x'));
    const { result } = renderHook(() =>
      useLocalStorage('k', 'init', { revive: () => { throw new Error('bad'); } }),
    );
    expect(result.current[0]).toBe('init');
  });

  it('localStorage 쓰기가 실패해도 상태는 갱신된다', () => {
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const { result } = renderHook(() => useLocalStorage('k', 'init'));
    act(() => result.current[1]('next'));
    expect(result.current[0]).toBe('next');
  });

  it('StrictMode에서 updater가 두 번 호출돼도 저장은 한 번만 일어난다', () => {
    const setItem = vi.spyOn(localStorage, 'setItem');
    const { result } = renderHook(() => useLocalStorage('k', 1), { wrapper: StrictMode });
    act(() => result.current[1]((prev) => prev + 1));
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('k')).toBe('2');
  });

  it('같은 틱의 연속 함수형 업데이트가 모두 누적 저장된다', () => {
    const { result } = renderHook(() => useLocalStorage('k', 0));
    act(() => {
      result.current[1]((prev) => prev + 1);
      result.current[1]((prev) => prev + 1);
    });
    expect(result.current[0]).toBe(2);
    expect(localStorage.getItem('k')).toBe('2');
  });
});

import { describe, it, expect } from 'vitest';
import { addToHistory } from './promptHistory';

describe('addToHistory', () => {
  it('새 프롬프트를 맨 앞에 추가한다', () => {
    expect(addToHistory(['a'], 'b')).toEqual(['b', 'a']);
  });

  it('앞뒤 공백을 제거해서 저장한다', () => {
    expect(addToHistory([], '  카드  ')).toEqual(['카드']);
  });

  it('빈 프롬프트는 추가하지 않는다', () => {
    expect(addToHistory(['a'], '   ')).toEqual(['a']);
  });

  it('이미 있는 프롬프트는 중복 없이 맨 앞으로 옮긴다', () => {
    expect(addToHistory(['a', 'b', 'c'], 'c')).toEqual(['c', 'a', 'b']);
  });

  it('최대 개수를 넘으면 오래된 항목부터 버린다', () => {
    expect(addToHistory(['a', 'b'], 'c', 2)).toEqual(['c', 'a']);
  });

  it('원본 배열을 변경하지 않는다', () => {
    const original = ['a'];
    addToHistory(original, 'b');
    expect(original).toEqual(['a']);
  });
});

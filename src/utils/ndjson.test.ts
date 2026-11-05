import { describe, it, expect } from 'vitest';
import { parseNdjson } from './ndjson';

describe('parseNdjson', () => {
  it('완성된 줄을 JSON으로 파싱한다', () => {
    const { events, rest } = parseNdjson('{"delta":"a"}\n{"delta":"b"}\n');
    expect(events).toEqual([{ delta: 'a' }, { delta: 'b' }]);
    expect(rest).toBe('');
  });

  it('줄바꿈으로 끝나지 않은 마지막 조각은 rest로 남긴다', () => {
    const { events, rest } = parseNdjson('{"delta":"a"}\n{"del');
    expect(events).toEqual([{ delta: 'a' }]);
    expect(rest).toBe('{"del');
  });

  it('빈 줄은 무시한다', () => {
    const { events } = parseNdjson('\n{"delta":"a"}\n\n');
    expect(events).toEqual([{ delta: 'a' }]);
  });
});

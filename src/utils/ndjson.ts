/** 개행으로 구분된 JSON 스트림 버퍼를 파싱한다. 개행으로 끝나지 않은 꼬리는 rest로 남긴다. */
export function parseNdjson(buffer: string): { events: unknown[]; rest: string } {
  const lines = buffer.split('\n');
  const rest = lines.pop() ?? '';
  const events = lines.filter((line) => line.trim()).map((line) => JSON.parse(line) as unknown);
  return { events, rest };
}

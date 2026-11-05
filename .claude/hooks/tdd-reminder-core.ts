export function shouldRemind(filePath: string | undefined): boolean {
  if (!filePath) return false
  if (filePath.endsWith('.d.ts')) return false
  return filePath.endsWith('.ts') || filePath.endsWith('.tsx')
}

export function buildReminder(filePath: string): string {
  const lines = [
    `[TDD 리마인더] ${filePath} 를 작성/수정하려 합니다. .claude/rules/tdd.md 규칙(Rigid)을 지키고 있는지 확인하세요.`,
    '- 이 변경이 TDD 필수 대상인지 판단하세요 (비즈니스 로직, API, 순수 함수, 버그 수정, 상태 로직). 설정·타입 정의·순수 UI는 불필요, 모호하면 적용.',
    '- RED: 대응하는 테스트를 먼저 작성했고, 실행해서 "기능 미구현" 이유로 실패하는 것을 확인했나요?',
    '- GREEN: 테스트를 통과시키는 최소한의 코드만 작성하나요? (YAGNI)',
    '- 테스트보다 프로덕션 코드를 먼저 썼다면 삭제하고 RED부터 다시 시작하세요.',
  ]
  if (/\.test\.tsx?$/.test(filePath)) {
    lines.push('- 테스트 파일입니다: 저장 후 반드시 실행해 실패(RED)를 확인한 다음에 프로덕션 코드를 수정하세요.')
  }
  return lines.join('\n')
}

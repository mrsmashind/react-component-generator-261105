// PreToolUse(Write|Edit) 훅: .ts/.tsx 작성·수정 직전에 TDD 리마인더를 에이전트 컨텍스트에 주입한다.
// 권한 결정은 건드리지 않고 additionalContext만 반환한다. 어떤 오류든 도구 실행을 막지 않는다.
import { buildReminder, shouldRemind } from './tdd-reminder-core'

try {
  const input = JSON.parse(await Bun.stdin.text())
  const filePath: string | undefined = input?.tool_input?.file_path
  if (shouldRemind(filePath)) {
    console.log(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          additionalContext: buildReminder(filePath as string),
        },
      }),
    )
  }
} catch {
  // 입력 파싱 실패 등: 조용히 통과
}

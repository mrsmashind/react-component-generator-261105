import { describe, it, expect } from 'vitest'
import { buildReminder, shouldRemind } from './tdd-reminder-core'

describe('shouldRemind', () => {
  it('.ts 파일이면 true를 반환한다', () => {
    expect(shouldRemind('server/generator.ts')).toBe(true)
  })

  it('.tsx 파일이면 true를 반환한다', () => {
    expect(shouldRemind('src/components/LivePreview.tsx')).toBe(true)
  })

  it('윈도우 경로 구분자도 처리한다', () => {
    expect(shouldRemind('C:\\proj\\src\\App.tsx')).toBe(true)
  })

  it('.md 파일이면 false를 반환한다', () => {
    expect(shouldRemind('AGENTS.md')).toBe(false)
  })

  it('.json 파일이면 false를 반환한다', () => {
    expect(shouldRemind('.claude/settings.json')).toBe(false)
  })

  it('.d.ts 타입 선언 파일이면 false를 반환한다', () => {
    expect(shouldRemind('src/vite-env.d.ts')).toBe(false)
  })

  it('.tsx로 끝나지 않는 유사 확장자는 false를 반환한다', () => {
    expect(shouldRemind('notes.tsx.bak')).toBe(false)
  })

  it('파일 경로가 없으면 false를 반환한다', () => {
    expect(shouldRemind(undefined)).toBe(false)
  })
})

describe('buildReminder', () => {
  it('대상 파일 경로를 메시지에 포함한다', () => {
    expect(buildReminder('server/generator.ts')).toContain('server/generator.ts')
  })

  it('tdd.md 규칙과 RED-GREEN-REFACTOR를 언급한다', () => {
    const msg = buildReminder('src/App.tsx')
    expect(msg).toContain('tdd.md')
    expect(msg).toContain('RED')
  })

  it('테스트 파일을 수정하는 경우 RED 단계 안내를 포함한다', () => {
    expect(buildReminder('server/generator.test.ts')).toContain('실패')
  })
})

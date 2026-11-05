# AGENTS.md

## Operational Commands

- 패키지 매니저는 `bun` 고정. npm/yarn/pnpm 사용 금지 (`package.json` scripts가 `bun run server`, `bun --watch`에 의존).
- `bun install` — 의존성 설치
- `bun run dev` — API 서버(3002) + Vite(5173) 동시 실행
- `bun run server` — API 서버만 실행
- `bun run test` — vitest 1회 실행 (`src/**`, `server/**` 테스트 모두 포함)
- `bun run lint` — eslint
- `bun run build` — `tsc -b && vite build`. 작업 완료 전 test, lint, build를 모두 통과시킨다.

## Golden Rules

### Immutable

- API 키는 서버 밖으로 노출하지 않는다. `/api/config`는 키 존재 여부(boolean)만 반환한다 (`server/index.ts:147-156`). 키 값을 응답, 로그, 에러 메시지에 넣지 않는다.
- Google 호출 URL에 키가 쿼리스트링으로 포함된다 (`server/index.ts:99`). 이 URL이나 fetch 에러 객체를 로그/응답에 그대로 출력하지 않는다.
- `.env`는 커밋하지 않는다 (`.gitignore`). 키를 코드에 하드코딩하지 않는다.
- 민감 파일은 읽거나 수정하지 않는다. `.claude/settings.json`의 `permissions.deny`가 도구 레벨에서 차단하지만, 규칙 자체도 지킨다.
  - 대상: `.env`, `.env.*`(`.env.example` 제외), `*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.jks`, `id_rsa*`/`id_ed25519*`, `credentials*`, `*secret*`, `secrets/`, `.npmrc`, `.netrc`, `.aws/`, `.ssh/`, `*.tfvars`, `*.tfstate`, `.claude/settings.local.json`
  - 차단되어도 우회하지 않는다: `cat`/`type`/`Get-Content`/`grep`/`printenv`/스크립트·서브에이전트로 내용을 읽거나, 심볼릭 링크·복사본·이름 변경으로 접근하지 않는다.
  - 키가 필요한 작업(서버 실행, 키 동작 확인)은 사용자에게 `.env` 설정을 요청한다. 키 존재 여부는 `/api/config`(boolean)로만 확인한다.
  - `.env.example`처럼 값이 없는 템플릿만 읽고 수정할 수 있다. 실제 키 값을 넣지 않는다.
  - `permissions.deny` 규칙을 삭제·완화하지 않는다. 변경이 필요하면 사용자에게 제안한다.

### Do's & Don'ts

- Do: 서버 로직 중 테스트가 필요한 것은 부수효과 없는 순수 함수로 `server/generator.ts`, `server/fallback.ts`에 둔다. `server/index.ts`는 `Bun.serve`를 실행하므로 import하는 테스트를 만들 수 없고 실제로 테스트가 없다.
- Do: 새 서버 순수 함수에는 같은 디렉토리에 `*.test.ts`를 함께 추가한다 (`generator.test.ts`, `fallback.test.ts` 패턴).
- Do: 프로바이더를 추가·수정할 때 Anthropic과 Google 경로의 대칭성을 확인한다. 현재 Google만 모델 폴백(`index.ts:5,134`)과 `MAX_TOKENS` 검사(`index.ts:123`)가 있고 Anthropic은 단일 모델 하드코딩(`index.ts:77`)이다. 의도된 차이인지 확인 후 변경한다.
- Don't: API 오류 메시지에서 HTTP 상태 코드를 제거하지 않는다. 503/429 응답 매핑이 `message.includes('503')`, `includes('429')` 문자열 매칭에 의존한다 (`index.ts:194,201`). `callAnthropic`/`callGoogleModel`의 `Error('... error: ${status}')` 형식을 유지한다.
- Don't: 포트 3002를 한쪽만 바꾸지 않는다. `server/index.ts:139`와 `vite.config.ts:11`(프록시 target)을 항상 함께 수정한다.
- Don't: 프론트에서 AI 프로바이더 API를 직접 호출하지 않는다. 모든 호출은 `/api/generate` 프록시를 거친다 (`src/hooks/useComponentGenerator.ts:23`).

### 생성 코드 계약 (이중 방어)

미리보기는 `react-live`의 `noInline` 모드이고 (`src/components/LivePreview.tsx:14`), 이 모드는 `render(<X />)` 호출이 없으면 아무것도 그리지 않는다. 같은 제약을 프롬프트와 후처리 두 곳에서 막고 있으므로 한쪽만 제거하지 않는다.

- `render()` 호출: `SYSTEM_PROMPT` 규칙 (`index.ts:12`) + `ensureRenderCall` (`generator.ts:16-24`)
- 코드펜스 금지: `SYSTEM_PROMPT` 규칙 (`index.ts:16`) + `stripCodeFences` (`generator.ts:5-10`)
- import/TypeScript 금지: `SYSTEM_PROMPT` (`index.ts:11,20`). react-live는 TS 문법과 import를 실행하지 못한다. 프롬프트 수정 시 이 규칙을 유지한다.

## Project Context

프롬프트를 입력하면 AI(Claude/Gemini)가 React 컴포넌트 코드를 생성하고 실시간 미리보기로 렌더링한다.
Stack: React 19, TypeScript, Vite, Bun(API 서버), react-live, Vitest + Testing Library(jsdom).

## Standards & References

- 설치/실행/기능 설명은 `README.md` 참조.
- 커밋 메시지: 한국어, `type: 설명` 형식. type은 `feat`, `fix`, `refactor`, `chore`, `docs`, `test`.
- 테스트 설명(`it`/`describe`)은 한국어로 작성한다 (기존 테스트 관례).
- 서버 전용 규칙은 [server/AGENTS.md](./server/AGENTS.md).

## Maintenance Policy

규칙과 코드 사이에 괴리(라인 번호 이동, 포트 변경, 프로바이더 추가 등)를 발견하면 작업 종료 시 AGENTS.md 업데이트를 사용자에게 제안한다.

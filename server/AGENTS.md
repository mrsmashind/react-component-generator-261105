# server/AGENTS.md

## Module Context

Bun 런타임의 AI API 프록시 서버. 엔트리 `index.ts`가 `generator.ts`, `fallback.ts`의 순수 함수를 조합한다. 프론트엔드는 Vite 프록시로 `/api`를 이 서버에 전달한다.

## Tech Stack & Constraints

- 런타임은 Bun (`Bun.serve`, `process.env`). HTTP 호출은 전역 `fetch`만 사용하고 axios 등 HTTP 라이브러리를 추가하지 않는다 (`index.ts:69,101`).
- 서버 테스트도 vitest로 실행된다 (`vite.config.ts` `include: server/**/*.test.ts`, 환경 jsdom). 따라서 테스트 대상 파일에서 `Bun.*` 전역을 쓰지 않는다.

## Implementation Patterns

- 새 모델 호출은 `callXxx(prompt, apiKey)` 시그니처로 `index.ts`에 추가하고 `/api/generate` 핸들러의 분기에 연결한다 (`index.ts:183-186`).
- 모델 우선순위 폴백은 `withModelFallback(models, attempt)` 재사용 (`index.ts:135`). 모델 목록은 `GOOGLE_MODELS` 상수 (`index.ts:5`).
- AI 응답 후처리는 `ensureRenderCall(stripCodeFences(text))` 순서를 유지한다 (`index.ts:188`).
- 모든 `Response`에 `CORS_HEADERS`를 포함한다 (`index.ts:51-55`). 새 응답 경로에서 누락하기 쉽다.

## Testing Strategy

- `bun run test server` 로 서버 테스트만 실행.
- 순수 함수 단위 테스트만 존재한다. 외부 호출이 필요한 로직은 `attempt` 콜백 주입 방식으로 만들어 `vi.fn`으로 검증한다 (`fallback.test.ts` 패턴).

## Local Golden Rules

- Do: 새 에러 분기를 추가할 때 `catch` 블록의 상태 코드 매핑(`index.ts:191-212`)에 맞춰 사용자에게 보일 메시지를 한국어로 작성한다.
- Don't: `callGoogleModel`의 `MAX_TOKENS` 검사(`index.ts:123`)를 제거하지 않는다. 이 에러는 `withModelFallback`에서 다음 모델 시도로 이어지고, 모두 실패하면 사용자에게 간결화 안내 메시지가 전달된다.
- Don't: `withModelFallback`에서 에러를 삼키지 않는다. 마지막 에러를 반드시 던져야 상위 503/429 매핑이 동작한다 (`fallback.ts:19`).

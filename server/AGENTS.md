# server/AGENTS.md

## Module Context

Bun 런타임의 AI API 프록시 서버. 엔트리 `index.ts`가 `generator.ts`, `fallback.ts`, `stream.ts`의 순수 함수를 조합한다. `/api/generate`는 body `stream: true`이면 NDJSON(`{delta}` … `{done, code}` | `{error}`)으로, 아니면 JSON으로 응답한다. 프론트엔드는 Vite 프록시로 `/api`를 이 서버에 전달한다.

## Tech Stack & Constraints

- 런타임은 Bun (`Bun.serve`, `process.env`). HTTP 호출은 전역 `fetch`만 사용하고 axios 등 HTTP 라이브러리를 추가하지 않는다 (`index.ts:70,102,146,172`).
- 서버 테스트도 vitest로 실행된다 (`vite.config.ts` `include: server/**/*.test.ts`, 환경 jsdom). 따라서 테스트 대상 파일에서 `Bun.*` 전역을 쓰지 않는다.

## Implementation Patterns

- 새 모델 호출은 `callXxx(prompt, apiKey)`(비스트리밍)와 `openXxxStream(prompt, apiKey)`(스트리밍, `TextStream` 반환) 시그니처로 `index.ts`에 추가하고 `/api/generate` 핸들러의 분기(`index.ts:247-254`)와 `openStream`(`index.ts:189`)에 연결한다.
- 모델 우선순위 폴백은 `withModelFallback(models, attempt)` 재사용 (`index.ts:136,191`). 모델 목록은 `GOOGLE_MODELS` 상수 (`index.ts:6`).
- 스트리밍은 업스트림 연결(fetch + 상태 코드 검사)을 첫 청크 전에 끝내서, 연결 실패가 기존처럼 503/429 JSON 응답과 모델 폴백으로 이어지게 한다. 스트림 시작 후의 에러는 `toNdjsonStream`이 `classifyError`로 변환해 `{error}` 이벤트로 보낸다.
- 업스트림 SSE 파싱·NDJSON 변환은 `stream.ts`의 `readSSE`/`toNdjsonStream`에 둔다. `readSSE`는 소비가 중단되면 업스트림 reader를 cancel하고, `toNdjsonStream`은 pull 방식이라 클라이언트가 떠나면 소스를 종료한다. 이 정리 동작을 유지한다.
- AI 응답 후처리는 `ensureRenderCall(stripCodeFences(text))` 순서를 유지한다 (`index.ts:256`, 스트리밍은 `toNdjsonStream`).
- 모든 `Response`에 `CORS_HEADERS`를 포함한다 (`index.ts:52-56`). 스트리밍 응답(`ndjsonResponse`)도 포함한다. 새 응답 경로에서 누락하기 쉽다.

## Testing Strategy

- `bun run test server` 로 서버 테스트만 실행.
- 순수 함수 단위 테스트만 존재한다. 외부 호출이 필요한 로직은 `attempt` 콜백 주입 방식으로 만들어 `vi.fn`으로 검증한다 (`fallback.test.ts` 패턴).

## Local Golden Rules

- Do: 새 에러 분기를 추가할 때 `classifyError`(`generator.ts:16`)의 상태 코드 매핑에 맞춰 사용자에게 보일 메시지를 한국어로 작성한다. `index.ts`의 `catch`와 스트리밍 `{error}` 이벤트가 모두 이 함수를 쓴다.
- Don't: `MAX_TOKENS` 검사를 제거하지 않는다. 비스트리밍(`callGoogleModel`, `index.ts:124`)에서는 `withModelFallback`이 다음 모델을 시도하고, 모두 실패하면 간결화 안내 메시지가 전달된다. 스트리밍(`stream.ts`의 `readSSE`)에서는 이미 일부 코드가 전송된 뒤라 폴백 없이 같은 안내 메시지가 `{error}` 이벤트로 전달된다. 이 차이는 의도된 것이다.
- Don't: 스트림 도중 업스트림 error 이벤트를 무시하지 않는다. `extractAnthropicChunk`/`extractGoogleChunk`가 `Claude|Gemini API error: ${code}` 형식으로 돌려주고 `readSSE`가 던져야 잘린 코드가 성공으로 저장되지 않는다.
- Don't: `withModelFallback`에서 에러를 삼키지 않는다. 마지막 에러를 반드시 던져야 상위 503/429 매핑이 동작한다 (`fallback.ts:19`).

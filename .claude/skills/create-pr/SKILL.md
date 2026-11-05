---
name: create-pr
description: 현재 브랜치의 변경사항을 분석해 PR 템플릿(한국어/영문)에 맞춰 GitHub Pull Request를 생성한다. 포크된 서브 에이전트에서 실행된다. "PR 만들어줘", "PR 생성", "풀리퀘스트 올려줘", "pull request", "create pr", "open a PR" 같은 요청이나, 커밋/푸시 후 리뷰를 요청하려는 맥락이면 명시적으로 PR이라고 말하지 않아도 이 스킬을 사용한다.
context: fork
---

# create-pr

현재 브랜치를 기준으로 GitHub PR을 생성한다. `context: fork`로 실행되므로 이전 대화 내용을 알지 못한다. 필요한 정보는 모두 git과 gh에서 직접 수집한다.

## 1. 언어 결정 (템플릿 선택)

| 대상 repo | 언어 | 템플릿 |
| --- | --- | --- |
| `mrsmashind/react-component-generator-261105` (현재 프로젝트) | 한국어 | [references/template-ko.md](references/template-ko.md) |
| 그 외 모든 repo | 영어 | [references/template-en.md](references/template-en.md) |

```bash
gh repo view --json nameWithOwner,defaultBranchRef -q '.nameWithOwner + " " + .defaultBranchRef.name'
```

- 판정은 PR이 올라갈 repo의 `nameWithOwner`로 한다. 한국 프로젝트인지 추측하지 않는다. 팀이 이 기준을 명시적으로 정했고, 추측은 같은 repo에서도 PR마다 언어가 달라지게 만든다.
- 제목과 본문 모두 선택된 언어로 쓴다. 코드 식별자, 파일 경로, 명령어는 원문 그대로 둔다.
- 대상 repo가 달라지거나 한국어 대상 repo가 늘면 위 표만 고친다.
- 대상 repo에 `.github/pull_request_template.md`가 있으면 그 repo의 템플릿이 우선이다. 해당 파일 구조를 따르고, 언어는 위 표를 따른다.

## 2. 사전 점검

```bash
git branch --show-current
git status --short
git log --oneline <base>..HEAD
git diff <base>...HEAD --stat
gh pr list --head "$(git branch --show-current)" --state open
```

- `<base>`는 1단계에서 얻은 기본 브랜치다. 이 프로젝트는 `master`다. `main`으로 가정하지 않는다.
- 현재 브랜치가 기본 브랜치면 PR을 만들 수 없다. 새 브랜치를 만들지 말고, 중단한 뒤 작업 브랜치에서 다시 요청하라고 보고한다.
- 커밋되지 않은 변경이 있으면 PR에 포함되지 않는다. 임의로 커밋하지 말고 보고서에 알린다.
- `<base>..HEAD` 커밋이 없으면 PR을 만들지 않고 중단한다.
- 이미 열린 PR이 있으면 새로 만들지 말고 그 URL을 보고한다.
- 비밀 정보(`.env`, 키, 토큰)가 diff에 보이면 중단하고 보고한다. 이 프로젝트는 API 키 노출 금지가 최우선 규칙이다.

## 3. 변경 내용 파악

- `git log <base>..HEAD`와 `git diff <base>...HEAD`를 읽어 무엇을, 왜 바꿨는지 파악한다. 커밋 메시지만 베끼지 말고 실제 diff를 확인한다.
- 테스트 결과는 실제로 실행한 것만 적는다. 이 프로젝트는 `bun run test`, `bun run lint`, `bun run build`가 기준이다 (AGENTS.md). 실행하지 않은 항목은 체크하지 않고 "미실행"으로 쓴다. 거짓 체크박스는 리뷰어를 오도한다.
- 관련 이슈 번호가 브랜치명이나 커밋에 있으면 연결한다. 없으면 만들어내지 않는다.

## 4. PR 작성

1. 선택된 템플릿 파일을 읽고 섹션 구조를 그대로 유지한다. 해당 없는 섹션은 지우지 말고 "해당 없음"/"N/A"로 둔다.
2. 제목은 70자 이내, 커밋 컨벤션과 같은 `type: 요약` 형식이다 (`feat`, `fix`, `refactor`, `chore`, `docs`, `test`). 한국어 대상은 한국어 요약, 영문 대상은 영어 요약이다.
3. 본문은 임시 파일에 쓰고 `--body-file`로 전달한다. 줄바꿈과 특수문자가 깨지는 것을 막기 위해서다.
4. 본문 끝에 시스템 지시의 PR attribution 문구가 있으면 그대로 마지막에 추가한다.

## 5. 생성

원격에 브랜치가 없으면 먼저 푸시한다. 푸시는 PR 생성에 필요한 동작이므로 이 스킬 범위에 포함된다.

```bash
git push -u origin HEAD
gh pr create --base <base> --head <branch> --title "<제목>" --body-file <본문파일>
```

- `--force` 푸시는 하지 않는다.
- 기본은 일반 PR이다. 사용자가 draft를 요청했을 때만 `--draft`를 붙인다.
- 에러 출력에 토큰이나 키가 섞일 수 있으니 그대로 옮기지 않는다.

## 6. 보고

서브 에이전트의 최종 응답만 메인 대화로 돌아가므로, 다음을 짧게 포함한다.

- PR URL
- 사용한 언어/템플릿과 base ← head 브랜치
- PR에 포함되지 않은 것 (미커밋 변경 등)과 실행하지 못한 검증

> 현재 개발 진행중인 프로젝트입니다.
> 지속적인 변경이 발생할 수 있습니다.

# 🤫 Mumur (머머)

> 속삭임에서 시작된 아이디어를 팀 실행 자산으로 성장시키는 협업 워크스페이스

Mumur는 아이디어 생애주기와 팀 협업 흐름을 한 화면에서 다루는 MVP 웹 애플리케이션입니다.

## 현재 상태

- MVP 핵심 기능 구현 완료
- UI/UX 복잡도 정리(다이얼로그/드로어 중심) 완료
- 전체 TypeScript 환경 전환 완료
- Playwright 기반 E2E 검증 흐름 적용 완료

아이디어 단계는 아래 5단계를 사용합니다.

- 🌰 씨앗 (`seed`)
- 🌱 발아 (`sprout`)
- 🌿 성장 (`grow`)
- 🍎 결실 (`harvest`)
- 🌙 휴면 (`rest`)

## 제공 기능 (MVP)

- 인증/세션: 회원가입, 로그인, 로그아웃
- 아이디어: 생성, 수정, 상태 전환, 목록/상세
- 협업: 댓글, 멘션 자동완성, 토론 스레드, 투표/리액션
- 문서화: 블록 편집, 버전 이력, 타임라인
- 팀/알림: 팀 멤버 및 초대 관리, 알림 인박스
- 연동: Slack/Discord 웹훅 설정 및 전송 이력

## 기술 스택

- Next.js 16 (App Router)
- TypeScript
- TailwindCSS 4 + 커스텀 UI 프리미티브
- SQLite (`better-sqlite3`)
- Playwright E2E

### SQLite를 사용하는 이유

- **로컬 개발 속도**: 별도 DB 서버 실행 없이 바로 앱과 API를 검증할 수 있습니다.
- **MVP 운영 단순화**: 스키마/데이터 파일 기반으로 초기 배포와 복구가 단순합니다.
- **E2E 안정성**: 테스트 시작 전에 시드 데이터를 빠르게 초기화해 실제 사용자 흐름을 일관되게 재현할 수 있습니다.
- **확장 여지**: API 계층을 유지한 상태라 향후 Postgres 등으로 교체할 때 프론트 변경을 최소화할 수 있습니다.

## 프로젝트 구조

```text
src/
  app/
    api/[...slug]/route.ts   # 통합 API 엔드포인트
    page.tsx                 # 메인 페이지
  components/
    shell/                   # 워크스페이스 화면/패널
    ui/                      # 공통 UI 프리미티브
  lib/
    server/                  # 인증/DB 유틸
    idea-status.ts           # 단계 메타
    ui-labels.ts             # 공통 라벨 사전
scripts/
  seed-local-account.ts      # 로컬 계정/데이터 시드
e2e/
  auth.spec.ts               # 인증 E2E
  idea-thread.spec.ts        # 아이디어/댓글/스레드 E2E
  team-integrations.spec.ts  # 팀/연동 E2E
```

## 로컬 실행

```bash
pnpm install
pnpm run seed:local
pnpm dev
```

- 기본 개발 주소: `http://127.0.0.1:3001`
- 테스트 계정: `localtester@mumur.local / mumur1234!`

## 검증 명령

```bash
pnpm run check
pnpm run test
```

- `pnpm run check`: `typecheck + lint`
- `pnpm run test`: Playwright E2E 실행

## 라이선스

MIT

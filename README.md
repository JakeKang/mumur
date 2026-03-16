# 🤫 Mumur (머머)

> 속삭임에서 시작된 아이디어를 팀 실행 자산으로 성장시키는 협업 워크스페이스

Mumur는 아이디어 생애주기와 팀 협업 흐름을 한 화면에서 다루는 MVP 웹 애플리케이션입니다.

## 현재 상태

- MVP 핵심 기능 구현 완료
- UI/UX 복잡도 정리(다이얼로그/드로어 중심) 완료
- 기본 품질 게이트 통과(`pnpm run check`, `pnpm run test`)

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
- React 19
- TailwindCSS 4 + 커스텀 UI 프리미티브
- SQLite (`better-sqlite3`)
- Node.js 내장 테스트 러너

## 프로젝트 구조

```text
src/
  app/
    api/[...slug]/route.js   # 통합 API 엔드포인트
    page.js                  # 메인 페이지
  components/
    shell/                   # 워크스페이스 화면/패널
    ui/                      # 공통 UI 프리미티브
  lib/
    server/                  # 인증/DB 유틸
    idea-status.js           # 단계 메타
    ui-labels.js             # 공통 라벨 사전
scripts/
  seed-local-account.js      # 로컬 계정/데이터 시드
test/
  next-api.test.js           # 핵심 API 스모크 테스트
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

## 라이선스

MIT

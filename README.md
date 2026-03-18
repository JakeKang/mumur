<div align="center">
  <h1>🤫 Mumur</h1>
  <p><strong>머머 — 아이디어의 생애주기를 관리하는 팀 협업 워크스페이스</strong></p>
  <p>속삭임에서 시작된 아이디어가, 팀과 함께 자라납니다.</p>
</div>

<p align="center">
  <img src="https://img.shields.io/badge/status-개발%20진행중-yellow" alt="개발 진행중" />
  <img src="https://img.shields.io/badge/next.js-16-black" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/language-TypeScript-3178c6" alt="TypeScript" />
  <img src="https://img.shields.io/badge/test-Playwright-45ba4b" alt="Playwright" />
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT" />
</p>

> **🚧 현재 개발 진행중인 프로젝트입니다.**  
> MVP 기능 구현 및 안정화가 진행 중이며, 지속적인 변경이 발생할 수 있습니다.

---

## 핵심 기능

| 기능 | 설명 |
|------|------|
| **아이디어 생애주기** | 씨앗 → 발아 → 성장 → 결실 → 휴면 5단계 상태 흐름으로 아이디어를 관리 |
| **블록 편집기** | 텍스트·체크리스트·코드 등 다양한 블록 타입으로 아이디어를 구조화 |
| **협업 피드백** | 댓글(인라인 포함), 멘션 자동완성, 투표(찬반·점수), 이모지 리액션 |
| **토론 스레드** | 아이디어별 토론 스레드 생성·상태 관리(진행·해결·보류)·결론 기록 |
| **버전 이력** | 기획서 버전 등록, 파일 첨부, 타임라인으로 변경 흐름 추적 |
| **팀 관리** | 멤버 초대·역할 변경·초대 이력, 다중 팀 전환 |
| **알림 인박스** | 실시간 SSE 스트림, 멘션·댓글·투표 알림, 뮤트 설정 |
| **웹훅 연동** | Slack / Discord 웹훅 설정 및 전송 이력 조회 |

---

## 아이디어 단계

아이디어는 아래 5단계 흐름으로 성장합니다.

| 단계 | 식별자 | 의미 |
|:---:|--------|------|
| 🌰 | `seed` | 씨앗 — 처음 떠오른 원석 아이디어 |
| 🌱 | `sprout` | 발아 — 방향이 잡히기 시작한 단계 |
| 🌿 | `grow` | 성장 — 구체화·실행 검토 중 |
| 🍎 | `harvest` | 결실 — 완성·출시·배포 완료 |
| 🌙 | `rest` | 휴면 — 보류·아카이브 처리 |

---

## 빠른 시작

```bash
git clone https://github.com/JakeKang/mumur.git
cd mumur

pnpm install
pnpm run seed:local
pnpm dev
```

앱: `http://127.0.0.1:3001` · 테스트 계정: `localtester@mumur.local / mumur1234!`

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| 프레임워크 | [Next.js 16](https://nextjs.org) (App Router) |
| 언어 | TypeScript 5 |
| 스타일 | [Tailwind CSS 4](https://tailwindcss.com) + 커스텀 UI 프리미티브 |
| DB | [SQLite](https://www.sqlite.org) (`better-sqlite3`) — 별도 서버 없이 즉시 실행, Postgres로 교체 가능 |
| E2E 테스트 | [Playwright](https://playwright.dev) v1.58 (5 tests) |

---

## 개발 명령

```bash
pnpm dev            # 개발 서버 (port 3001)
pnpm run check      # typecheck + lint
pnpm test           # Playwright E2E 실행
pnpm run build      # 프로덕션 빌드
```

---

## 프로젝트 구조

```
src/
  app/
    api/[...slug]/route.ts   통합 API 엔드포인트
    page.tsx                 메인 페이지
  components/
    shell/                   워크스페이스 화면 · 패널
    ui/                      공통 UI 프리미티브
  lib/
    server/                  인증 · DB 유틸
  types/
    index.ts                 도메인 타입 정의
scripts/
  seed-local-account.ts      로컬 계정 시드
e2e/
  auth.spec.ts               인증 E2E
  idea-thread.spec.ts        아이디어 · 협업 E2E
  team-integrations.spec.ts  팀 · 연동 E2E
```

---

## 라이선스

MIT

---

<div align="center">
  <sub>Next.js · TypeScript · Tailwind CSS · SQLite · Playwright 기반으로 구축되었습니다.</sub>
</div>

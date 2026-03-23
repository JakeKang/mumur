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
| **Markdown 블록 에디터** | Enter로 블록 확정, 클릭으로 재편집. 9가지 블록 타입, hover 메뉴, 드래그 정렬, 자동저장 |
| **아이디어 생애주기** | 씨앗 → 발아 → 성장 → 결실 → 휴면 5단계 상태 흐름 |
| **워크스페이스** | 다중 워크스페이스 생성·전환, 아이콘·색상 커스터마이징 |
| **권한 관리** | viewer / editor / deleter / admin 중심 + owner/member 호환 역할 체계 |
| **블록 단위 협업** | 블록별 댓글 스레드, 이모지 리액션, 토론 스레드(진행·해결·보류) |
| **버전 이력** | 자동 스냅샷(5분 간격) + 수동 버전 등록, 원클릭 복원 |
| **실시간 presence** | SSE 기반 팀원 접속 현황 브로드캐스트 |
| **알림 인박스** | 실시간 SSE 스트림, 멘션·댓글·투표 알림, 뮤트 설정 |
| **파일 블록** | 에디터 내부에서 파일 첨부 및 표시 |
| **모바일 반응형** | 사이드바 드로어 전환, 터치 대체 UX |
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

### Docker Compose로 로컬 실행 (앱 + PostgreSQL)

```bash
docker compose up --build
```

- 앱: `http://127.0.0.1:3001`
- PostgreSQL: `127.0.0.1:5432` (`mumur/mumur`, DB `mumur`)

> 현재 앱 런타임 기본 DB는 SQLite(`NEXT_DB_PATH`)이며, Compose는 PostgreSQL을 함께 띄워 전환 테스트/마이그레이션까지 한 번에 준비합니다.

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| 프레임워크 | [Next.js 16](https://nextjs.org) (App Router) |
| 언어 | TypeScript 5 |
| 스타일 | [Tailwind CSS 4](https://tailwindcss.com) + 커스텀 UI 프리미티브 |
| DB | [SQLite](https://www.sqlite.org) (`better-sqlite3`) — 별도 서버 없이 즉시 실행, Postgres로 교체 가능 |
| Markdown | [marked](https://marked.js.org) + [highlight.js](https://highlightjs.org) |
| E2E 테스트 | [Playwright](https://playwright.dev) v1.58 (17 tests) |

---

## 개발 명령

```bash
pnpm dev            # 개발 서버 (port 3001)
pnpm run check      # typecheck + lint
pnpm test           # Playwright E2E 실행
pnpm run build      # 프로덕션 빌드
pnpm run pg:dry-run # pg-mem 기반 SQLite->PostgreSQL 드라이런 + 패리티 체크
pnpm run pg:e2e     # PostgreSQL 마이그레이션 게이트 + Playwright E2E
pnpm run pg:rollback-drill # DATABASE_URL 전환/롤백 가드 드릴
```

---

## 프로젝트 구조

```
src/
  app/
    api/[...slug]/route.ts   통합 API 엔드포인트
    page.tsx                 메인 페이지
  components/
    editor/                  Markdown 블록 에디터 (BlockEditor, EditorBlock, useAutoSave)
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
  idea-thread.spec.ts        에디터 · 협업 E2E
  team-integrations.spec.ts  팀 · 연동 E2E
  workspace.spec.ts          워크스페이스 · 사이드바 · 모바일 E2E
```

---

## 배포 가이드

### 1) Vercel

1. Vercel에서 저장소를 Import 합니다.
2. Environment Variables에 `.env.example`의 값을 등록합니다.
3. 프로덕션에서는 `NEXT_DB_PATH`를 영속 스토리지 경로로 지정합니다.
4. Build/Start는 기본값(Next.js)으로 배포합니다.

> 참고: Vercel의 서버리스 환경에서는 로컬 파일 기반 SQLite가 인스턴스 수명/스케일링에 따라 제약이 있습니다.
> 프로덕션 트래픽에서는 PostgreSQL 같은 관리형 DB를 권장합니다.

### 2) Railway (권장: PostgreSQL)

1. Railway 프로젝트 생성 후 `PostgreSQL` 서비스를 추가합니다.
2. 앱 서비스에 `DATABASE_URL`(Railway 제공)을 연결합니다.
3. 앱 코드의 DB 어댑터를 SQLite(`better-sqlite3`)에서 `pg` 기반으로 전환합니다.
4. 마이그레이션/시드 스크립트를 PostgreSQL용으로 실행합니다.

### SQLite → PostgreSQL 전환 체크포인트

- `src/lib/server/db.ts`: `better-sqlite3` 초기화/PRAGMA 제거, `pg` Pool 연결로 교체
- SQL 문법 차이 반영: `AUTOINCREMENT`/`INTEGER`/`INSERT OR IGNORE`/JSON 처리 구문
- 트랜잭션/커넥션 관리 방식 업데이트 (요청당 커넥션 재사용)
- 배포 환경변수: `DATABASE_URL` + SSL 옵션 적용

### PostgreSQL 마이그레이션 스크립트

- `scripts/postgres/schema.sql`: PostgreSQL 스키마 DDL
- `scripts/postgres/migrate-sqlite-to-postgres.ts`: SQLite 데이터 이관 스크립트
- `scripts/postgres/validate-parity.ts`: 테이블 카운트 패리티 검증
- `scripts/postgres/dry-run-pgmem.ts`: pg-mem 기반 로컬 드라이런(이관+패리티+어댑터 핵심 검증)
- `scripts/postgres/rollback-drill.ts`: 엔진 전환/롤백 가드 검증

### 프로덕션 체크리스트

- 강한 세션 시크릿(32자 이상 랜덤값) 적용
- DB 백업/복구 정책 수립 (스냅샷 주기, 복구 리허설)
- 웹훅 URL/민감값은 환경변수로 관리
- 배포 후 `pnpm test` 기반 핵심 플로우 E2E 재검증

---

## 라이선스

MIT

---

<div align="center">
  <sub>Next.js · TypeScript · Tailwind CSS · SQLite · Playwright 기반으로 구축되었습니다.</sub>
</div>

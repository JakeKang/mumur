# 🤫 Mumur (머머)

> **속삭임에서 시작된 아이디어가, 팀과 함께 자라납니다.**

Mumur는 팀 단위로 아이디어를 빠르게 메모하고, 함께 피드백하며, 체계적으로 발전시켜 나가는 **아이디어 성장 플랫폼**입니다.

---

## ⚠️ Development Status

이 프로젝트는 현재 **초기 개발 단계**입니다. 프로덕션 사용에 적합하지 않습니다.

```
🟢 기획서 작성 완료
🟢 UI/UX 목업 완료
🟡 MVP 개발 진행 중
⚪ 테스트 / QA
⚪ 배포
```

---

## 핵심 컨셉

아이디어의 **생애주기**를 하나의 공간에서 관리합니다.

```
🌱 씨앗 (Seed)      →  아이디어 최초 등록
🌿 싹트 (Sprout)    →  팀원 피드백, 토론으로 방향 구체화
🌳 성장 (Grow)      →  기획서 버전 관리, 문서 발전
🍎 수확 (Harvest)   →  실행 가능 수준으로 정리 완료
💤 보류 (Rest)      →  나중에 다시 꺼낼 수 있는 아이디어
```

## 주요 기능

- **블록 에디터** — Notion 스타일의 가벼운 아이디어 메모
- **팀 피드백** — 댓글, 인라인 코멘트, 토론 스레드, 투표/리액션
- **기획서 버전 관리** — 아이디어 → 구체적인 기획 단계로 체계적 발전
- **상태 관리** — 아이디어 성장 단계 시각화 및 대시보드
- **타임라인** — 아이디어 성장 과정 히스토리 뷰
- **AI 요약** — 메모/토론 자동 요약 (보조적 역할)

## 기술 스택

| 영역 | 기술 |
|------|------|
| Framework | Next.js 14+ (App Router) |
| Language | TypeScript 5+ |
| Styling | TailwindCSS + Shadcn/UI |
| State | Zustand + TanStack Query v5 |
| Editor | Tiptap 또는 BlockNote |
| DB | PostgreSQL + Prisma or Supabase |
| Auth | NextAuth.js (Auth.js) |
| Realtime | Socket.io 또는 Supabase Realtime |
| AI | OpenAI API / Claude API (예정 사항) |
| Deploy | Cloud or On-Premise |

## 프로젝트 구조 (예정)

```
src/
├── app/                    # Next.js App Router
│   ├── dashboard/          # 대시보드
│   ├── ideas/              # 아이디어 목록
│   ├── idea/[id]/          # 아이디어 상세
│   ├── team/               # 팀 관리
│   └── api/                # API Routes
├── components/
│   ├── editor/             # 블록 에디터
│   ├── feedback/           # 댓글, 토론, 투표
│   ├── idea/               # 아이디어 카드, 상태 뱃지
│   ├── plan/               # 기획서 버전 관리
│   └── ui/                 # Shadcn/UI
├── hooks/                  # Custom Hooks
├── stores/                 # Zustand stores
├── lib/                    # 유틸리티
└── types/                  # TypeScript 타입 정의
```

## 시작하기

> 🚧 아직 개발 초기 단계이므로 setup 과정이 변경될 수 있습니다.

```bash
# 저장소 클론
git clone https://github.com/JakeKang/mumur.git
cd mumur

# 의존성 설치
pnpm install

# 환경 변수 설정
cp .env.example .env.development .env.production

# 개발 서버 실행
pnpm dev
```

## 로드맵

- [x] 서비스 기획서 v1.0
- [x] UI/UX 목업
- [ ] **Phase 1 — MVP**: 회원가입, 아이디어 CRUD, 블록 에디터, 댓글, 기획서 버전 관리, AI 요약
- [ ] **Phase 2 — 협업 강화**: 토론 스레드, 인라인 코멘트, 투표, 타임라인, 실시간 알림
- [ ] **Phase 3 — 연동 & 확장**: Slack/Discord 웹훅, 대시보드 고도화, 모바일 최적화

## 라이선스

MIT License

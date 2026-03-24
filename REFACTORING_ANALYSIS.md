# REFACTORING_ANALYSIS

Generated: 2026-03-24 (Asia/Seoul)
Scope: Phase 0 analysis only (no refactor edits)

---

## 1) Directory Structure Mapping (depth 3)

```text
mumur/
├── .env.example
├── Dockerfile
├── docker-compose.yml
├── docs/
├── e2e/
│   ├── auth.spec.ts
│   ├── helpers.ts
│   ├── idea-thread.spec.ts
│   ├── team-integrations.spec.ts
│   └── workspace.spec.ts
├── scripts/
│   ├── seed-local-account.ts
│   └── postgres/
│       ├── adapter-parity.ts
│       ├── dry-run-pgmem.ts
│       ├── migrate-sqlite-to-postgres.ts
│       ├── rollback-drill.ts
│       ├── schema.sql
│       └── validate-parity.ts
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── [...slug]/
│   │   ├── login/
│   │   │   └── page.tsx
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── editor/
│   │   │   ├── BlockEditor.tsx
│   │   │   ├── EditorBlock.tsx
│   │   │   └── useAutoSave.ts
│   │   ├── shell/
│   │   │   ├── app-header.tsx
│   │   │   ├── auth-gateway.tsx
│   │   │   ├── block-actions-menu.tsx
│   │   │   ├── context-panel.tsx
│   │   │   ├── idea-create-dialog.tsx
│   │   │   ├── idea-studio-panel.tsx
│   │   │   ├── mention-assist-panel.tsx
│   │   │   ├── mumur-navigation-sidebar.tsx
│   │   │   ├── workspace-pages.tsx
│   │   │   └── workspace-sidebar.tsx
│   │   └── ui/
│   │       ├── badge.tsx
│   │       ├── button.tsx
│   │       ├── card.tsx
│   │       ├── confirm-dialog.tsx
│   │       ├── dialog-shell.tsx
│   │       ├── drawer-shell.tsx
│   │       ├── input.tsx
│   │       ├── label.tsx
│   │       └── priority-badge.tsx
│   ├── lib/
│   │   ├── server/
│   │   │   ├── auth.ts
│   │   │   ├── database-client.ts
│   │   │   ├── db.ts
│   │   │   ├── postgres-client.ts
│   │   │   ├── query-adapter-pg.ts
│   │   │   └── query-adapter.ts
│   │   ├── idea-status.ts
│   │   ├── local-first.ts
│   │   ├── ui-labels.ts
│   │   └── utils.ts
│   └── types/
│       └── index.ts
├── public/
├── test/
├── README.md
├── eslint.config.mjs
├── middleware.ts
├── next.config.mjs
├── playwright.config.ts
├── pnpm-lock.yaml
├── postcss.config.mjs
└── package.json
```

### Coverage note
- Full root listing source: `/Users/chavis/AI-Project/mumur` directory read.
- Runtime/generated folders present but excluded from deep mapping detail: `.next/`, `node_modules/`, `playwright-report/`, `test-results/`, `data/`, `.git/`, `.sisyphus/`.

### App/pages routing structure
- App Router root: `src/app/layout.tsx`, `src/app/page.tsx`
- Login route: `src/app/login/page.tsx`
- Catch-all API route handler: `src/app/api/[...slug]/route.ts:533`
- No `pages/` router detected.
- `src/pages/**/*` glob returned no files.

### Current module placement
- Components: `src/components/{editor,shell,ui}`
- Hooks: co-located (e.g., `src/components/editor/useAutoSave.ts:5`), no dedicated `src/hooks`
- Utils: `src/lib/utils.ts:1`, `src/lib/local-first.ts:1`
- Types: centralized at `src/types/index.ts:3`
- Constants: `src/lib/idea-status.ts:1`, `src/lib/ui-labels.ts:1`
- Services/data access: `src/lib/server/*`, plus API dispatch in `src/app/api/[...slug]/route.ts`
- Styles: `src/app/globals.css`

---

## 2) Code Duplication Detection

### 2.1 Duplicated API wrapper / error class
- `src/app/page.tsx:25-49` defines `ApiError` + `api()`
- `src/app/login/page.tsx:8-31` defines a parallel `ApiError` + `api()`

### 2.2 Duplicated auth form flow
- Auth form state + handlers appear in multiple places:
  - `src/app/page.tsx:104-105, 836-866`
  - `src/app/login/page.tsx:38-39, 61-92`
  - `src/components/shell/auth-gateway.tsx:11-16, 59-106`

### 2.3 Duplicated form/update callback shapes
- Many repeated setter callbacks:
  - `src/app/page.tsx:440`
  - `src/components/shell/workspace-pages.tsx:227,286,299,345,356,369,384,391,400,407,570,577,667,676`
  - `src/components/shell/idea-studio-panel.tsx:621`

---

## 3) Component Complexity Analysis

### 3.1 200+ line files
- `src/app/page.tsx` (1744 lines)
- `src/app/api/[...slug]/route.ts` (2116 lines)
- `src/components/shell/idea-studio-panel.tsx` (749 lines)
- `src/components/shell/workspace-pages.tsx` (702 lines)
- `src/components/editor/BlockEditor.tsx` (673 lines)
- `src/components/editor/EditorBlock.tsx` (454 lines)
- `src/components/shell/context-panel.tsx` (271 lines)

### 3.2 Multi-responsibility hotspots
- `src/app/page.tsx` mixes:
  - auth/session bootstrap (`:688-753`)
  - notifications stream (`:307-347`)
  - ideas/comments/reactions/versions CRUD (`:484-1263`)
  - workspace/team/webhook management (`:384-437`, `:1235-1316`)
  - major page composition (`:1454+`)
- `src/components/shell/idea-studio-panel.tsx` mixes editor shell, comments, mentions, timeline restore modal.

### 3.3 Probable prop drilling (>3 level concern)
- Large prop payload into `IdeaStudioPanel` from `page.tsx`:
  - pass point: `src/app/page.tsx:1673+`
  - receiver signature: `src/components/shell/idea-studio-panel.tsx:12-45`
- `BlockEditor` similarly receives broad behavior surface from parent:
  - `src/components/shell/idea-studio-panel.tsx:359-389`
  - `src/components/editor/BlockEditor.tsx:310-336`

---

## 4) Type Safety Audit

### 4.1 Explicit `any` usage
- Found explicit `any` variable:
  - `src/app/page.tsx:630` (`let data: any;`)

### 4.2 Implicit-any hotspots (LSP hints)
- High concentration in:
  - `src/app/api/[...slug]/route.ts:40,44,58,95,103,112...`
  - `src/app/page.tsx:60,295,400,530,560...`
  - `src/components/shell/idea-studio-panel.tsx:115,121,138,179,206...`
  - `src/components/shell/workspace-pages.tsx:79,120,136,227,286...`

### 4.3 Untyped API response surfaces
- `api()` returns untyped JSON object in multiple call sites:
  - source wrappers at `src/app/page.tsx:34-49`, `src/app/login/page.tsx:17-31`
  - many `const data = await api(...)` without domain generics.

### 4.4 Type centralization / potential duplication
- Most domain types are concentrated in `src/types/index.ts:3-288`.
- Alias pairs indicate duplicated naming layers (`Team*` aliasing `Workspace*`), e.g.
  - `src/types/index.ts:170-175`

---

## 5) SQL File Inventory & Status

### 5.1 Located `.sql` files
- `scripts/postgres/schema.sql`

### 5.2 SQL purpose (from scripts/package)
- Applied by `package.json:13` (`pg:schema`)
- Used alongside migration/validation scripts:
  - `scripts/postgres/migrate-sqlite-to-postgres.ts`
  - `scripts/postgres/validate-parity.ts`
  - `scripts/postgres/dry-run-pgmem.ts`

### 5.3 Postgres schema inventory (`scripts/postgres/schema.sql`)
- Tables:
  - `users` (`schema.sql:1`)
  - `workspaces` (`schema.sql:9`)
  - `workspace_members` (`schema.sql:19`)
  - `sessions` (`schema.sql:27`)
  - `ideas` (`schema.sql:35`)
  - `comments` (`schema.sql:47`)
  - `reactions` (`schema.sql:57`)
  - `idea_versions` (`schema.sql:68`)
  - `events` (`schema.sql:79`)
  - `notification_reads` (`schema.sql:89`)
  - `workspace_webhooks` (`schema.sql:96`)
  - `notification_preferences` (`schema.sql:108`)
  - `webhook_deliveries` (`schema.sql:114`)
  - `workspace_views` (`schema.sql:129`)
  - `workspace_invitations` (`schema.sql:141`)

### 5.4 SQL in TypeScript (duplicate query surface)
- Centralized query adapters:
  - SQLite adapter SQL: `src/lib/server/query-adapter.ts:110,123,131,165`
  - Postgres adapter SQL: `src/lib/server/query-adapter-pg.ts:61,70,82,121,135`
- Large inline SQL surface still in route layer:
  - `src/app/api/[...slug]/route.ts` contains many direct `db.prepare(...)` statements (e.g., `:98,104,390,775,1040,1176,1277`).

### 5.5 Migration order and dependency notes
- Script order from manifest:
  - `pg:schema` (`package.json:13`)
  - `pg:migrate` (`package.json:14`)
  - `pg:validate` (`package.json:15`)
  - `pg:adapter-parity` (`package.json:16`)
  - `pg:dry-run` (`package.json:17`)
- DB migration debt warning is explicit in runtime guard:
  - `src/lib/server/database-client.ts:34` (route still sqlite-style direct DB calls)

### 5.6 Dead SQL / unused query-contract candidates
- Query contract types include many methods not referenced from route `queries.*` calls:
  - contract declarations: `src/lib/server/query-adapter.ts:31-85`
  - route call sites currently used: `src/app/api/[...slug]/route.ts:372,394,557,561,563,656,1298,1413,1694,1745,1780,1791,1848,1856,1862`
- Candidates to review for dead/unused contract surface:
  - `createWorkspace`, `createIdea`, `updateIdea`, `findIdeaByTeam`, `listWorkspaceMembers`, `createComment`, `updateComment`, `deleteComment`, `createVersion`, `restoreVersionBlocks`, `createEvent`, `listTeamEventsForInbox`
  - declared in adapters (`query-adapter.ts`, `query-adapter-pg.ts`) but absent from route `queries.*` invocation list.

---

## 6) Dependency Graph / Hygiene

### 6.1 Circular dependency scan
- `madge` is not installed (`pnpm exec madge --circular src` failed), so a local static import-graph DFS scan was executed.
- Result: 1 cycle found
  - `src/lib/server/database-client.ts:2` -> `src/lib/server/query-adapter.ts:1` -> `src/lib/server/database-client.ts:2`
- Risk qualifier: low runtime risk because the back-edge is `import type` in `query-adapter.ts:1`.

### 6.2 Dependency inventory with usage anchors
- Manifest source: `package.json:27-40`
- Used dependencies (sample anchors):
  - `better-sqlite3` -> `src/lib/server/db.ts:3`
  - `pg` -> `src/lib/server/postgres-client.ts:1`, `src/lib/server/query-adapter-pg.ts:1`
  - `marked` -> `src/components/editor/EditorBlock.tsx:5`
  - `lucide-react` -> `src/app/page.tsx:13`, `src/components/shell/app-header.tsx:5`
  - `class-variance-authority` -> `src/components/ui/button.tsx:1`
  - `clsx` / `tailwind-merge` -> `src/lib/utils.ts:1-2`
- Possibly unused direct dependencies (no source imports detected):
  - `highlight.js` (`package.json:31`) — only appears in `README.md:86`, `pnpm-lock.yaml`
  - `tailwindcss-animate` (`package.json:39`) — appears in lockfile, no source import hit

### 6.3 Deprecated/outdated dependency signal
- Deprecated transitive package in lockfile:
  - `prebuild-install@7.1.3` deprecated (`pnpm-lock.yaml:2067-2071`)
- Outdated direct packages found by `pnpm outdated --format table`:
  - includes `next`, `react`, `typescript`, `eslint`, `better-sqlite3`, `marked`.

### 6.4 Unused import/export hotspots
- LSP diagnostics show unused symbol hotspots in large files:
  - `src/app/page.tsx` (unused declarations such as `authMode`, `error`, `handleLogin`, etc.)
  - `src/components/editor/BlockEditor.tsx` (`clearSelection`, `selectAllBlocks`, `deleteSelectedBlocks`, `moveSelected`)
- Query adapter contract breadth is broader than current call sites (see §5.6), indicating likely export surface debt.

---

## 7) External references (official docs) for upcoming phases

- Next.js project structure:
  - https://nextjs.org/docs/app/getting-started/project-structure
- Next.js route groups:
  - https://nextjs.org/docs/app/api-reference/file-conventions/route-groups
- Server vs Client Components:
  - https://nextjs.org/docs/app/getting-started/server-and-client-components
  - https://nextjs.org/docs/app/api-reference/directives/use-client
- TypeScript strict mode:
  - https://www.typescriptlang.org/tsconfig/strict.html
- React custom hooks:
  - https://react.dev/learn/reusing-logic-with-custom-hooks

---

## 8) Initial risk summary

- **High**: monolithic orchestration (`src/app/page.tsx`) and mega API handler (`src/app/api/[...slug]/route.ts`)
- **High**: duplicated auth/api wrappers across app/login layers
- **Medium**: implicit-any spread and broad untyped API responses
- **Medium**: circular cycle detected in server data layer (type-only back edge), and no dedicated cycle tool configured by default
- **Low-Medium**: dependency version lag (upgrade planning needed)

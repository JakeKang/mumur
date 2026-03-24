# REFACTORING_CHANGELOG

Generated: 2026-03-24 (Asia/Seoul)

## Summary

- Refactored project layout into `features / shared / db` boundaries.
- Split large workspace UI surface into focused components.
- Centralized API request client and hook usage.
- Reduced type drift in page-level state passed to extracted surfaces.
- Centralized SQLite schema application and hardened PostgreSQL migration scripts against schema drift.

## Structural Changes

### 1) Directory and module moves

- `src/components/shell/*` → `src/features/*/components/*` and `src/shared/components/*`
- `src/components/editor/*` → `src/features/ideas/components/editor/*`
- `src/lib/*` → `src/shared/*`
- `scripts/postgres/*` + `scripts/seed-local-account.ts` → `src/db/{migrations,seeds,queries}`

### 2) New app route grouping

- Added auth route group under `src/app/(auth)/login/page.tsx`

### 3) TypeScript path aliases

- Added/used aliases for:
  - `@/features/*`
  - `@/shared/*`
  - `@/db/*`

## Component Decomposition

- Extracted `workspace-pages` monolith into:
  - `src/features/workspace/components/dashboard-surface.tsx`
  - `src/features/workspace/components/ideas-surface.tsx`
  - `src/features/workspace/components/team-surface.tsx`
  - `src/features/workspace/components/workspace-pages.tsx` (barrel export)
- Added `src/features/workspace/components/idea-priority-meta.ts`.

## API/Service Layer

- Added shared API client: `src/shared/lib/api-client.ts`
- Added shared hook wrapper: `src/shared/hooks/use-api-client.ts`
- Updated page-level usage to import from shared API client.

## Types

- Tightened local state typing in `src/app/page.tsx` for extracted surface props:
  - `ideaView`: `"card" | "list"`
  - `navigatorPreset`: `"all" | "updatedToday" | "discussion" | "growth"`
  - `teamMemberForm`: `WorkspaceMemberForm`
  - `webhookForm`: `WebhookForm`

## Database and SQL

### SQLite schema dedup

- Added `src/shared/lib/server/sqlite-schema.ts`.
- Reused centralized schema from:
  - `src/shared/lib/server/db.ts`
  - `src/db/seeds/seed-local-account.ts`

### PostgreSQL migration robustness

- Updated migration scripts to insert only columns that exist in target Postgres schema:
  - `src/db/migrations/migrate-sqlite-to-postgres.ts`
  - `src/db/migrations/dry-run-pgmem.ts`
- This avoids failure when SQLite contains legacy columns not present in `src/db/schema.sql` (e.g. `ideas.ai_summary`).

## Verification Evidence

- `pnpm run check` ✅
- `pnpm run build` ✅
- `pnpm test` (Playwright, 11 tests) ✅
- `pnpm run seed:local` ✅
- `pnpm run pg:dry-run` ✅

# ARCHITECTURE

## Overview

This project uses a Next.js App Router frontend with a single catch-all API route and a shared domain/types layer.
The current structure follows a feature-oriented organization for UI and a shared/core organization for reusable primitives.

## Top-Level Layout

```text
src/
  app/                 # Next.js routes, top-level composition
  features/            # Feature modules (auth, ideas, notifications, workspace)
  shared/              # Reusable cross-feature code (ui, hooks, lib, types, utils)
  db/                  # Schema, migration, seed, adapter parity scripts
```

## Route Layer

- `src/app/page.tsx`: main workspace shell + client orchestration
- `src/app/(auth)/login/page.tsx`: login route group page
- `src/app/api/[...slug]/route.ts`: consolidated backend handler

## Feature Modules

- `features/auth`: auth-facing components
- `features/ideas`: editor, idea creation/studio, idea constants/utils
- `features/notifications`: notification/context panels
- `features/workspace`: workspace nav/surfaces/team dashboards

Workspace surfaces are split by page concern:

- `dashboard-surface.tsx`
- `ideas-surface.tsx`
- `team-surface.tsx`

## Shared Layer

- `shared/components/ui/*`: design primitives
- `shared/constants/*`: labels and display constants
- `shared/hooks/use-api-client.ts`: shared API request hook wrapper
- `shared/lib/api-client.ts`: `apiRequest` + `ApiError`
- `shared/lib/server/*`: server-side auth/db/query adapters
- `shared/types/index.ts`: domain and API-related types

## Data Layer

- Primary runtime DB path resolves through `NEXT_DB_PATH` fallback to `data/mumur.db`.
- SQLite schema application is centralized in:
  - `shared/lib/server/sqlite-schema.ts`
- Seed and runtime DB initialization reuse the same schema function.

PostgreSQL migration assets:

- `src/db/schema.sql`
- `src/db/migrations/*`
- `src/db/queries/adapter-parity.ts`

Migration scripts now filter SQLite columns by target Postgres table columns to handle legacy SQLite schema drift safely.

## API Client Flow

Client components call shared `apiRequest`:

```text
UI -> shared/lib/api-client.ts -> /api/[...slug] -> query adapter / db
```

This avoids duplicate ad-hoc fetch wrappers across pages.

## Design Constraints

- Keep feature UI code under `src/features/*`
- Keep cross-feature reusable code under `src/shared/*`
- Keep DB migration and seed concerns under `src/db/*`
- Prefer typed state and typed form models from `shared/types`

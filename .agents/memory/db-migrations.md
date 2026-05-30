---
name: DB migration constraint
description: drizzle-kit push fails here; apply schema changes via the app's pg pool (tsx), not the psql CLI.
---

## Rule
Never run `drizzle-kit push` or `drizzle-kit generate` in this environment — it fails consistently.

**Why:** The Replit PostgreSQL setup rejects drizzle-kit's connection. The `psql` CLI also fails: `psql "$DATABASE_URL"` and `psql -U postgres heliumdb` both return `FATAL: password authentication failed for user "postgres"`, even though the running app connects fine with the same `DATABASE_URL`.

**How to apply:** For all schema changes (ALTER TYPE, CREATE TABLE, ADD COLUMN), run raw SQL through the app's pg pool via a throwaway tsx script placed in the project root (so the `./server/db` import + path aliases resolve — a script in `/tmp` cannot resolve the import):
```ts
// ./_fix.ts  (run: npx tsx ./_fix.ts ; then delete it)
import { pool } from "./server/db";
await pool.query(`ALTER TABLE adjusters ADD COLUMN archived_at timestamp`);
await pool.end();
```

## Soft-delete column drift
The schema declares `archivedAt` (`archived_at`) and `deletedAt` (`deleted_at`) on the soft-delete tables (`adjusters`, `claims`, `clients`, `evidence_files`, `audio_recordings`, `emails`), but the DB can be missing them — Drizzle then emits `column "archived_at" does not exist` 500s on list endpoints. Fix by ADD COLUMN-ing both `archived_at` and `deleted_at` (type `timestamp`, nullable) on any table that lacks them.

Also: `docCategoryEnum` and all other pgEnums are real DB enums — adding new values requires `ALTER TYPE ... ADD VALUE 'newval'` (via the pool), not just updating schema.ts.

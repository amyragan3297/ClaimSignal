---
name: DB migration constraint
description: drizzle-kit push fails in this environment; always use raw psql for schema changes.
---

## Rule
Never run `drizzle-kit push` or `drizzle-kit generate` in this environment — it fails consistently.

**Why:** The Replit PostgreSQL setup uses peer auth (`psql -U postgres heliumdb`) and drizzle-kit push doesn't work with this configuration.

**How to apply:** For all schema changes (ALTER TYPE, CREATE TABLE, ADD COLUMN), use:
```bash
psql -U postgres heliumdb -c "SQL HERE"
```

Also: `docCategoryEnum` and all other pgEnums are real DB enums — adding new values requires `ALTER TYPE ... ADD VALUE 'newval'` via psql, not just updating the schema.ts file.

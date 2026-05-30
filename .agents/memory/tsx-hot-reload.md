---
name: TSX hot-reload caveat
description: tsx (used for server) may not reliably pick up changes to storage.ts without a full workflow restart.
---

# TSX Hot-Reload Caveat

## The Rule
After editing `server/storage.ts` (or other deep server files), changes may not be picked up by tsx's watch mode even after HMR output says "serving". Always restart the workflow ("Start application") after significant backend changes to guarantee the new code runs.

**Why:** This environment uses `tsx server/index.ts` without explicit `--watch` in some configurations. HMR may update Vite's frontend bundle but leave the Node.js process running old compiled code for storage/route changes.

## How to Verify
- Make the edit
- Restart the workflow via the Replit UI or the `restart_workflow` tool
- Wait for the server health check to return `{"ok":true}` before testing

## Observed Symptom
Storage method that works in raw psql returns unexpected results via the API — classic sign the old method is still running.

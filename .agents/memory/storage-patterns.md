---
name: Storage org-level methods
description: Audio and email storage methods require claimId; ByOrg variants added for org-wide listing.
---

## Rule
The original `getAudioRecordings(claimId, orgId)` and `getEmails(claimId, orgId)` both require claimId. For org-wide listing (e.g., the Audio and Communications pages), use:
- `getAudioRecordingsByOrg(orgId)` — added to IStorage and DatabaseStorage
- `getEmailsByOrg(orgId)` — added to IStorage and DatabaseStorage

**Why:** The audio/communications pages need to show all records for the org, not just per-claim.

**How to apply:** When building org-level list pages, always check if a ByOrg variant exists before writing a new storage method. If it doesn't, add it to both the interface and implementation.

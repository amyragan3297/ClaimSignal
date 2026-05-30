---
name: ClaimSignal approved logo
description: Which logo asset to use and where — prevents reintroducing the placeholder Shield icon.
---

The approved brand mark is the PNG at `attached_assets/ClaimSignal_top_logo_panel-1_1780180101332.png`.  
Import it with `import logoImg from "@assets/ClaimSignal_top_logo_panel-1_1780180101332.png"` and render as `<img src={logoImg} alt="ClaimSignal" />`.

**Why:** User explicitly approved only the large top version (navy bg, orange shield outline, orange signal/radar lines, white ClaimSignal wordmark). All other variants (b&w, app-icon, molecule, atom, sparkle) are rejected.

**How to apply:**
- Sidebar (`app-layout.tsx`): h-10, replaces Shield icon + text span.
- Login page: h-24 centered, replaces Shield icon + text span.
- Homepage nav: h-12, replaces Shield icon + text span.
- Any future standalone page header: use the PNG at an appropriate height; never use the lucide `Shield` icon as a brand mark (Shield may still be used as a UI icon in lists/badges).
- Favicon/compact icon: crop/simplify the PNG to shield+signal only, keep same orange style.

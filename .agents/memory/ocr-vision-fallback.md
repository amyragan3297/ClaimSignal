---
name: OCR vision fallback for scanned documents
description: Why uploads need a vision-model fallback when PDF/image text extraction yields nothing.
---

# Scanned-document extraction fallback

Real-world insurance documents (estimates, denial letters) are frequently scanned
or photographed PDFs with **no embedded text layer**, plus plain image uploads
(jpg/png/etc). `pdf-parse` returns ~0 chars for these, so rule-based + text-LLM
extraction produced empty claims ("Unknown" category, blank fields).

**Rule:** when the upload pipeline gets little/no extractable text (<~80 chars) for a
PDF or image, fall back to a vision model on the rendered pages instead of giving up.

**Why:** users upload scans constantly; text-only extraction silently yields blank
claims, which reads as "the bug is still happening."

**How to apply:**
- Render PDF pages with `pdf-parse`'s `getScreenshot` (backed by pdfjs-dist +
  @napi-rs/canvas — both already vendored by pdf-parse, so NO new system deps and no
  graphicsmagick/ghostscript needed). Cap pages (e.g. 4) and scale (~2) for cost.
- Send page images / the uploaded image as `image_url` content parts to the vision
  model; reuse the exact same JSON schema + parser as the text path.
- gpt-5.4 via the AI_INTEGRATIONS proxy DOES support vision (`image_url` data URLs).
  A degenerate 1×1 PNG returns 400 "unsupported image" — that's image validation,
  not a capability gap; test with a real rendered image.
- Decide image-vs-pdf-vs-text branches as mutually exclusive; trust
  `req.file.mimetype.startsWith("image/")` too, since filename-based type detection
  misses bmp/tiff/webp.
- Keep all extraction failures non-fatal (upload must still succeed).

**Caveat:** evidence_files stores metadata only (no raw bytes / storageUrl often
null), so failed-extraction files created BEFORE this fix cannot be re-extracted
server-side — and SHA-256 dedup blocks re-uploading the identical file. To recover a
pre-existing blank claim, the old evidence file/claim must be deleted first.

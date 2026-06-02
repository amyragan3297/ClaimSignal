/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Evidence upload pipeline regression tests.
 * Run with:  npx tsx server/evidence-upload.test.ts
 *
 * Covers:
 *   PDF  — text extraction via pdf-parse, AI extraction, extractionStatus enum
 *   TXT  — direct UTF-8 read, entity extraction, AI extraction
 *   EML  — same text path as TXT (different MIME / extension)
 *
 * Guards:
 *   - ESM/CommonJS pdf-parse bug ("require is not defined")
 *   - extraction_status enum validity ("no_text" → "failed")
 *   - All three upload paths exercise the real multer + extraction pipeline.
 *
 * DB and OpenAI network calls are stubbed so the test is hermetic.
 */
import {
  makeTestRunner,
  buildPdf,
  buildTextFile,
  installStorageStubs,
  startFakeOpenAI,
  uploadFile,
  mountEvidenceApp,
  captureConsoleError,
} from "./evidence-test-helpers";

const CLAIM_TEXT =
  "Claim Number: ABC-12345 Policy Number: POL-99887 Insured: John Smith " +
  "Property Address: 123 Main St Date of Loss: 01/15/2025 Carrier: Acme Insurance";

async function run() {
  process.env.NODE_ENV = "test";
  installStorageStubs();

  // Point the OpenAI integration at our local fake so extraction is hermetic.
  const fakeOpenAI = await startFakeOpenAI({ claimNumber: "ABC-12345", confidence: 0.9 });
  const aiPort = (fakeOpenAI.address() as any).port;
  process.env.AI_INTEGRATIONS_OPENAI_API_KEY = "test-key";
  process.env.AI_INTEGRATIONS_OPENAI_BASE_URL = `http://127.0.0.1:${aiPort}/v1`;

  const { port, server: appServer } = await mountEvidenceApp();

  const { check, exit } = makeTestRunner();
  const errCapture = captureConsoleError();

  try {
    // ── PDF: text-bearing ───────────────────────────────────────────────────
    console.log("\n=== 1. PDF with text: extracted + AI extraction complete ===");
    const textPdf = buildPdf(CLAIM_TEXT);
    const r1 = await uploadFile(port, "denial.pdf", textPdf, "application/pdf");
    check("upload returns HTTP 200", r1.status === 200);
    check("response includes the persisted file", !!r1.json?.file);
    check(
      "text was extracted (rule-based entities found)",
      Array.isArray(r1.json?.entities) && r1.json.entities.length > 0,
    );
    check(
      "claim number entity extracted from PDF text",
      (r1.json?.entities || []).some((e: any) => e.entityType === "claim_number"),
    );
    check("a claim draft was created from extracted indicators", !!r1.json?.draft);
    check(
      "extractionStatus is 'complete' when AI configured",
      r1.json?.file?.extractionStatus === "complete",
    );
    check("AI extraction result present in response", !!r1.json?.extraction);

    // ── PDF: text-less ──────────────────────────────────────────────────────
    console.log("\n=== 2. Text-less PDF: upload succeeds, status 'failed' ===");
    const blankPdf = buildPdf("");
    const r2 = await uploadFile(port, "blank.pdf", blankPdf, "application/pdf");
    check("upload returns HTTP 200 (does not crash)", r2.status === 200);
    check("response includes the persisted file", !!r2.json?.file);
    check(
      "extractionStatus is 'failed' (valid enum, not a crash)",
      r2.json?.file?.extractionStatus === "failed",
    );

    // ── TXT ─────────────────────────────────────────────────────────────────
    console.log("\n=== 3. TXT upload: direct UTF-8 text path ===");
    const txtBuf = buildTextFile(CLAIM_TEXT);
    const r3 = await uploadFile(port, "estimate.txt", txtBuf, "text/plain");
    check("TXT upload returns HTTP 200", r3.status === 200);
    check("response includes the persisted file", !!r3.json?.file);
    check(
      "entities extracted from TXT content",
      Array.isArray(r3.json?.entities) && r3.json.entities.length > 0,
    );
    check(
      "claim number entity extracted from TXT",
      (r3.json?.entities || []).some((e: any) => e.entityType === "claim_number"),
    );
    check(
      "TXT extractionStatus is 'complete' when AI configured",
      r3.json?.file?.extractionStatus === "complete",
    );
    check("AI extraction result present for TXT", !!r3.json?.extraction);

    // ── EML ─────────────────────────────────────────────────────────────────
    console.log("\n=== 4. EML upload: same text path as TXT ===");
    const emlContent =
      `From: adjuster@insurance.com\r\n` +
      `To: contractor@example.com\r\n` +
      `Subject: Claim Update\r\n\r\n` +
      CLAIM_TEXT;
    const emlBuf = buildTextFile(emlContent);
    const r4 = await uploadFile(port, "adjuster-email.eml", emlBuf, "message/rfc822");
    check("EML upload returns HTTP 200", r4.status === 200);
    check("response includes the persisted file", !!r4.json?.file);
    check(
      "entities extracted from EML content",
      Array.isArray(r4.json?.entities) && r4.json.entities.length > 0,
    );
    check(
      "claim number entity extracted from EML",
      (r4.json?.entities || []).some((e: any) => e.entityType === "claim_number"),
    );
    check(
      "EML extractionStatus is 'complete' when AI configured",
      r4.json?.file?.extractionStatus === "complete",
    );
    check("AI extraction result present for EML", !!r4.json?.extraction);

    // ── No pdf-parse ESM regression ─────────────────────────────────────────
    console.log("\n=== 5. No pdf-parse ESM/CommonJS regression ===");
    const joined = errCapture.lines.join("\n");
    check(
      "no 'require is not defined' error during extraction",
      !/require is not defined/i.test(joined),
    );
    check(
      "no '[pdf-parse] failed to extract text' error logged",
      !/\[pdf-parse\] failed to extract text/.test(joined),
    );
  } finally {
    errCapture.restore();
    appServer.close();
    fakeOpenAI.close();
  }

  exit();
}

run();


/**
 * Evidence upload pipeline regression tests.
 * Run with:  npx tsx server/evidence-upload.test.ts
 *
 * Covers:
 *   PDF   — text extraction via pdf-parse, AI extraction, extractionStatus enum
 *   PDF   — image-only/scanned: vision OCR fallback recovers fields
 *   TXT   — direct UTF-8 read, entity extraction, AI extraction
 *   EML   — same text path as TXT (different MIME / extension)
 *   DOCX  — ZIP parse + XML strip, entity extraction, extractionStatus enum
 *
 * Guards:
 *   - ESM/CommonJS pdf-parse bug ("require is not defined")
 *   - extraction_status enum validity ("no_text" → "failed")
 *   - All upload paths exercise the real multer + extraction pipeline.
 *
 * DB and OpenAI network calls are stubbed so the test is hermetic.
 */
import http from "http";
import {
  makeTestRunner,
  buildPdf,
  buildDocx,
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
  // Include all required fields for claim creation gate (homeownerName, dateOfLoss, carrier, propertyAddress, lossType).
  const fakeOpenAI = await startFakeOpenAI({
    claimNumber: "ABC-12345",
    confidence: 0.9,
    homeownerName: "John Smith",
    insuredName: "John Smith",
    dateOfLoss: "01/15/2025",
    carrier: "Acme Insurance",
    propertyAddress: "123 Main St",
    lossType: "Wind/Hail",
  });
  const fakeAddr = fakeOpenAI.address();
  const aiPort = typeof fakeAddr === "object" && fakeAddr !== null ? fakeAddr.port : 0;
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
      (r1.json?.entities || []).some((e: { entityType?: string }) => e.entityType === "claim_number"),
    );
    check("a real claim was created from extracted indicators", !!r1.json?.createdClaim?.id);
    check("created claim carries the extracted claim number", r1.json?.createdClaim?.claimNumber === "ABC-12345");
    check(
      "extractionStatus is 'complete' when AI configured",
      r1.json?.file?.extractionStatus === "complete",
    );
    check("AI extraction result present in response", !!r1.json?.extraction);

    // ── PDF: text-less (scanned) → vision OCR fallback recovers ─────────────
    console.log("\n=== 2. Text-less PDF: vision OCR fallback recovers fields ===");
    const blankPdf = buildPdf("");
    const r2 = await uploadFile(port, "blank.pdf", blankPdf, "application/pdf");
    check("upload returns HTTP 200 (does not crash)", r2.status === 200);
    check("response includes the persisted file", !!r2.json?.file);
    check(
      "extractionStatus is 'complete' (recovered via vision, not 'failed')",
      r2.json?.file?.extractionStatus === "complete",
    );
    check("vision extraction result present in response", !!r2.json?.extraction);

    // ── PDF: text-less (scanned) → vision OCR unavailable → "failed" ────────
    // This is the required guard: when AI is configured but the vision call
    // fails (service error), the status must be "failed", not a crash/exception.
    console.log("\n=== 2b. Text-less PDF: vision OCR fails → extractionStatus 'failed' ===");
    {
      // Stand up a server that returns 500 for all AI requests.
      const failServer = await new Promise<http.Server>((resolve) => {
        const s = http.createServer((_req, res) => {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "service unavailable" }));
        });
        s.listen(0, "127.0.0.1", () => resolve(s));
      });
      const failAddr = failServer.address() as { port: number };
      const origUrl = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
      process.env.AI_INTEGRATIONS_OPENAI_BASE_URL = `http://127.0.0.1:${failAddr.port}/v1`;
      try {
        const r2b = await uploadFile(port, "scanned.pdf", buildPdf(""), "application/pdf");
        check("scanned PDF upload returns HTTP 200 when vision fails", r2b.status === 200);
        check("response includes the persisted file even when vision fails", !!r2b.json?.file);
        check(
          "extractionStatus is 'failed' when AI is configured but vision call errors",
          r2b.json?.file?.extractionStatus === "failed",
        );
      } finally {
        process.env.AI_INTEGRATIONS_OPENAI_BASE_URL = origUrl;
        failServer.close();
      }
    }

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
      (r3.json?.entities || []).some((e: { entityType?: string }) => e.entityType === "claim_number"),
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
      (r4.json?.entities || []).some((e: { entityType?: string }) => e.entityType === "claim_number"),
    );
    check(
      "EML extractionStatus is 'complete' when AI configured",
      r4.json?.file?.extractionStatus === "complete",
    );
    check("AI extraction result present for EML", !!r4.json?.extraction);

    // ── DOCX ────────────────────────────────────────────────────────────────
    console.log("\n=== 5. DOCX upload: ZIP parse + XML strip text path ===");
    const docxBuf = buildDocx(CLAIM_TEXT);
    const r5 = await uploadFile(
      port,
      "denial-letter.docx",
      docxBuf,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    check("DOCX upload returns HTTP 200", r5.status === 200);
    check("response includes the persisted file", !!r5.json?.file);
    check(
      "entities extracted from DOCX content",
      Array.isArray(r5.json?.entities) && r5.json.entities.length > 0,
    );
    check(
      "claim number entity extracted from DOCX",
      (r5.json?.entities || []).some((e: { entityType?: string }) => e.entityType === "claim_number"),
    );
    check(
      "extractionStatus is 'complete' or 'failed' (not a crash or undefined)",
      ["complete", "failed"].includes(r5.json?.file?.extractionStatus),
    );
    check(
      "extractionStatus is 'complete' when AI is configured and text was extracted",
      r5.json?.file?.extractionStatus === "complete",
    );
    check("AI extraction result present for DOCX", !!r5.json?.extraction);

    // ── No pdf-parse ESM regression ─────────────────────────────────────────
    console.log("\n=== 6. No pdf-parse ESM/CommonJS regression ===");
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

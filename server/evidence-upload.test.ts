/**
 * PDF upload extraction regression test.
 * Run with:  npx tsx server/evidence-upload.test.ts
 *
 * Proves (guards the ESM/CommonJS pdf-parse bug + extraction_status enum bug):
 *   1. A real PDF buffer uploaded through POST /api/evidence/upload has its text
 *      extracted (entities found, claim draft created) with NO "require is not
 *      defined" runtime error from the pdf-parse dynamic import.
 *   2. With AI configured (stubbed via a local fake OpenAI endpoint), the file's
 *      extractionStatus is "complete".
 *   3. A text-less PDF still uploads successfully (HTTP 200) and is persisted with
 *      extractionStatus "failed" — a valid extraction_status enum value.
 *
 * The DB and the OpenAI network call are stubbed so the test is hermetic: it
 * exercises the genuine multer + pdf-parse + extraction pipeline, not mocks of it.
 */
import http from "http";
import express from "express";
import { storage } from "./storage";
import evidenceRouter from "./evidence";

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean) {
  if (cond) {
    passed++;
    console.log(`  \u2713 ${name}`);
  } else {
    failed++;
    console.error(`  \u2717 FAIL: ${name}`);
  }
}

// ── Build a minimal, valid PDF with correct xref byte offsets ─────────────────
// Keep everything ASCII so JS string length == byte length (offsets stay correct).
function buildPdf(bodyText: string): Buffer {
  const content = bodyText
    ? `BT /F1 12 Tf 50 700 Td (${bodyText.replace(/([()\\])/g, "\\$1")}) Tj ET`
    : "";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (const off of offsets) {
    pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}

// ── In-memory storage stubs (no real DB queries) ─────────────────────────────
function installStorageStubs() {
  (storage as any).getEvidenceFileBySha256 = async () => undefined;
  (storage as any).getClaims = async () => [];
  (storage as any).getAllClaimsAcrossTenants = async () => [];
  (storage as any).createEvidenceFile = async (file: any) => ({ id: "ef-test-1", ...file });
  (storage as any).createExtractedEntity = async (e: any) => ({ id: "ee-1", ...e });
  (storage as any).createClaimDraft = async (d: any) => ({ id: "draft-1", ...d });
  (storage as any).createTimelineEvent = async (e: any) => ({ id: "te-1", ...e });
  (storage as any).createAuditLog = async () => ({ id: "al-1" });
}

// ── Fake OpenAI chat-completions endpoint (replaces the real network call) ────
function startFakeOpenAI(): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const payload = {
        id: "chatcmpl-test",
        object: "chat.completion",
        created: 0,
        model: "gpt-5.4",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: JSON.stringify({ claimNumber: "ABC-12345", confidence: 0.9 }),
            },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(payload));
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

// ── Multipart upload helper (exercises the real multer middleware) ───────────
function uploadPdf(
  port: number,
  fileName: string,
  pdf: Buffer,
): Promise<{ status: number; json: any }> {
  const boundary = "----claimsignaltestboundary";
  const head = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
      `Content-Type: application/pdf\r\n\r\n`,
    "utf-8",
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, "utf-8");
  const payload = Buffer.concat([head, pdf, tail]);

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path: "/api/evidence/upload",
        method: "POST",
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": payload.length,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          let json: any = null;
          try { json = JSON.parse(data); } catch { /* leave null */ }
          resolve({ status: res.statusCode || 0, json });
        });
      },
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function run() {
  process.env.NODE_ENV = "test";
  installStorageStubs();

  // Point the OpenAI integration at our local fake so extraction is hermetic.
  const fakeOpenAI = await startFakeOpenAI();
  const aiPort = (fakeOpenAI.address() as any).port;
  process.env.AI_INTEGRATIONS_OPENAI_API_KEY = "test-key";
  process.env.AI_INTEGRATIONS_OPENAI_BASE_URL = `http://127.0.0.1:${aiPort}/v1`;

  // Mount the real evidence router behind a minimal auth-injecting middleware.
  const app = express();
  app.use((req: any, _res, next) => {
    req.auth = { userId: "user-1", organizationId: "org-1", role: "standard", email: "t@t.com" };
    next();
  });
  app.use("/api/evidence", evidenceRouter);
  const appServer: http.Server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const port = (appServer.address() as any).port;

  // Capture console.error so we can assert the pdf-parse ESM bug never resurfaces.
  const errorLog: string[] = [];
  const originalError = console.error;
  console.error = (...args: any[]) => { errorLog.push(args.map(String).join(" ")); };

  try {
    console.log("\n=== 1. PDF with text: extracted + AI extraction complete ===");
    const textPdf = buildPdf(
      "Claim Number: ABC-12345 Policy Number: POL-99887 Insured: John Smith Property Address: 123 Main St Date of Loss: 01/15/2025 Carrier: Acme Insurance",
    );
    const r1 = await uploadPdf(port, "denial.pdf", textPdf);
    check("upload returns HTTP 200", r1.status === 200);
    check("response includes the persisted file", !!r1.json?.file);
    check("text was extracted (rule-based entities found)", Array.isArray(r1.json?.entities) && r1.json.entities.length > 0);
    check("claim number entity extracted from PDF text", (r1.json?.entities || []).some((e: any) => e.entityType === "claim_number"));
    check("a claim draft was created from extracted indicators", !!r1.json?.draft);
    check("extractionStatus is 'complete' when AI configured", r1.json?.file?.extractionStatus === "complete");
    check("AI extraction result present in response", !!r1.json?.extraction);

    console.log("\n=== 2. Text-less PDF: upload still succeeds, status 'failed' ===");
    const blankPdf = buildPdf("");
    const r2 = await uploadPdf(port, "blank.pdf", blankPdf);
    check("upload returns HTTP 200 (does not crash)", r2.status === 200);
    check("response includes the persisted file", !!r2.json?.file);
    check("extractionStatus is 'failed' (valid enum, not a crash)", r2.json?.file?.extractionStatus === "failed");

    console.log("\n=== 3. No pdf-parse ESM/CommonJS regression ===");
    const joined = errorLog.join("\n");
    check("no 'require is not defined' error during extraction", !/require is not defined/i.test(joined));
    check("no '[pdf-parse] failed to extract text' error logged", !/\[pdf-parse\] failed to extract text/.test(joined));
  } finally {
    console.error = originalError;
    appServer.close();
    fakeOpenAI.close();
  }

  console.log(`\n================ RESULT: ${passed} passed, ${failed} failed ================\n`);
  process.exit(failed === 0 ? 0 : 1);
}

run();

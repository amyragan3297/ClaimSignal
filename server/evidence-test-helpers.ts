/**
 * Shared helpers for evidence upload regression tests.
 *
 * Exports:
 *   makeTestRunner()   – isolated pass/fail counter + check() + summary/exit
 *   buildPdf()         – generates a minimal, structurally valid PDF buffer
 *   buildTextFile()    – returns a Buffer from a plain string (txt / eml)
 *   installStorageStubs() – replaces storage singleton methods with in-memory stubs
 *   startFakeOpenAI()  – starts a local HTTP server that returns a canned chat-completion
 *   uploadFile()       – posts a multipart/form-data upload to a running test server
 *   mountEvidenceApp() – wraps the real evidence router with a minimal auth-injecting app
 */
import http from "http";
import express from "express";
import { storage } from "./storage";
import evidenceRouter from "./evidence";

// ── Pass/fail tracking ────────────────────────────────────────────────────────

export interface TestRunner {
  check(name: string, cond: boolean): void;
  summary(): string;
  exit(): never;
}

export function makeTestRunner(): TestRunner {
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

  function summary(): string {
    return `${passed} passed, ${failed} failed`;
  }

  function exit(): never {
    console.log(`\n================ RESULT: ${summary()} ================\n`);
    process.exit(failed === 0 ? 0 : 1);
  }

  return { check, summary, exit };
}

// ── PDF builder ───────────────────────────────────────────────────────────────
// Builds a minimal, structurally valid PDF with correct xref byte offsets.
// Keeps everything ASCII so JS string length == byte length (offsets stay correct).

export function buildPdf(bodyText: string): Buffer {
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

// ── Plain-text / email builder ────────────────────────────────────────────────

export function buildTextFile(content: string): Buffer {
  return Buffer.from(content, "utf-8");
}

// ── Storage stubs (no real DB) ────────────────────────────────────────────────

export function installStorageStubs() {
  Object.assign(storage, {
    getEvidenceFileBySha256: async () => undefined,
    getClaims: async () => [],
    getAllClaimsAcrossTenants: async () => [],
    createEvidenceFile: async (file: object) => ({ id: "ef-test-1", ...file }),
    createExtractedEntity: async (e: object) => ({ id: "ee-1", ...e }),
    createClaimDraft: async (d: object) => ({ id: "draft-1", ...d }),
    createTimelineEvent: async (e: object) => ({ id: "te-1", ...e }),
    createAuditLog: async () => ({ id: "al-1" }),
  });
}

// ── Fake OpenAI server ────────────────────────────────────────────────────────
// Returns a canned chat-completion so AI extraction runs hermetically.
// Handles the new sectioned pipeline: reads request body to detect which Zod
// schema is being requested (via response_format.json_schema.name) and returns
// a properly-shaped null-filled response for each section. Legacy monolithic
// requests fall back to returning customFields directly.

export function startFakeOpenAI(
  customFields: Record<string, unknown> = { claimNumber: "TEST-12345", confidence: 0.9 },
): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk: Buffer | string) => { body += chunk.toString(); });
    req.on("end", () => {
      let reqJson: Record<string, unknown> = {};
      try { reqJson = JSON.parse(body) as Record<string, unknown>; } catch { /* ignore */ }

      const responseFormat = reqJson.response_format as Record<string, unknown> | undefined;
      const schemaName = (responseFormat?.json_schema as Record<string, unknown> | undefined)?.name as string | undefined;

      let content: Record<string, unknown>;

      if (schemaName === "ClaimBasics") {
        content = {
          claimNumber:      customFields.claimNumber ?? null,
          carrier:          customFields.carrier ?? null,
          policyNumber:     customFields.policyNumber ?? null,
          lossType:         customFields.lossType ?? null,
          dateOfLoss:       customFields.dateOfLoss ?? null,
          dateReported:     null,
          denialReason:     null,
          initialOutcome:   null,
          finalOutcome:     null,
          denialOverturned: null,
        };
      } else if (schemaName === "People") {
        content = {
          homeownerName:   customFields.homeownerName ?? null,
          homeownerPhone:  null,
          homeownerEmail:  null,
          insuredName:     customFields.insuredName ?? null,
          propertyAddress: customFields.propertyAddress ?? null,
          city:            customFields.city ?? null,
          state:           customFields.state ?? null,
          zipCode:         customFields.zipCode ?? null,
          adjusterName:    customFields.adjusterName ?? null,
          adjusterPhone:   customFields.adjusterPhone ?? null,
          adjusterEmail:   customFields.adjusterEmail ?? null,
          iaFirm:          null,
        };
      } else if (schemaName === "Financials") {
        content = {
          rcv: null, acv: null, deductible: null, netClaim: null,
          supplementTotal: null, depreciation: null, supplementRequested: null,
          supplementApproved: null, approvedAmount: null, claimAmount: null,
          finalPaid: null, recoverableDepreciation: null,
        };
      } else if (schemaName === "Dates") {
        content = {
          inspectionDate: null, estimateDate: null, denialDate: null,
          approvalDate: null, paymentDate: null,
        };
      } else if (schemaName === "Vendors") {
        content = {
          contractor: null, engineer: null, publicAdjuster: null,
          attorney: null, vendorName: null,
        };
      } else if (schemaName === "Evidence") {
        content = {
          photoInspectionDone: null, weatherEventConfirmed: null, scopeOfLossPresent: null,
        };
      } else {
        // Legacy path: classifyDoc (returns {docType}) or extractClaimFieldsFromText (returns flat fields)
        content = customFields;
      }

      const payload = {
        id: "chatcmpl-test",
        object: "chat.completion",
        created: 0,
        model: "gpt-5.4",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: JSON.stringify(content) },
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

// ── Multipart upload helper ───────────────────────────────────────────────────
// Exercises the real multer middleware by sending a well-formed multipart body.

export interface UploadResult {
  status: number;
  json: unknown;
}

export function uploadFile(
  port: number,
  fileName: string,
  fileBuffer: Buffer,
  mimeType: string,
): Promise<UploadResult> {
  const boundary = "----claimsignaltestboundary";
  const head = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n`,
    "utf-8",
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, "utf-8");
  const payload = Buffer.concat([head, fileBuffer, tail]);

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
          let json: unknown = null;
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

// ── Minimal Express app with injected auth ────────────────────────────────────

export interface MountedApp {
  port: number;
  server: http.Server;
}

export function mountEvidenceApp(): Promise<MountedApp> {
  const app = express();
  app.use((req, _res, next) => {
    (req as unknown as Record<string, unknown>).auth = {
      userId: "user-1",
      organizationId: "org-1",
      role: "individual",
      email: "t@t.com",
    };
    next();
  });
  app.use("/api/evidence", evidenceRouter);
  return new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => {
      const addr = s.address();
      resolve({ port: typeof addr === "object" && addr !== null ? addr.port : 0, server: s });
    });
  });
}

// ── Console.error capture ─────────────────────────────────────────────────────
// Temporarily replaces console.error, collects all messages, then restores.

export interface ErrorCapture {
  lines: string[];
  restore(): void;
}

export function captureConsoleError(): ErrorCapture {
  const lines: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => lines.push(args.map(String).join(" "));
  return {
    lines,
    restore() { console.error = original; },
  };
}

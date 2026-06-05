import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient, getAccessToken } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import type { Claim } from "@shared/schema";
import {
  Plus, Search, FileText, Eye, Loader2, X, Globe, MoreHorizontal,
  Archive, Trash2, Sparkles, Upload, Brain, FileUp, CheckCircle,
  PenLine, ChevronDown, ChevronUp,
} from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { claimAnalysisStatus } from "@/lib/data-source";

// ─── Schemas ──────────────────────────────────────────────────────────────────
const createClaimSchema = z.object({
  claimNumber: z.string().min(1, "Claim number required"),
  carrier: z.string().optional(),
  propertyAddress: z.string().optional(),
  homeownerName: z.string().optional(),
  homeownerPhone: z.string().optional(),
  homeownerEmail: z.string().optional(),
  policyNumber: z.string().optional(),
  insuredName: z.string().optional(),
  lossType: z.string().optional(),
  status: z.string().default("open"),
  notes: z.string().optional(),
  currentPhase: z.string().default("pre_claim"),
  dateOfLoss: z.string().optional(),
  rcvAmount: z.string().optional(),
  acvAmount: z.string().optional(),
  deductible: z.string().optional(),
  claimType: z.string().optional(),
  propertyType: z.string().optional(),
  iaFirm: z.string().optional(),
  vendorName: z.string().optional(),
  vendorType: z.string().optional(),
  vendorFinding: z.string().optional(),
  recoverableDepreciation: z.string().optional(),
  nonRecoverableDepreciation: z.string().optional(),
  priorPayments: z.string().optional(),
  supplementRequested: z.string().optional(),
  supplementApproved: z.string().optional(),
  denialReason: z.string().optional(),
  initialOutcome: z.string().optional(),
  finalOutcome: z.string().optional(),
  denialOverturned: z.boolean().optional(),
});

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

// ─── Colour helpers ────────────────────────────────────────────────────────────
const statusColors: Record<string, BadgeVariant> = {
  draft: "outline", open: "default", active: "default",
  in_progress: "secondary", inspection_scheduled: "secondary",
  inspected: "secondary", supplement_pending: "secondary",
  carrier_review: "secondary", approved: "default",
  partially_approved: "secondary", denied: "destructive",
  escalated: "destructive", overturned: "default",
  closed: "outline", archived: "outline",
};

const phaseColors: Record<string, BadgeVariant> = {
  pre_claim: "outline", filed: "default", inspected: "secondary",
  initial_determination: "secondary", supplement_submitted: "secondary",
  reinspection_requested: "secondary", escalated: "destructive",
  resolved: "default", closed: "outline",
};

const escalationColors = (level: number | null | undefined): BadgeVariant => {
  if (level == null) return "outline";
  if (level <= 1) return "secondary";
  if (level <= 3) return "secondary";
  return "destructive";
};

const formatPhase = (phase: string) =>
  phase.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

// ─── Extraction field sections for the review step ───────────────────────────
const REVIEW_SECTIONS = [
  {
    title: "Claim Identifiers",
    fields: [
      { key: "claimNumber", label: "Claim Number", placeholder: "e.g. CLM-2026-001" },
      { key: "policyNumber", label: "Policy Number", placeholder: "e.g. POL-12345" },
    ],
  },
  {
    title: "People & Organizations",
    fields: [
      { key: "homeownerName", label: "Homeowner", placeholder: "Full name" },
      { key: "carrier", label: "Carrier", placeholder: "Insurance company" },
      { key: "adjusterName", label: "Adjuster", placeholder: "Adjuster name" },
      { key: "iaFirm", label: "IA Firm", placeholder: "Independent adjusting firm" },
    ],
  },
  {
    title: "Property",
    fields: [
      { key: "propertyAddress", label: "Address", placeholder: "Street address" },
      { key: "city", label: "City", placeholder: "" },
      { key: "state", label: "State", placeholder: "TX" },
      { key: "zipCode", label: "Zip Code", placeholder: "12345" },
    ],
  },
  {
    title: "Key Dates",
    fields: [
      { key: "dateOfLoss", label: "Date of Loss", placeholder: "YYYY-MM-DD" },
      { key: "inspectionDate", label: "Inspection Date", placeholder: "YYYY-MM-DD" },
    ],
  },
  {
    title: "Financials",
    fields: [
      { key: "rcv", label: "RCV ($)", placeholder: "0.00" },
      { key: "acv", label: "ACV ($)", placeholder: "0.00" },
      { key: "deductible", label: "Deductible ($)", placeholder: "0.00" },
      { key: "supplementRequested", label: "Supplement Requested ($)", placeholder: "0.00" },
    ],
  },
  {
    title: "Outcome",
    fields: [
      { key: "denialReason", label: "Denial Reason", placeholder: "If denied" },
      { key: "initialOutcome", label: "Initial Outcome", placeholder: "Approved / Denied / Partial" },
      { key: "finalOutcome", label: "Final Outcome", placeholder: "After escalation" },
    ],
  },
];

type ExtractionRecord = Record<string, string | number | boolean | string[] | null | undefined>;

interface UploadResult {
  file: { id: string; fileName: string; docCategory?: string; extractionStatus?: string; confidence?: number };
  extraction: ExtractionRecord | null;
  matchedClaimId: string | null;
  createdClaim?: { id: string; claimNumber: string } | null;
}

interface CreateFromExtractionResult {
  claim?: { claimNumber?: string };
}

// ─── CreateClaimDialog ─────────────────────────────────────────────────────────
function CreateClaimDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  type Mode = "choose" | "manual" | "uploading" | "review";
  const [mode, setMode] = useState<Mode>("choose");
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [extractionFields, setExtractionFields] = useState<Record<string, string>>({});
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Reset state whenever the dialog opens/closes
  useEffect(() => {
    if (!open) {
      setMode("choose");
      setUploadResult(null);
      setExtractionFields({});
      setShowAdvanced(false);
      setIsDragOver(false);
      form.reset();
    }
  }, [open]);

  // ── Manual form ────────────────────────────────────────────────────────────
  const form = useForm<z.infer<typeof createClaimSchema>>({
    resolver: zodResolver(createClaimSchema),
    defaultValues: {
      claimNumber: "", carrier: "", propertyAddress: "",
      homeownerName: "", homeownerPhone: "", homeownerEmail: "",
      policyNumber: "", insuredName: "", lossType: "",
      status: "open", notes: "", currentPhase: "pre_claim",
      dateOfLoss: "", rcvAmount: "", acvAmount: "", deductible: "",
      claimType: "", propertyType: "", iaFirm: "",
      vendorName: "", vendorType: "", vendorFinding: "",
      recoverableDepreciation: "", nonRecoverableDepreciation: "",
      priorPayments: "", supplementRequested: "", supplementApproved: "",
      denialReason: "", initialOutcome: "", finalOutcome: "",
      denialOverturned: false,
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: z.infer<typeof createClaimSchema>) => {
      await apiRequest("POST", "/api/claims", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/claims"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "Claim created successfully" });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create claim", description: err.message, variant: "destructive" });
    },
  });

  // ── Upload & Extract ───────────────────────────────────────────────────────
  const populateFields = useCallback((extraction: ExtractionRecord | null | undefined) => {
    if (!extraction) return;
    const fieldMap: [string, string][] = [
      ["claimNumber","claimNumber"], ["policyNumber","policyNumber"],
      ["homeownerName","homeownerName"], ["insuredName","insuredName"],
      ["carrier","carrier"], ["adjusterName","adjusterName"],
      ["adjusterEmail","adjusterEmail"], ["adjusterPhone","adjusterPhone"],
      ["iaFirm","iaFirm"], ["vendor","vendorName"],
      ["propertyAddress","propertyAddress"], ["city","city"],
      ["state","state"], ["zipCode","zipCode"],
      ["dateOfLoss","dateOfLoss"], ["inspectionDate","inspectionDate"],
      ["rcv","rcv"], ["acv","acv"], ["deductible","deductible"],
      ["supplementRequested","supplementRequested"],
      ["supplementApproved","supplementApproved"],
      ["denialReason","denialReason"],
      ["initialOutcome","initialOutcome"], ["finalOutcome","finalOutcome"],
    ];
    const out: Record<string, string> = {};
    for (const [exKey, stateKey] of fieldMap) {
      const v = extraction[exKey];
      if (v != null && typeof v !== "object" && String(v).trim()) {
        out[stateKey] = String(v).trim();
      }
    }
    setExtractionFields(out);
  }, []);

  const handleUploadFile = useCallback(async (file: File) => {
    setMode("uploading");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const token = getAccessToken();
      const res = await fetch("/api/evidence/upload", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
        credentials: "include",
      });

      if (res.status === 409) {
        const body = await res.json();
        if (body.duplicate && body.existingFile) {
          const exFile = body.existingFile;
          const ext = (exFile.extractedJson as { extraction?: ExtractionRecord } | null)?.extraction ?? null;
          toast({ title: "Document already in library", description: "Loading extraction from existing file." });
          setUploadResult({ file: exFile, extraction: ext, matchedClaimId: exFile.claimId, createdClaim: null });
          populateFields(ext);
          queryClient.invalidateQueries({ queryKey: ["/api/evidence/files"] });
          setMode("review");
          return;
        }
      }

      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(text || "Upload failed");
      }

      const result: UploadResult = await res.json();
      setUploadResult(result);
      populateFields(result.extraction);
      queryClient.invalidateQueries({ queryKey: ["/api/evidence/files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/claims"] });
      queryClient.invalidateQueries({ queryKey: ["/api/adjusters"] });
      setMode("review");
    } catch (err: unknown) {
      toast({ title: "Upload failed", description: (err as Error).message, variant: "destructive" });
      setMode("choose");
    }
  }, [populateFields, toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files[0]) handleUploadFile(files[0]);
  }, [handleUploadFile]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files?.[0]) handleUploadFile(files[0]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [handleUploadFile]);

  const createFromExtractionMutation = useMutation({
    mutationFn: async () => {
      if (!uploadResult) throw new Error("No upload result");
      const res = await apiRequest("POST", `/api/evidence/files/${uploadResult.file.id}/create-claim`, {
        fields: extractionFields,
      });
      return res.json();
    },
    onSuccess: (data: CreateFromExtractionResult) => {
      queryClient.invalidateQueries({ queryKey: ["/api/claims"] });
      queryClient.invalidateQueries({ queryKey: ["/api/evidence/files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/evidence/drafts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      const cn = data.claim?.claimNumber || "";
      toast({ title: `Claim ${cn} created`, description: "Adjuster, timeline, and intelligence updated." });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create claim", description: err.message, variant: "destructive" });
    },
  });

  // ── Extraction stats ───────────────────────────────────────────────────────
  const uploadConf = (uploadResult?.extraction?.confidence as number | null | undefined) ?? 0;
  const confLabel = uploadConf >= 0.8 ? "High" : uploadConf >= 0.5 ? "Medium" : "Low";
  const confColor = uploadConf >= 0.8 ? "text-green-400" : uploadConf >= 0.5 ? "text-amber-400" : "text-red-400";
  const extractedCount = Object.keys(extractionFields).filter(k => extractionFields[k]).length;
  const docType = uploadResult?.file?.docCategory?.replace(/_/g, " ") || "unknown";
  const exStatus = uploadResult?.file?.extractionStatus;
  const exStatusLabel = exStatus === "complete" ? "AI extraction complete"
    : exStatus === "failed" ? "Extraction failed — rule-based only"
    : exStatus === "processing" ? "Extraction pending"
    : "Extraction pending";
  const exStatusColor = exStatus === "complete" ? "text-green-400"
    : exStatus === "failed" ? "text-amber-400"
    : "text-muted-foreground";

  // Visible sections: show ones with at least one extracted value, or always-visible sections
  const ALWAYS_VISIBLE = new Set(["Claim Identifiers", "People & Organizations", "Property", "Key Dates"]);
  const visibleSections = REVIEW_SECTIONS.filter(s =>
    ALWAYS_VISIBLE.has(s.title) ||
    s.fields.some(f => extractionFields[f.key])
  );
  const advancedSections = REVIEW_SECTIONS.filter(s =>
    !ALWAYS_VISIBLE.has(s.title) &&
    !s.fields.some(f => extractionFields[f.key])
  );

  // ── Dialog width by mode ───────────────────────────────────────────────────
  const maxW = mode === "review" ? "max-w-2xl" : "max-w-lg";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${maxW} max-h-[92vh] overflow-y-auto`}>
        {/* ── CHOOSE PATH ──────────────────────────────────────────────────── */}
        {mode === "choose" && (
          <>
            <DialogHeader>
              <DialogTitle data-testid="text-create-claim-title">New Claim</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">How do you want to create this claim?</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <button
                className="group rounded-lg border-2 border-border hover:border-primary/60 bg-muted/20 hover:bg-primary/5 p-5 text-left transition-all space-y-2"
                onClick={() => setMode("manual")}
                data-testid="button-create-manually"
              >
                <div className="flex items-center gap-2 font-semibold">
                  <PenLine className="w-5 h-5 text-muted-foreground group-hover:text-primary" />
                  Enter Manually
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Fill in claim fields yourself. Good for claims you already have data for.
                </p>
              </button>
              <button
                className="group rounded-lg border-2 border-primary/40 hover:border-primary bg-primary/5 hover:bg-primary/10 p-5 text-left transition-all space-y-2 relative"
                onClick={() => setMode("uploading")}
                data-testid="button-upload-extract"
              >
                <div className="absolute top-2 right-2">
                  <Badge variant="default" className="text-xs px-1.5 py-0.5">Recommended</Badge>
                </div>
                <div className="flex items-center gap-2 font-semibold">
                  <Brain className="w-5 h-5 text-primary" />
                  Upload &amp; Extract
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Upload a claim document. AI reads the file and pre-fills all extracted fields for your review.
                </p>
              </button>
            </div>
          </>
        )}

        {/* ── UPLOAD ZONE ──────────────────────────────────────────────────── */}
        {mode === "uploading" && (
          <>
            <DialogHeader>
              <DialogTitle>Upload Claim Document</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Upload an estimate, denial letter, scope, supplement, photo report, policy, invoice, email, or any claim document. AI will extract all readable fields.
            </p>

            <div
              className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors mt-2 ${
                isDragOver ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/50"
              }`}
              onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              data-testid="dropzone-claim-upload"
            >
              <div className="flex flex-col items-center gap-3">
                <FileUp className="w-10 h-10 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Drag &amp; drop your document here</p>
                  <p className="text-xs text-muted-foreground mt-1">PDF, Images, DOCX, TXT, EML — up to 50 MB</p>
                </div>
                <Button variant="outline" onClick={() => fileInputRef.current?.click()} data-testid="button-browse-claim-doc">
                  <Upload className="w-4 h-4" />
                  Browse Files
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.gif,.bmp,.tiff,.docx,.txt,.eml"
                  onChange={handleFileInputChange}
                  className="hidden"
                  data-testid="input-claim-doc-file"
                />
              </div>
            </div>

            {/* Show spinner while "uploading" but not yet processing */}
            <div className="flex items-center justify-center gap-3 py-2">
              <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
              <p className="text-sm text-muted-foreground">Waiting for file…</p>
            </div>

            <div className="flex justify-between gap-2 border-t border-border pt-3">
              <Button variant="ghost" onClick={() => setMode("choose")} data-testid="button-back-choose">
                ← Back
              </Button>
              <Button variant="outline" onClick={() => setMode("manual")} data-testid="button-skip-to-manual">
                Skip — Enter Manually
              </Button>
            </div>
          </>
        )}

        {/* ── AI ANALYZING (while fetch is in-flight; mode stays "uploading") ── */}
        {/* This is shown if mode switches to "uploading" AND a file is selected  */}
        {/* The spinner is already embedded above; extraction transitions to review */}

        {/* ── EXTRACTION REVIEW ─────────────────────────────────────────────── */}
        {mode === "review" && uploadResult && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2" data-testid="text-extraction-review-title">
                <Brain className="w-5 h-5 text-primary" />
                Extraction Review
              </DialogTitle>
            </DialogHeader>

            {/* Source info banner */}
            <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <p className="text-sm font-medium truncate" data-testid="text-review-filename">
                    {uploadResult.file.fileName}
                  </p>
                  <Badge variant="outline" className="text-xs capitalize flex-shrink-0">{docType}</Badge>
                </div>
                <span className={`text-xs font-medium ${exStatusColor}`} data-testid="text-extraction-status">
                  {exStatusLabel}
                </span>
              </div>
              {uploadResult.extraction && (
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">
                    AI Confidence: <span className={`font-medium ${confColor}`}>{(uploadConf * 100).toFixed(0)}% — {confLabel}</span>
                  </span>
                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${uploadConf * 100}%` }} />
                  </div>
                  <span className="text-xs text-muted-foreground flex-shrink-0" data-testid="text-extracted-count">
                    {extractedCount} field{extractedCount !== 1 ? "s" : ""} extracted
                  </span>
                </div>
              )}
              {!uploadResult.extraction && (
                <p className="text-xs text-amber-400" data-testid="text-no-extraction">
                  No extractable text found in this file. You can still create a claim — fill in the fields below manually.
                </p>
              )}
            </div>

            {/* Editable extracted fields */}
            <div className="space-y-5">
              <p className="text-xs text-muted-foreground">
                Review and edit each field. Clear any field you don't want applied. Fields highlighted in blue were extracted by AI.
              </p>

              {visibleSections.map(section => (
                <div key={section.title}>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    {section.title}
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {section.fields.map(field => {
                      const hasValue = !!extractionFields[field.key];
                      return (
                        <div key={field.key} className="space-y-1">
                          <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                            {field.label}
                            {hasValue && <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" title="AI extracted" />}
                          </label>
                          <Input
                            value={extractionFields[field.key] ?? ""}
                            onChange={e => setExtractionFields(prev => ({ ...prev, [field.key]: e.target.value }))}
                            placeholder={field.placeholder}
                            className={`h-8 text-sm ${hasValue ? "border-primary/40 bg-primary/5 focus:bg-background" : ""}`}
                            data-testid={`input-review-${field.key}`}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Advanced sections toggle */}
              {advancedSections.length > 0 && (
                <div>
                  <button
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setShowAdvanced(v => !v)}
                    data-testid="button-toggle-advanced"
                  >
                    {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    {showAdvanced ? "Hide" : "Show"} additional fields
                  </button>
                  {showAdvanced && advancedSections.map(section => (
                    <div key={section.title} className="mt-4">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                        {section.title}
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {section.fields.map(field => (
                          <div key={field.key} className="space-y-1">
                            <label className="text-xs text-muted-foreground">{field.label}</label>
                            <Input
                              value={extractionFields[field.key] ?? ""}
                              onChange={e => setExtractionFields(prev => ({ ...prev, [field.key]: e.target.value }))}
                              placeholder={field.placeholder}
                              className="h-8 text-sm"
                              data-testid={`input-review-adv-${field.key}`}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Missing scope items (informational) */}
              {((uploadResult.extraction?.missingScopeItems as string[] | undefined)?.length ?? 0) > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Missing Scope Items (informational)
                  </h4>
                  <ul className="space-y-1">
                    {((uploadResult.extraction?.missingScopeItems as string[] | undefined) ?? []).slice(0, 6).map((item: string, i: number) => (
                      <li key={i} className="text-xs flex items-start gap-2 text-muted-foreground" data-testid={`text-scope-item-${i}`}>
                        <span className="text-primary mt-0.5">•</span>{item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2 pt-3 border-t border-border">
              <Button
                disabled={createFromExtractionMutation.isPending}
                onClick={() => createFromExtractionMutation.mutate()}
                className="w-full"
                data-testid="button-create-from-extraction"
              >
                {createFromExtractionMutation.isPending
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <CheckCircle className="w-4 h-4" />}
                Create Claim from These Fields
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    // Pre-fill the manual form from extracted fields
                    const f = extractionFields;
                    form.setValue("claimNumber", f.claimNumber || "");
                    form.setValue("carrier", f.carrier || "");
                    form.setValue("homeownerName", f.homeownerName || f.insuredName || "");
                    form.setValue("insuredName", f.insuredName || "");
                    form.setValue("propertyAddress", f.propertyAddress || "");
                    form.setValue("policyNumber", f.policyNumber || "");
                    form.setValue("iaFirm", f.iaFirm || "");
                    form.setValue("dateOfLoss", f.dateOfLoss || "");
                    form.setValue("rcvAmount", f.rcv || "");
                    form.setValue("acvAmount", f.acv || "");
                    form.setValue("deductible", f.deductible || "");
                    form.setValue("denialReason", f.denialReason || "");
                    form.setValue("initialOutcome", f.initialOutcome || "");
                    form.setValue("finalOutcome", f.finalOutcome || "");
                    setMode("manual");
                  }}
                  data-testid="button-edit-in-form"
                >
                  <PenLine className="w-4 h-4" />
                  Edit in Full Form
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => onOpenChange(false)}
                  data-testid="button-cancel-review"
                >
                  Cancel
                </Button>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                File is already saved in your Evidence Library. Adjuster, timeline, and Signal Engine will be updated on claim creation.
              </p>
            </div>
          </>
        )}

        {/* ── MANUAL FORM ───────────────────────────────────────────────────── */}
        {mode === "manual" && (
          <>
            <DialogHeader>
              <DialogTitle>
                {uploadResult ? "Create Claim — Full Form" : "Create New Claim"}
              </DialogTitle>
            </DialogHeader>
            {uploadResult && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground rounded-md border border-border bg-muted/30 px-3 py-2">
                <FileText className="w-3.5 h-3.5 flex-shrink-0" />
                Fields pre-filled from <span className="font-medium">{uploadResult.file.fileName}</span>
                <button
                  className="ml-auto text-primary hover:underline flex-shrink-0"
                  onClick={() => setMode("review")}
                  data-testid="button-back-to-review"
                >
                  ← Back to extraction review
                </button>
              </div>
            )}
            <form onSubmit={form.handleSubmit((d) => createMutation.mutate(d))} className="space-y-4">
              <div className="space-y-2">
                <Label>Claim Number *</Label>
                <Input placeholder="CLM-00001" data-testid="input-claim-number" {...form.register("claimNumber")} />
                {form.formState.errors.claimNumber && (
                  <p className="text-xs text-destructive">{form.formState.errors.claimNumber.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Carrier</Label>
                <Input placeholder="State Farm, Allstate..." data-testid="input-carrier" {...form.register("carrier")} />
              </div>
              <div className="space-y-2">
                <Label>Property Address</Label>
                <Input placeholder="123 Main Street, Dallas TX" data-testid="input-address" {...form.register("propertyAddress")} />
              </div>
              <div className="space-y-2">
                <Label>Homeowner Name</Label>
                <Input placeholder="John Doe" data-testid="input-homeowner-name" {...form.register("homeownerName")} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Homeowner Phone</Label>
                  <Input placeholder="555-0100" data-testid="input-homeowner-phone" {...form.register("homeownerPhone")} />
                </div>
                <div className="space-y-2">
                  <Label>Homeowner Email</Label>
                  <Input placeholder="john@example.com" data-testid="input-homeowner-email" {...form.register("homeownerEmail")} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Policy Number</Label>
                  <Input placeholder="POL-12345" data-testid="input-policy-number" {...form.register("policyNumber")} />
                </div>
                <div className="space-y-2">
                  <Label>Loss Type</Label>
                  <Input placeholder="Wind, Hail, Fire..." data-testid="input-loss-type" {...form.register("lossType")} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Insured Name</Label>
                <Input placeholder="Insured party name" data-testid="input-insured-name" {...form.register("insuredName")} />
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea placeholder="Additional details..." data-testid="input-notes" {...form.register("notes")} className="resize-none" />
              </div>
              <div className="space-y-2">
                <Label>Current Phase</Label>
                <Select value={form.watch("currentPhase")} onValueChange={v => form.setValue("currentPhase", v)}>
                  <SelectTrigger data-testid="select-current-phase">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pre_claim">Pre Claim</SelectItem>
                    <SelectItem value="filed">Filed</SelectItem>
                    <SelectItem value="inspected">Inspected</SelectItem>
                    <SelectItem value="initial_determination">Initial Determination</SelectItem>
                    <SelectItem value="supplement_submitted">Supplement Submitted</SelectItem>
                    <SelectItem value="reinspection_requested">Reinspection Requested</SelectItem>
                    <SelectItem value="escalated">Escalated</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Date of Loss</Label>
                  <Input type="date" data-testid="input-date-of-loss" {...form.register("dateOfLoss")} />
                </div>
                <div className="space-y-2">
                  <Label>RCV Amount</Label>
                  <Input type="number" placeholder="0.00" data-testid="input-rcv-amount" {...form.register("rcvAmount")} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>ACV Amount</Label>
                  <Input type="number" placeholder="0.00" data-testid="input-acv-amount" {...form.register("acvAmount")} />
                </div>
                <div className="space-y-2">
                  <Label>Deductible</Label>
                  <Input type="number" placeholder="0.00" data-testid="input-deductible" {...form.register("deductible")} />
                </div>
              </div>

              <div className="pt-2 border-t border-border">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Claim Classification</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Claim Type</Label>
                    <Input placeholder="Hail, Wind, Fire..." data-testid="input-claim-type" {...form.register("claimType")} />
                  </div>
                  <div className="space-y-2">
                    <Label>Property Type</Label>
                    <Input placeholder="Residential, Commercial..." data-testid="input-property-type" {...form.register("propertyType")} />
                  </div>
                </div>
                <div className="space-y-2 mt-3">
                  <Label>IA Firm</Label>
                  <Input placeholder="Independent adjusting firm" data-testid="input-ia-firm" {...form.register("iaFirm")} />
                </div>
              </div>

              <div className="pt-2 border-t border-border">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Vendor Intelligence</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Vendor Name</Label>
                    <Input placeholder="EagleView, SeekNow..." data-testid="input-vendor-name" {...form.register("vendorName")} />
                  </div>
                  <div className="space-y-2">
                    <Label>Vendor Type</Label>
                    <Input placeholder="Inspection, Engineering..." data-testid="input-vendor-type" {...form.register("vendorType")} />
                  </div>
                </div>
                <div className="space-y-2 mt-3">
                  <Label>Vendor Finding</Label>
                  <Input placeholder="Summary of vendor finding" data-testid="input-vendor-finding" {...form.register("vendorFinding")} />
                </div>
              </div>

              <div className="pt-2 border-t border-border">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Financials &amp; Outcome</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Recoverable Depreciation</Label>
                    <Input type="number" placeholder="0.00" data-testid="input-recoverable-depreciation" {...form.register("recoverableDepreciation")} />
                  </div>
                  <div className="space-y-2">
                    <Label>Non-Recoverable Depreciation</Label>
                    <Input type="number" placeholder="0.00" data-testid="input-nonrecoverable-depreciation" {...form.register("nonRecoverableDepreciation")} />
                  </div>
                  <div className="space-y-2">
                    <Label>Prior Payments</Label>
                    <Input type="number" placeholder="0.00" data-testid="input-prior-payments" {...form.register("priorPayments")} />
                  </div>
                  <div className="space-y-2">
                    <Label>Supplement Requested</Label>
                    <Input type="number" placeholder="0.00" data-testid="input-supplement-requested" {...form.register("supplementRequested")} />
                  </div>
                  <div className="space-y-2">
                    <Label>Supplement Approved</Label>
                    <Input type="number" placeholder="0.00" data-testid="input-supplement-approved" {...form.register("supplementApproved")} />
                  </div>
                  <div className="space-y-2">
                    <Label>Initial Outcome</Label>
                    <Input placeholder="Approved, Partial, Denied..." data-testid="input-initial-outcome" {...form.register("initialOutcome")} />
                  </div>
                </div>
                <div className="space-y-2 mt-3">
                  <Label>Denial Reason</Label>
                  <Input placeholder="If denied/partial, why?" data-testid="input-denial-reason" {...form.register("denialReason")} />
                </div>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div className="space-y-2">
                    <Label>Final Outcome</Label>
                    <Input placeholder="Final result after escalation" data-testid="input-final-outcome" {...form.register("finalOutcome")} />
                  </div>
                  <div className="flex items-end pb-2">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <Checkbox
                        checked={form.watch("denialOverturned")}
                        onCheckedChange={v => form.setValue("denialOverturned", v === true)}
                        data-testid="checkbox-denial-overturned"
                      />
                      <span className="text-sm">Denial later overturned</span>
                    </label>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Record the initial decision and, if it changed (e.g. denied → overturned), the final outcome. This builds outcome history for intelligence.
                </p>
              </div>

              <div className="flex justify-between gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setMode(uploadResult ? "review" : "choose")}
                  data-testid="button-back-from-manual"
                >
                  ← Back
                </Button>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-claim">
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-claim">
                    {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                    Create Claim
                  </Button>
                </div>
              </div>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function ClaimsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: authData } = useAuth();
  const userRole = authData?.user?.role || "standard";
  const isMaster = userRole === "super_admin";
  const canArchive = !["carrier_analyst"].includes(userRole);
  const [sharedSearch, setSharedSearch] = useState("");
  const [showDemoRecords, setShowDemoRecords] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    type: "archive" | "delete";
    claim: Claim;
  } | null>(null);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);

  const { data: claims, isLoading } = useQuery<Claim[]>({
    queryKey: ["/api/claims"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/claims");
      return res.json();
    },
  });

  const { data: sharedClaims, isLoading: sharedLoading } = useQuery<Claim[]>({
    queryKey: ["/api/claims/shared", showDemoRecords],
    queryFn: async () => {
      const url = showDemoRecords
        ? "/api/claims/shared?includeDemoRecords=true"
        : "/api/claims/shared";
      const res = await apiRequest("GET", url);
      return res.json();
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (claimId: string) => {
      await apiRequest("PATCH", `/api/claims/${claimId}/archive`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/claims"] });
      toast({ title: "Claim archived" });
      setConfirmDialog(null);
    },
    onError: (err: Error) => {
      toast({ title: "Archive failed", description: err.message, variant: "destructive" });
    },
  });

  const permanentDeleteMutation = useMutation({
    mutationFn: async (claimId: string) => {
      await apiRequest("DELETE", `/api/claims/${claimId}/permanent`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/claims"] });
      toast({ title: "Claim permanently deleted" });
      setConfirmDialog(null);
    },
    onError: (err: Error) => {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    },
  });

  const aiAnalysisMutation = useMutation({
    mutationFn: async (claimId: string) => {
      setAnalyzingId(claimId);
      await apiRequest("POST", `/api/claims/${claimId}/ai-analysis`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/claims"] });
      toast({ title: "AI analysis generated" });
    },
    onError: (err: Error) => {
      toast({ title: "AI analysis failed", description: err.message, variant: "destructive" });
    },
    onSettled: () => setAnalyzingId(null),
  });

  const filteredClaims = claims?.filter(
    c =>
      (c.claimNumber || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.carrier || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.propertyAddress || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.homeownerName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      formatPhase(c.currentPhase || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-claims-title">Claims</h1>
          <p className="text-sm text-muted-foreground">Manage and track property claims</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} data-testid="button-new-claim">
          <Plus className="w-4 h-4" />
          New Claim
        </Button>
      </div>

      <CreateClaimDialog open={dialogOpen} onOpenChange={setDialogOpen} />

      <Tabs defaultValue="my-claims">
        <TabsList>
          <TabsTrigger value="my-claims" data-testid="tab-my-claims">My Claims</TabsTrigger>
          <TabsTrigger value="platform-library" data-testid="tab-platform-library">
            <Globe className="w-4 h-4 mr-1.5" />
            Platform Library
          </TabsTrigger>
        </TabsList>

        {/* ── My Claims ─────────────────────────────── */}
        <TabsContent value="my-claims" className="space-y-4 mt-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search claims..."
                className="pl-9"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                data-testid="input-search-claims"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-6 space-y-3">
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : !filteredClaims?.length ? (
                <div className="p-12 text-center">
                  <FileText className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                  <p className="text-muted-foreground font-medium">No claims found</p>
                  <p className="text-sm text-muted-foreground/70 mb-4">
                    {searchQuery ? "Try adjusting your search" : "Create your first claim to get started"}
                  </p>
                  {!searchQuery && (
                    <Button variant="outline" onClick={() => setDialogOpen(true)} data-testid="button-empty-new-claim">
                      <Plus className="w-4 h-4" />
                      New Claim
                    </Button>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {filteredClaims.map(claim => (
                    <div
                      key={claim.id}
                      className="p-4 hover:bg-accent/5 cursor-pointer transition-colors"
                      onClick={() => setLocation(`/claims/${claim.id}`)}
                      data-testid={`row-claim-${claim.id}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-mono text-sm font-semibold" data-testid={`text-claim-number-${claim.id}`}>
                              {claim.claimNumber}
                            </span>
                            <Badge variant={statusColors[claim.status] || "outline"} className="text-xs capitalize">
                              {claim.status.replace("_", " ")}
                            </Badge>
                            {analyzingId === claim.id ? (
                              <Badge variant="outline" className="text-xs gap-1" data-testid={`badge-analysis-${claim.id}`}>
                                <Loader2 className="w-3 h-3 animate-spin" /> Analyzing
                              </Badge>
                            ) : (() => {
                              const s = claimAnalysisStatus(claim);
                              return s.label !== "No Analysis" ? (
                                <Badge variant={s.variant} className="text-xs" data-testid={`badge-analysis-${claim.id}`}>{s.label}</Badge>
                              ) : null;
                            })()}
                          </div>
                          <p className="text-sm text-muted-foreground truncate" data-testid={`text-homeowner-${claim.id}`}>
                            {[claim.homeownerName, claim.carrier].filter(Boolean).join(" · ") || "—"}
                          </p>
                          {claim.propertyAddress && (
                            <p className="text-xs text-muted-foreground/70 truncate mt-0.5" data-testid={`text-address-${claim.id}`}>
                              {claim.propertyAddress}
                            </p>
                          )}
                          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                            <Badge variant={phaseColors[claim.currentPhase || ""] || "outline"} className="text-xs" data-testid={`badge-phase-${claim.id}`}>
                              {formatPhase(claim.currentPhase || "pre claim")}
                            </Badge>
                            {claim.escalationLevel != null && claim.escalationLevel > 0 && (
                              <Badge variant={escalationColors(claim.escalationLevel)} className="text-xs" data-testid={`badge-escalation-${claim.id}`}>
                                Esc {claim.escalationLevel}
                              </Badge>
                            )}
                            {claim.riskScore != null && (
                              <Badge variant={claim.riskScore > 70 ? "destructive" : claim.riskScore > 40 ? "secondary" : "outline"} className="text-xs">
                                Risk {claim.riskScore}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0">
                          {canArchive ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="icon" variant="ghost" className="h-8 w-8" data-testid={`button-claim-menu-${claim.id}`} onClick={e => e.stopPropagation()}>
                                  <MoreHorizontal className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  disabled={analyzingId === claim.id}
                                  onClick={e => { e.stopPropagation(); aiAnalysisMutation.mutate(claim.id); }}
                                  data-testid={`menu-analyze-claim-${claim.id}`}
                                >
                                  <Sparkles className="w-4 h-4 mr-2" />
                                  {claim.aiAnalysisAt ? "Re-run AI Analysis" : "Run AI Analysis"}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={e => { e.stopPropagation(); setConfirmDialog({ type: "archive", claim }); }}
                                  data-testid={`menu-archive-claim-${claim.id}`}
                                >
                                  <Archive className="w-4 h-4 mr-2" />
                                  Archive
                                </DropdownMenuItem>
                                {isMaster && (
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={e => { e.stopPropagation(); setConfirmDialog({ type: "delete", claim }); }}
                                    data-testid={`menu-delete-claim-${claim.id}`}
                                  >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Delete Permanently
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : (
                            <Eye className="w-4 h-4 text-muted-foreground mt-1" />
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Platform Library ───────────────────────── */}
        <TabsContent value="platform-library" className="space-y-4 mt-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Carrier, adjuster, location, loss type..."
                className="pl-9"
                value={sharedSearch}
                onChange={e => setSharedSearch(e.target.value)}
                data-testid="input-search-shared"
              />
              {sharedSearch && (
                <button onClick={() => setSharedSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <Badge variant="outline" className="text-xs gap-1 shrink-0">
              <Globe className="w-3 h-3" />
              {isMaster ? "Full Platform Access" : "Masked Intelligence View"}
            </Badge>
            {isMaster && (
              <div className="flex items-center gap-2 shrink-0 ml-auto">
                <Switch
                  id="demo-records-toggle"
                  checked={showDemoRecords}
                  onCheckedChange={setShowDemoRecords}
                  data-testid="toggle-demo-records"
                />
                <Label htmlFor="demo-records-toggle" className="text-xs text-muted-foreground cursor-pointer whitespace-nowrap">
                  Show demo records
                </Label>
              </div>
            )}
          </div>

          <Card>
            <CardContent className="p-0">
              {sharedLoading ? (
                <div className="p-6 space-y-3">
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : !sharedClaims?.filter(c =>
                !sharedSearch ||
                (c.carrier || "").toLowerCase().includes(sharedSearch.toLowerCase()) ||
                (c.propertyAddress || "").toLowerCase().includes(sharedSearch.toLowerCase()) ||
                (c.lossType || "").toLowerCase().includes(sharedSearch.toLowerCase()) ||
                (c.status || "").toLowerCase().includes(sharedSearch.toLowerCase())
              ).length ? (
                <div className="p-12 text-center">
                  <Globe className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                  <p className="text-muted-foreground font-medium">No shared records found</p>
                  <p className="text-sm text-muted-foreground/70">Claims contributed to the platform appear here for pattern intelligence.</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {sharedClaims
                    ?.filter(c =>
                      !sharedSearch ||
                      (c.carrier || "").toLowerCase().includes(sharedSearch.toLowerCase()) ||
                      (c.propertyAddress || "").toLowerCase().includes(sharedSearch.toLowerCase()) ||
                      (c.lossType || "").toLowerCase().includes(sharedSearch.toLowerCase()) ||
                      (c.status || "").toLowerCase().includes(sharedSearch.toLowerCase())
                    )
                    .map((claim, idx) => (
                      <div key={claim.id || idx} className="p-4" data-testid={`row-shared-${claim.id || idx}`}>
                        <div className="flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className="font-mono text-sm text-muted-foreground">{claim.claimNumber || "—"}</span>
                              <Badge variant={statusColors[claim.status] || "outline"} className="text-xs capitalize">
                                {claim.status.replace("_", " ")}
                              </Badge>
                              {claim.riskScore != null && (
                                <Badge variant={claim.riskScore > 70 ? "destructive" : claim.riskScore > 40 ? "secondary" : "outline"} className="text-xs">
                                  Risk {claim.riskScore}
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground truncate">
                              {[claim.homeownerName, claim.carrier].filter(Boolean).join(" · ") || "—"}
                            </p>
                            {claim.propertyAddress && (
                              <p className="text-xs text-muted-foreground/70 truncate mt-0.5">{claim.propertyAddress}</p>
                            )}
                            <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
                              {claim.lossType && <span>{claim.lossType}</span>}
                              {claim.dateOfLoss && <span>{new Date(claim.dateOfLoss).toLocaleDateString("en-US", { month: "short", year: "numeric" })}</span>}
                              {claim.rcvAmount && <span>RCV ${Number(claim.rcvAmount).toLocaleString()}</span>}
                            </div>
                          </div>
                          {isMaster ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="shrink-0 text-xs"
                              onClick={() => setLocation(`/claims/${claim.id}`)}
                              data-testid={`button-open-shared-${claim.id || idx}`}
                            >
                              Open
                            </Button>
                          ) : (
                            <span
                              className="shrink-0 text-xs text-muted-foreground/50 border border-border/40 rounded px-2 py-1 cursor-not-allowed select-none"
                              title="Masked record — full access requires Master role"
                              data-testid={`button-open-shared-masked-${claim.id || idx}`}
                            >
                              Masked
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>

          {!isMaster && (
            <p className="text-xs text-muted-foreground text-center" data-testid="text-masking-notice">
              Shared records are masked per platform privacy policy — homeowner names, full addresses, and claim numbers are sanitized at the server.
            </p>
          )}
        </TabsContent>
      </Tabs>

      {confirmDialog && (
        <ConfirmDialog
          open={!!confirmDialog}
          onOpenChange={o => { if (!o) setConfirmDialog(null); }}
          title={confirmDialog.type === "archive" ? "Archive Claim" : "Permanently Delete Claim"}
          description={
            confirmDialog.type === "archive"
              ? `Archive claim "${confirmDialog.claim.claimNumber}"? It will be hidden from normal views and can be restored from the Admin Governance Hub.`
              : `Permanently delete claim "${confirmDialog.claim.claimNumber}"? This cannot be undone and all data will be lost.`
          }
          confirmLabel={confirmDialog.type === "archive" ? "Archive" : "Delete Permanently"}
          variant={confirmDialog.type === "delete" ? "destructive" : "default"}
          isPending={archiveMutation.isPending || permanentDeleteMutation.isPending}
          onConfirm={() => {
            if (!confirmDialog) return;
            if (confirmDialog.type === "archive") {
              archiveMutation.mutate(confirmDialog.claim.id);
            } else {
              permanentDeleteMutation.mutate(confirmDialog.claim.id);
            }
          }}
        />
      )}
    </div>
  );
}

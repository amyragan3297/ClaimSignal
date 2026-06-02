/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient, getAccessToken } from "@/lib/queryClient";
import type {
  EvidenceFile,
  ExtractedEntity,
  ClaimDraft,
  Claim,
} from "@shared/schema";
import {
  Upload,
  FileUp,
  FileText,
  CheckCircle,
  AlertTriangle,
  X,
  Loader2,
  Link as LinkIcon,
  Brain,
  Sparkles,
  CheckCheck,
  Copy,
  FolderOpen,
  Archive,
  PlusCircle,
  AlertCircle,
} from "lucide-react";

const ACCEPTED_TYPES =
  ".pdf,.jpg,.jpeg,.png,.gif,.bmp,.tiff,.docx,.txt,.eml";

const categoryColors: Record<string, string> = {
  denial_letter: "destructive",
  estimate: "secondary",
  scope: "secondary",
  payment_letter: "default",
  supplement: "default",
  invoice: "outline",
  photo_report: "outline",
  policy: "secondary",
  email_thread: "outline",
  unknown: "outline",
};

function fmt(s: string) {
  return s.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function fmtFileSize(bytes: number | null | undefined): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString();
}

interface ExtractionData {
  claimNumber?: string;
  policyNumber?: string;
  homeownerName?: string;
  insuredName?: string;
  adjusterName?: string;
  adjusterEmail?: string;
  adjusterPhone?: string;
  iaFirm?: string;
  carrier?: string;
  vendor?: string;
  propertyAddress?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  dateOfLoss?: string;
  inspectionDate?: string;
  estimateDate?: string;
  denialDate?: string;
  approvalDate?: string;
  paymentDate?: string;
  rcv?: string;
  acv?: string;
  deductible?: string;
  recoverableDepreciation?: string;
  supplementRequested?: string;
  supplementApproved?: string;
  denialReason?: string;
  initialOutcome?: string;
  finalOutcome?: string;
  denialOverturned?: boolean;
  missingScopeItems?: string[];
  codeItems?: string[];
  reinspectionReferences?: string[];
  escalationReferences?: string[];
  timelineEvents?: Array<{ date: string; description: string }>;
  documentType?: string;
  confidence: number;
  extractionMethod: "llm";
}

interface UploadResult {
  file: EvidenceFile;
  entities: ExtractedEntity[];
  extraction?: ExtractionData | null;
  matchedClaimId: string | null;
  autoMatched?: boolean;
  matchConfidence?: number;
  matchConfidenceLabel?: string;
  matchReasons?: string[];
  draft: ClaimDraft | null;
}

interface DuplicateResult {
  message: string;
  existingFile: EvidenceFile;
}

interface MatchCandidate {
  claimId: string;
  score: number;
  confidenceLabel: string;
  reasons: string[];
  claimNumber: string | null;
  carrier: string | null;
  homeownerName: string | null;
  propertyLocation: string | null;
  status: string | null;
  dateOfLoss: string | null;
}

interface MatchSuggestionsResponse {
  candidates: MatchCandidate[];
  bestScore: number;
  confidenceLabel: string;
  masked: boolean;
}

// ─── Extraction field sections (for ExtractionReviewDialog) ─────────────────
const EXTRACTION_SECTIONS = [
  {
    title: "Claim Identifiers",
    fields: [
      { key: "claimNumber", label: "Claim Number" },
      { key: "policyNumber", label: "Policy Number" },
    ],
  },
  {
    title: "People & Organizations",
    fields: [
      { key: "homeownerName", label: "Homeowner Name" },
      { key: "insuredName", label: "Insured Name" },
      { key: "carrier", label: "Carrier" },
      { key: "adjusterName", label: "Adjuster Name" },
      { key: "adjusterEmail", label: "Adjuster Email" },
      { key: "adjusterPhone", label: "Adjuster Phone" },
      { key: "iaFirm", label: "IA Firm" },
      { key: "vendor", label: "Vendor / Engineer" },
    ],
  },
  {
    title: "Property Location",
    fields: [
      { key: "propertyAddress", label: "Property Address" },
      { key: "city", label: "City" },
      { key: "state", label: "State" },
      { key: "zipCode", label: "Zip Code" },
    ],
  },
  {
    title: "Key Dates",
    fields: [
      { key: "dateOfLoss", label: "Date of Loss" },
      { key: "inspectionDate", label: "Inspection Date" },
      { key: "estimateDate", label: "Estimate Date" },
      { key: "denialDate", label: "Denial Date" },
      { key: "approvalDate", label: "Approval Date" },
      { key: "paymentDate", label: "Payment Date" },
    ],
  },
  {
    title: "Financials",
    fields: [
      { key: "rcv", label: "RCV ($)" },
      { key: "acv", label: "ACV ($)" },
      { key: "deductible", label: "Deductible ($)" },
      { key: "recoverableDepreciation", label: "Recoverable Depreciation ($)" },
      { key: "supplementRequested", label: "Supplement Requested ($)" },
      { key: "supplementApproved", label: "Supplement Approved ($)" },
    ],
  },
  {
    title: "Outcomes",
    fields: [
      { key: "denialReason", label: "Denial Reason" },
      { key: "initialOutcome", label: "Initial Outcome" },
      { key: "finalOutcome", label: "Final Outcome" },
    ],
  },
];

// ─── ExtractionReviewDialog ──────────────────────────────────────────────────
function ExtractionReviewDialog({
  fileId,
  claimId,
  open,
  onClose,
}: {
  fileId: string | null;
  claimId: string | null | undefined;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [fields, setFields] = useState<Record<string, string>>({});
  const [initialized, setInitialized] = useState(false);

  const { data: file, isLoading: fileLoading } = useQuery<EvidenceFile>({
    queryKey: ["/api/evidence/files", fileId],
    queryFn: async () => {
      const token = (await import("@/lib/queryClient")).getAccessToken();
      const res = await fetch(`/api/evidence/files/${fileId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load file");
      return res.json();
    },
    enabled: !!fileId && open,
  });

  const extraction: ExtractionData | null =
    (file?.extractedJson as any)?.extraction ?? null;

  if (extraction && !initialized) {
    const init: Record<string, string> = {};
    for (const section of EXTRACTION_SECTIONS) {
      for (const f of section.fields) {
        const v = (extraction as any)[f.key];
        if (v != null && typeof v !== "boolean") init[f.key] = String(v);
      }
    }
    setFields(init);
    setInitialized(true);
  }

  const applyMutation = useMutation({
    mutationFn: async (acceptedFields: Record<string, string>) => {
      return apiRequest("POST", `/api/evidence/files/${fileId}/apply-extraction`, { fields: acceptedFields });
    },
    onSuccess: (data: any) => {
      const count = data?.fieldsApplied?.length ?? 0;
      toast({ title: "AI extraction applied", description: `${count} field${count !== 1 ? "s" : ""} updated on the claim` });
      queryClient.invalidateQueries({ queryKey: ["/api/claims"] });
      queryClient.invalidateQueries({ queryKey: ["/api/evidence/files"] });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to apply extraction", description: err.message, variant: "destructive" });
    },
  });

  const handleApply = () => {
    const nonempty: Record<string, string> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (v && v.trim()) nonempty[k] = v.trim();
    }
    applyMutation.mutate(nonempty);
  };

  const confidence = extraction?.confidence ?? 0;
  const confLabel = confidence >= 0.8 ? "High" : confidence >= 0.5 ? "Medium" : "Low";
  const confColor = confidence >= 0.8 ? "text-green-400" : confidence >= 0.5 ? "text-amber-400" : "text-red-400";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setInitialized(false); setFields({}); onClose(); } }}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" data-testid="text-extraction-dialog-title">
            <Brain className="w-5 h-5 text-primary" />
            AI Extraction Review
          </DialogTitle>
          <DialogDescription>
            Review and edit fields extracted by AI from your document. Clear any field you don't want applied, then click Apply to Claim.
          </DialogDescription>
        </DialogHeader>

        {fileLoading ? (
          <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : !extraction ? (
          <div className="py-10 text-center space-y-2">
            <Brain className="w-10 h-10 text-muted-foreground/30 mx-auto" />
            <p className="text-muted-foreground">No AI extraction data available for this file.</p>
            <p className="text-xs text-muted-foreground/70">AI extraction works for PDF, TXT, and EML documents with readable text content.</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center gap-3 rounded-md border border-border bg-muted/40 p-3">
              <Sparkles className="w-4 h-4 text-primary flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">AI Confidence: <span className={confColor}>{(confidence * 100).toFixed(0)}% — {confLabel}</span></p>
                <p className="text-xs text-muted-foreground">Edit any field before applying. Clear a field to exclude it.</p>
              </div>
              <div className="w-24 h-2 rounded-full bg-muted overflow-hidden flex-shrink-0">
                <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${confidence * 100}%` }} />
              </div>
            </div>

            {EXTRACTION_SECTIONS.map((section) => {
              const visible = section.fields.filter(f => (extraction as any)[f.key] != null);
              if (!visible.length) return null;
              return (
                <div key={section.title}>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">{section.title}</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {visible.map(f => (
                      <div key={f.key} className="space-y-1">
                        <label className="text-xs text-muted-foreground">{f.label}</label>
                        <Input
                          value={fields[f.key] ?? ""}
                          onChange={e => setFields(p => ({ ...p, [f.key]: e.target.value }))}
                          placeholder={String((extraction as any)[f.key])}
                          className="h-8 text-sm"
                          data-testid={`input-extraction-${f.key}`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {!!extraction.missingScopeItems?.length && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Missing Scope Items (informational)</h4>
                <ul className="space-y-1">
                  {extraction.missingScopeItems.map((item, i) => (
                    <li key={i} className="text-sm flex items-start gap-2 text-muted-foreground" data-testid={`text-scope-item-${i}`}>
                      <span className="text-primary mt-0.5">•</span>{item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!!extraction.escalationReferences?.length && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Escalation References (informational)</h4>
                <ul className="space-y-1">
                  {extraction.escalationReferences.map((item, i) => (
                    <li key={i} className="text-sm flex items-start gap-2 text-amber-400/80" data-testid={`text-escalation-ref-${i}`}>
                      <span className="mt-0.5">⚠</span>{item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-between gap-2 pt-4 border-t border-border">
          <Button variant="ghost" onClick={onClose} data-testid="button-extraction-skip">Skip</Button>
          <Button
            disabled={!extraction || !claimId || applyMutation.isPending || fileLoading}
            onClick={handleApply}
            data-testid="button-extraction-apply"
          >
            {applyMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCheck className="w-4 h-4" />}
            Apply to Claim
          </Button>
        </div>
        {!claimId && extraction && (
          <p className="text-xs text-amber-400 text-center">Match this file to a claim first before applying extraction fields.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── DuplicateFileCard ───────────────────────────────────────────────────────
function DuplicateFileCard({
  result,
  claims,
  onOpenFile,
  onMatchExisting,
  onDismiss,
}: {
  result: DuplicateResult;
  claims: Claim[] | undefined;
  onOpenFile: (file: EvidenceFile) => void;
  onMatchExisting: (fileId: string) => void;
  onDismiss: () => void;
}) {
  const f = result.existingFile;
  const matchedClaim = claims?.find(c => c.id === f.claimId);
  const status = f.claimId ? "Matched to Claim" : f.extractionStatus === "complete" ? "Extraction Complete" : "Unmatched";

  return (
    <Card className="border-amber-500/40 bg-amber-500/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2 text-amber-400">
          <Copy className="w-4 h-4" />
          Duplicate Document Detected
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          This document already exists in your evidence library. The file shown below is the original.
        </p>
        <div className="rounded-md border border-border bg-muted/30 p-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">File Name</p>
            <p className="font-medium truncate" data-testid="text-dup-filename">{f.fileName}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Upload Date</p>
            <p data-testid="text-dup-uploaded">{fmtDate(f.uploadedAt)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Matched Claim</p>
            <p data-testid="text-dup-claim">
              {matchedClaim ? (matchedClaim.claimNumber || "Matched") : <span className="text-muted-foreground">—</span>}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Status</p>
            <Badge variant="outline" className="text-xs" data-testid="badge-dup-status">{status}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" variant="outline" onClick={() => onOpenFile(f)} data-testid="button-dup-open">
            <FolderOpen className="w-4 h-4" />
            Open Existing File
          </Button>
          {!f.claimId && (
            <Button size="sm" variant="outline" onClick={() => onMatchExisting(f.id)} data-testid="button-dup-match">
              <LinkIcon className="w-4 h-4" />
              Match to Claim
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onDismiss} data-testid="button-dup-dismiss">
            Dismiss
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── FileStatusBadge ─────────────────────────────────────────────────────────
function FileStatusBadge({ file }: { file: EvidenceFile }) {
  if (file.claimId) {
    return <Badge variant="default" className="text-xs">Matched</Badge>;
  }
  if (file.extractionStatus === "complete") {
    return <Badge variant="secondary" className="text-xs">Extraction Complete</Badge>;
  }
  if (file.extractionStatus === "failed") {
    return <Badge variant="destructive" className="text-xs">Extraction Failed</Badge>;
  }
  if (file.extractionStatus === "processing") {
    return <Badge variant="outline" className="text-xs">Processing</Badge>;
  }
  return <Badge variant="outline" className="text-xs">Unmatched</Badge>;
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function EvidencePage() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [duplicateResult, setDuplicateResult] = useState<DuplicateResult | null>(null);
  const [activeTab, setActiveTab] = useState("files");

  // File detail panel
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);

  // Match dialog
  const [matchDialogOpen, setMatchDialogOpen] = useState(false);
  const [matchingFileId, setMatchingFileId] = useState<string | null>(null);
  const [matchingFileExtraction, setMatchingFileExtraction] = useState<ExtractionData | null>(null);
  const [selectedClaimId, setSelectedClaimId] = useState<string>("");
  const [claimSearch, setClaimSearch] = useState("");

  // Pre-select claim
  const [preSelectClaimId, setPreSelectClaimId] = useState<string>("");

  // Extraction review
  const [extractionReviewFileId, setExtractionReviewFileId] = useState<string | null>(null);
  const [extractionReviewClaimId, setExtractionReviewClaimId] = useState<string | null>(null);
  const [extractionReviewOpen, setExtractionReviewOpen] = useState(false);

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: evidenceFiles, isLoading: filesLoading } = useQuery<
    (EvidenceFile & { entities?: ExtractedEntity[] })[]
  >({ queryKey: ["/api/evidence/files"] });

  const { data: claims } = useQuery<Claim[]>({ queryKey: ["/api/claims"] });

  const { data: drafts, isLoading: draftsLoading } = useQuery<ClaimDraft[]>({
    queryKey: ["/api/evidence/drafts"],
  });

  const { data: unmatchedFiles, isLoading: unmatchedLoading } = useQuery<EvidenceFile[]>({
    queryKey: ["/api/evidence/files-unmatched"],
  });

  const { data: matchSuggestions, isLoading: suggestionsLoading } =
    useQuery<MatchSuggestionsResponse>({
      queryKey: ["/api/evidence/files", matchingFileId, "match-suggestions"],
      queryFn: async () => {
        const res = await fetch(`/api/evidence/files/${matchingFileId}/match-suggestions`, {
          headers: getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {},
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to load match suggestions");
        return res.json();
      },
      enabled: !!matchingFileId && matchDialogOpen,
    });

  const selectedFile = evidenceFiles?.find(f => f.id === selectedFileId);
  const claimsById = new Map(claims?.map(c => [c.id, c]) ?? []);

  // ── Mutations ──────────────────────────────────────────────────────────────
  const matchMutation = useMutation({
    mutationFn: async ({ fileId, claimId }: { fileId: string; claimId: string }) => {
      await apiRequest("POST", `/api/evidence/files/${fileId}/match`, { claimId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/evidence/files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/evidence/files-unmatched"] });
      queryClient.invalidateQueries({ queryKey: ["/api/evidence/drafts"] });
      toast({ title: "File matched to claim successfully" });
      setMatchDialogOpen(false);
      setSelectedClaimId("");
      setMatchingFileId(null);
      setMatchingFileExtraction(null);
    },
    onError: (err: Error) => {
      toast({ title: "Match failed", description: err.message, variant: "destructive" });
    },
  });

  const createClaimMutation = useMutation({
    mutationFn: async (fileId: string) => apiRequest("POST", `/api/evidence/files/${fileId}/create-claim`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/evidence/files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/evidence/files-unmatched"] });
      queryClient.invalidateQueries({ queryKey: ["/api/evidence/drafts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/claims"] });
      toast({ title: "New claim created from extracted data" });
      setMatchDialogOpen(false);
    },
    onError: (err: Error) => {
      toast({ title: "Create claim failed", description: err.message, variant: "destructive" });
    },
  });

  const unmatchMutation = useMutation({
    mutationFn: async (fileId: string) => apiRequest("POST", `/api/evidence/files/${fileId}/unmatch`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/evidence/files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/evidence/files-unmatched"] });
      queryClient.invalidateQueries({ queryKey: ["/api/evidence/drafts"] });
      toast({ title: "Saved as unmatched evidence" });
      setMatchDialogOpen(false);
    },
    onError: (err: Error) => {
      toast({ title: "Action failed", description: err.message, variant: "destructive" });
    },
  });

  const archiveDraftMutation = useMutation({
    mutationFn: async (draftId: string) => apiRequest("POST", `/api/evidence/drafts/${draftId}/archive`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/evidence/drafts"] });
      toast({ title: "Draft archived" });
    },
    onError: (err: Error) => {
      toast({ title: "Archive failed", description: err.message, variant: "destructive" });
    },
  });

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleUpload = useCallback(async (file: File) => {
    setIsUploading(true);
    setUploadResult(null);
    setDuplicateResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (preSelectClaimId && preSelectClaimId !== "none")
        formData.append("claimId", preSelectClaimId);

      const token = getAccessToken();
      const res = await fetch("/api/evidence/upload", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
        credentials: "include",
      });

      if (res.status === 409) {
        // Duplicate file — handle gracefully, not as an error
        const body = await res.json();
        if (body.duplicate && body.existingFile) {
          setDuplicateResult({ message: body.message, existingFile: body.existingFile });
          queryClient.invalidateQueries({ queryKey: ["/api/evidence/files"] });
          return;
        }
      }

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || res.statusText);
      }

      const result: UploadResult = await res.json();
      setUploadResult(result);
      queryClient.invalidateQueries({ queryKey: ["/api/evidence/files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/evidence/drafts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/evidence/files-unmatched"] });
      toast({ title: "File uploaded successfully" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  }, [preSelectClaimId, toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) handleUpload(files[0]);
  }, [handleUpload]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) handleUpload(files[0]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [handleUpload]);

  const openMatchDialog = useCallback((fileId: string, extraction?: ExtractionData | null) => {
    setMatchingFileId(fileId);
    setMatchingFileExtraction(extraction ?? null);
    setSelectedClaimId("");
    setClaimSearch("");
    setMatchDialogOpen(true);
  }, []);

  const openExtractionReview = useCallback((fileId: string, claimId?: string | null) => {
    setExtractionReviewFileId(fileId);
    setExtractionReviewClaimId(claimId ?? null);
    setExtractionReviewOpen(true);
  }, []);

  const openFileDetail = useCallback((fileId: string) => {
    setSelectedFileId(fileId);
    setActiveTab("files");
  }, []);

  // ── Match Dialog ───────────────────────────────────────────────────────────
  const top = matchSuggestions?.candidates?.[0];
  const bestScore = matchSuggestions?.bestScore ?? 0;
  const hasSuggestion = bestScore >= 0.4 && !!top;
  const noMatchFound = !suggestionsLoading && bestScore < 0.4;

  // Extracted clues from the file's LLM extraction (for match modal display)
  const extractionClues: Array<{ label: string; value: string }> = [];
  if (matchingFileExtraction) {
    const e = matchingFileExtraction;
    if (e.claimNumber) extractionClues.push({ label: "Claim #", value: e.claimNumber });
    if (e.homeownerName || e.insuredName) extractionClues.push({ label: "Homeowner", value: e.homeownerName || e.insuredName! });
    if (e.carrier) extractionClues.push({ label: "Carrier", value: e.carrier });
    if (e.propertyAddress) extractionClues.push({ label: "Address", value: e.propertyAddress });
    if (e.dateOfLoss) extractionClues.push({ label: "Date of Loss", value: e.dateOfLoss });
    if (e.adjusterName) extractionClues.push({ label: "Adjuster", value: e.adjusterName });
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-evidence-title">
          Evidence Files
        </h1>
        <p className="text-sm text-muted-foreground">
          Upload and manage source documents, claim drafts, and unmatched evidence.
        </p>
      </div>

      {/* Pre-select + Upload */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Pre-select claim:</label>
          <Select value={preSelectClaimId} onValueChange={setPreSelectClaimId}>
            <SelectTrigger className="w-[200px]" data-testid="select-preselect-claim">
              <SelectValue placeholder="None (auto-match)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None (auto-match)</SelectItem>
              {claims?.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.claimNumber}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardContent className="p-6">
          <div
            className={`border-2 border-dashed rounded-md p-12 text-center transition-colors ${
              isDragOver ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/50"
            }`}
            onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            data-testid="dropzone-upload"
          >
            {isUploading ? (
              <div className="flex flex-col items-center gap-3">
                <div className="relative">
                  <Loader2 className="w-10 h-10 animate-spin text-primary" />
                  <Brain className="w-4 h-4 text-primary absolute -bottom-1 -right-1" />
                </div>
                <p className="text-sm font-medium">AI is analyzing your document...</p>
                <p className="text-xs text-muted-foreground">Extracting claim fields, classifying document, matching claims</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <FileUp className="w-10 h-10 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Drag & drop files here</p>
                  <p className="text-xs text-muted-foreground mt-1">PDF, Images, DOCX, TXT, EML</p>
                </div>
                <Button variant="outline" onClick={() => fileInputRef.current?.click()} data-testid="button-browse-files">
                  <Upload className="w-4 h-4" />
                  Browse Files
                </Button>
                <input ref={fileInputRef} type="file" accept={ACCEPTED_TYPES} onChange={handleFileSelect} className="hidden" data-testid="input-file-upload" />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Duplicate Detection Card */}
      {duplicateResult && (
        <DuplicateFileCard
          result={duplicateResult}
          claims={claims}
          onOpenFile={f => { openFileDetail(f.id); setDuplicateResult(null); }}
          onMatchExisting={fileId => {
            const f = evidenceFiles?.find(x => x.id === fileId);
            const ext = (f?.extractedJson as any)?.extraction ?? null;
            openMatchDialog(fileId, ext);
            setDuplicateResult(null);
          }}
          onDismiss={() => setDuplicateResult(null)}
        />
      )}

      {/* Upload Success Result */}
      {uploadResult && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              Upload Complete
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Classification</p>
                <div className="flex items-center gap-2">
                  <Badge variant={(categoryColors[uploadResult.file.docCategory || "unknown"] as any) || "outline"} data-testid="badge-upload-category">
                    {fmt(uploadResult.file.docCategory || "unknown")}
                  </Badge>
                  {uploadResult.file.confidence != null && (
                    <span className="text-xs text-muted-foreground" data-testid="text-upload-confidence">
                      {(uploadResult.file.confidence * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Claim Match</p>
                {uploadResult.matchedClaimId ? (
                  <div className="space-y-1">
                    <span className="text-sm font-mono block" data-testid="text-upload-claim-match">
                      {claimsById.get(uploadResult.matchedClaimId)?.claimNumber || uploadResult.matchedClaimId.slice(0, 8) + "…"}
                    </span>
                    {uploadResult.matchConfidence != null && (
                      <span className="text-xs text-muted-foreground" data-testid="text-upload-match-confidence">
                        Auto-matched · {Math.round(uploadResult.matchConfidence * 100)}% confidence
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" data-testid="badge-needs-review">
                      <AlertTriangle className="w-3 h-3 mr-1" />
                      {(uploadResult.matchConfidence ?? 0) >= 0.4 ? "Match needs review" : "No matching claim found"}
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openMatchDialog(uploadResult.file.id, uploadResult.extraction)}
                      data-testid="button-upload-match"
                    >
                      <LinkIcon className="w-4 h-4" />
                      Match to Claim
                    </Button>
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">
                  {uploadResult.draft ? "Claim Draft Created" : "Draft Status"}
                </p>
                {uploadResult.draft ? (
                  <Badge variant="secondary" className="text-xs" data-testid="badge-draft-created">
                    Draft #{uploadResult.draft.id.slice(0, 8)}
                  </Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">No claim indicators found — file saved as evidence</span>
                )}
              </div>
            </div>

            {uploadResult.extraction && (
              <div className="flex items-center gap-3 rounded-md border border-primary/30 bg-primary/5 p-3">
                <Sparkles className="w-4 h-4 text-primary flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">
                    AI extracted {Object.keys(uploadResult.extraction).filter(
                      k => !["confidence","extractionMethod","documentType","missingScopeItems","codeItems","reinspectionReferences","escalationReferences","timelineEvents","denialOverturned"].includes(k) &&
                        (uploadResult.extraction as any)[k] != null
                    ).length} claim fields
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Confidence: {((uploadResult.extraction.confidence || 0) * 100).toFixed(0)}% — review before applying
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => openExtractionReview(uploadResult.file.id, uploadResult.matchedClaimId)}
                  data-testid="button-review-extraction-upload"
                >
                  <Brain className="w-4 h-4" />
                  Review & Apply
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Three-tab main content ─────────────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="files" data-testid="tab-evidence-files">
            Evidence Files
            {!!evidenceFiles?.length && (
              <Badge variant="secondary" className="ml-2 text-xs">{evidenceFiles.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="drafts" data-testid="tab-claim-drafts">
            Claim Drafts
            {!!drafts?.filter(d => d.status === "needs_review").length && (
              <Badge variant="outline" className="ml-2 text-xs">
                {drafts.filter(d => d.status === "needs_review").length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="unmatched" data-testid="tab-unmatched">
            Unmatched Evidence
            {!!unmatchedFiles?.length && (
              <Badge variant="outline" className="ml-2 text-xs">{unmatchedFiles.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Evidence Files Tab ──────────────────────────────────────────── */}
        <TabsContent value="files" className="space-y-4 mt-4">
          <p className="text-sm text-muted-foreground">Uploaded evidence and source documents.</p>

          <Card>
            <CardContent className="p-0">
              {filesLoading ? (
                <div className="p-6 space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : !evidenceFiles?.length ? (
                <div className="p-12 text-center">
                  <FileText className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                  <p className="text-muted-foreground font-medium">No evidence files yet</p>
                  <p className="text-sm text-muted-foreground/70">Upload your first document above</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>File Name</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Matched Claim</TableHead>
                        <TableHead>Uploaded</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {evidenceFiles.map(file => (
                        <TableRow
                          key={file.id}
                          className="hover-elevate cursor-pointer"
                          onClick={() => setSelectedFileId(selectedFileId === file.id ? null : file.id)}
                          data-testid={`row-evidence-${file.id}`}
                        >
                          <TableCell className="font-medium text-sm max-w-[220px]" data-testid={`text-filename-${file.id}`}>
                            <div className="flex items-center gap-2 truncate">
                              <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                              <span className="truncate">{file.fileName}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground uppercase" data-testid={`text-filetype-${file.id}`}>
                            {file.fileType || "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant={(categoryColors[file.docCategory || "unknown"] as any) || "outline"} className="text-xs" data-testid={`badge-category-${file.id}`}>
                              {fmt(file.docCategory || "unknown")}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <FileStatusBadge file={file} />
                          </TableCell>
                          <TableCell className="text-sm" data-testid={`text-claim-match-${file.id}`}>
                            {file.claimId ? (
                              <Link
                                href={`/claims/${file.claimId}`}
                                onClick={(e) => e.stopPropagation()}
                                className="font-mono text-xs text-primary hover:underline"
                                data-testid={`link-claim-${file.id}`}
                              >
                                {claimsById.get(file.claimId)?.claimNumber || file.claimId.slice(0, 8) + "…"}
                              </Link>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground" data-testid={`text-uploaded-${file.id}`}>
                            {fmtDate(file.uploadedAt)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* File Detail Panel */}
          {selectedFile && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle className="text-base">File Details</CardTitle>
                <Button size="icon" variant="ghost" onClick={() => setSelectedFileId(null)} data-testid="button-close-detail">
                  <X className="w-4 h-4" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Name</p>
                    <p className="text-sm font-medium truncate" data-testid="text-detail-name">{selectedFile.fileName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Type</p>
                    <p className="text-sm uppercase" data-testid="text-detail-type">{selectedFile.fileType || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Size</p>
                    <p className="text-sm" data-testid="text-detail-size">{fmtFileSize(selectedFile.fileSize)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">SHA-256</p>
                    <p className="text-xs font-mono truncate" title={selectedFile.sha256 || ""} data-testid="text-detail-sha256">
                      {selectedFile.sha256 ? selectedFile.sha256.slice(0, 16) + "…" : "—"}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Category</p>
                    <Badge variant={(categoryColors[selectedFile.docCategory || "unknown"] as any) || "outline"} className="mt-1" data-testid="badge-detail-category">
                      {fmt(selectedFile.docCategory || "unknown")}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Status</p>
                    <div className="mt-1"><FileStatusBadge file={selectedFile} /></div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Matched Claim</p>
                    <p className="text-sm mt-1" data-testid="text-detail-claim">
                      {selectedFile.claimId ? (
                        <Link
                          href={`/claims/${selectedFile.claimId}`}
                          className="text-primary hover:underline font-medium"
                          data-testid="link-detail-claim"
                        >
                          {claimsById.get(selectedFile.claimId)?.claimNumber || selectedFile.claimId.slice(0, 8) + "…"}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </p>
                  </div>
                </div>

                {/* AI extraction banner */}
                {(() => {
                  const ext = (selectedFile.extractedJson as any)?.extraction as ExtractionData | null;
                  return ext ? (
                    <div className="flex items-center gap-3 rounded-md border border-primary/30 bg-primary/5 p-3">
                      <Brain className="w-4 h-4 text-primary flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">AI extraction available</p>
                        <p className="text-xs text-muted-foreground">
                          {(ext.confidence * 100).toFixed(0)}% confidence
                          {selectedFile.claimId ? " · Click to review and apply to claim" : " · Match to a claim first"}
                        </p>
                      </div>
                      <Button size="sm" onClick={() => openExtractionReview(selectedFile.id, selectedFile.claimId)} data-testid="button-review-extraction-detail">
                        <Brain className="w-3 h-3" />
                        Review
                      </Button>
                    </div>
                  ) : null;
                })()}

                {!selectedFile.claimId && (
                  <div className="pt-2 flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        const ext = (selectedFile.extractedJson as any)?.extraction ?? null;
                        openMatchDialog(selectedFile.id, ext);
                      }}
                      data-testid="button-match-claim"
                    >
                      <LinkIcon className="w-4 h-4" />
                      Match to Claim
                    </Button>
                    <Button
                      variant="outline"
                      disabled={createClaimMutation.isPending}
                      onClick={() => createClaimMutation.mutate(selectedFile.id)}
                      data-testid="button-create-claim-from-file"
                    >
                      {createClaimMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                      Create Claim from File
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={unmatchMutation.isPending}
                      onClick={() => unmatchMutation.mutate(selectedFile.id)}
                      data-testid="button-leave-unmatched"
                    >
                      {unmatchMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                      Save as Unmatched
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Claim Drafts Tab ────────────────────────────────────────────── */}
        <TabsContent value="drafts" className="space-y-4 mt-4">
          <p className="text-sm text-muted-foreground">
            Potential claims created from extracted document data. Review, create, or archive each draft.
          </p>

          {draftsLoading ? (
            <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
          ) : !drafts?.filter(d => d.status === "needs_review").length ? (
            <Card>
              <CardContent className="p-12 text-center">
                <FileText className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                <p className="text-muted-foreground font-medium">No claim drafts pending review</p>
                <p className="text-sm text-muted-foreground/70 mt-1">
                  Drafts are created automatically when uploaded documents contain claim indicators.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {drafts!.filter(d => d.status === "needs_review").map(draft => {
                const sourceFile = evidenceFiles?.find(f => f.id === draft.createdFromEvidenceFileId);
                const conf = (draft as any).extractionConfidence as number | null;
                const confLabel = conf == null ? null : conf >= 0.8 ? "High" : conf >= 0.5 ? "Medium" : "Low";
                const confVariant = conf == null ? "outline" : conf >= 0.8 ? "default" : conf >= 0.5 ? "secondary" : "destructive";

                return (
                  <Card key={draft.id} data-testid={`card-draft-${draft.id}`}>
                    <CardContent className="p-4 space-y-3">
                      {/* Draft header */}
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div>
                          <p className="text-xs text-muted-foreground mb-0.5">Draft ID</p>
                          <p className="text-sm font-mono text-muted-foreground">{draft.id.slice(0, 8)}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {confLabel && (
                            <Badge variant={confVariant as any} className="text-xs" data-testid={`badge-draft-conf-${draft.id}`}>
                              {(conf! * 100).toFixed(0)}% — {confLabel} Confidence
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-xs capitalize" data-testid={`badge-draft-status-${draft.id}`}>
                            {draft.status?.replace("_", " ") || "Needs Review"}
                          </Badge>
                        </div>
                      </div>

                      {/* Source file */}
                      {((draft as any).sourceFileName || sourceFile) && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-0.5">Source File</p>
                          <p className="text-sm truncate" data-testid={`text-draft-source-${draft.id}`}>
                            {(draft as any).sourceFileName || sourceFile?.fileName}
                          </p>
                        </div>
                      )}

                      {/* Extracted fields grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                        {draft.extractedClaimNumber && (
                          <div className="rounded bg-muted/40 px-2 py-1.5">
                            <p className="text-muted-foreground/70 mb-0.5">Claim #</p>
                            <p className="font-medium" data-testid={`text-draft-claim-number-${draft.id}`}>{draft.extractedClaimNumber}</p>
                          </div>
                        )}
                        {draft.extractedInsured && (
                          <div className="rounded bg-muted/40 px-2 py-1.5">
                            <p className="text-muted-foreground/70 mb-0.5">Homeowner</p>
                            <p className="font-medium" data-testid={`text-draft-insured-${draft.id}`}>{draft.extractedInsured}</p>
                          </div>
                        )}
                        {draft.extractedCarrier && (
                          <div className="rounded bg-muted/40 px-2 py-1.5">
                            <p className="text-muted-foreground/70 mb-0.5">Carrier</p>
                            <p className="font-medium" data-testid={`text-draft-carrier-${draft.id}`}>{draft.extractedCarrier}</p>
                          </div>
                        )}
                        {(draft as any).extractedAdjuster && (
                          <div className="rounded bg-muted/40 px-2 py-1.5">
                            <p className="text-muted-foreground/70 mb-0.5">Adjuster</p>
                            <p className="font-medium" data-testid={`text-draft-adjuster-${draft.id}`}>{(draft as any).extractedAdjuster}</p>
                          </div>
                        )}
                        {draft.extractedAddress && (
                          <div className="rounded bg-muted/40 px-2 py-1.5">
                            <p className="text-muted-foreground/70 mb-0.5">Address</p>
                            <p className="font-medium" data-testid={`text-draft-address-${draft.id}`}>{draft.extractedAddress}</p>
                          </div>
                        )}
                        {draft.extractedDateOfLoss && (
                          <div className="rounded bg-muted/40 px-2 py-1.5">
                            <p className="text-muted-foreground/70 mb-0.5">Date of Loss</p>
                            <p className="font-medium" data-testid={`text-draft-dol-${draft.id}`}>{fmtDate(draft.extractedDateOfLoss)}</p>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex flex-wrap gap-2 pt-1 border-t border-border">
                        {draft.createdFromEvidenceFileId && (
                          <>
                            <Button
                              size="sm"
                              variant="default"
                              disabled={createClaimMutation.isPending}
                              onClick={() => createClaimMutation.mutate(draft.createdFromEvidenceFileId!)}
                              data-testid={`button-draft-create-claim-${draft.id}`}
                            >
                              {createClaimMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <PlusCircle className="w-3 h-3" />}
                              Create New Claim
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                const ext = (sourceFile?.extractedJson as any)?.extraction ?? null;
                                openMatchDialog(draft.createdFromEvidenceFileId!, ext);
                              }}
                              data-testid={`button-draft-match-${draft.id}`}
                            >
                              <LinkIcon className="w-3 h-3" />
                              Match to Existing Claim
                            </Button>
                            {sourceFile && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openExtractionReview(draft.createdFromEvidenceFileId!, sourceFile.claimId)}
                                data-testid={`button-draft-review-${draft.id}`}
                              >
                                <Brain className="w-3 h-3" />
                                Review Extraction
                              </Button>
                            )}
                          </>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={archiveDraftMutation.isPending}
                          onClick={() => archiveDraftMutation.mutate(draft.id)}
                          data-testid={`button-draft-archive-${draft.id}`}
                        >
                          {archiveDraftMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Archive className="w-3 h-3" />}
                          Archive Draft
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── Unmatched Evidence Tab ──────────────────────────────────────── */}
        <TabsContent value="unmatched" className="space-y-4 mt-4">
          <p className="text-sm text-muted-foreground">
            Uploaded files not yet linked to a claim. Match, create a claim, or keep as evidence.
          </p>

          {unmatchedLoading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : !unmatchedFiles?.length ? (
            <Card>
              <CardContent className="p-12 text-center">
                <CheckCircle className="w-12 h-12 text-green-500/30 mx-auto mb-4" />
                <p className="text-muted-foreground font-medium">All files are matched</p>
                <p className="text-sm text-muted-foreground/70 mt-1">Every uploaded document is linked to a claim.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {unmatchedFiles.map(f => {
                const ext = (f.extractedJson as any)?.extraction as ExtractionData | null;
                return (
                  <Card key={f.id} data-testid={`card-unmatched-${f.id}`}>
                    <CardContent className="p-3 flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate" data-testid={`text-unmatched-name-${f.id}`}>{f.fileName}</p>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className="text-xs text-muted-foreground capitalize">
                              {(f.docCategory || "unknown").replace(/_/g, " ")}
                            </span>
                            <span className="text-xs text-muted-foreground">·</span>
                            <span className="text-xs text-muted-foreground">{fmtDate(f.uploadedAt)}</span>
                            {f.extractionStatus === "complete" && (
                              <Badge variant="secondary" className="text-xs">AI extracted</Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openMatchDialog(f.id, ext)}
                          data-testid={`button-match-unmatched-${f.id}`}
                        >
                          <LinkIcon className="w-4 h-4" />
                          Match to Claim
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={createClaimMutation.isPending}
                          onClick={() => createClaimMutation.mutate(f.id)}
                          data-testid={`button-create-from-unmatched-${f.id}`}
                        >
                          <PlusCircle className="w-4 h-4" />
                          Create Claim
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Match to Claim Dialog ────────────────────────────────────────── */}
      <Dialog open={matchDialogOpen} onOpenChange={v => { if (!v) { setMatchDialogOpen(false); setMatchingFileId(null); setMatchingFileExtraction(null); } }}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Match to Claim</DialogTitle>
            <DialogDescription>Link this file or draft to an existing claim.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Extracted clues panel */}
            {extractionClues.length > 0 && (
              <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Brain className="w-4 h-4 text-primary flex-shrink-0" />
                  <p className="text-sm font-medium">Extracted clues from this file</p>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  {extractionClues.map(({ label, value }) => (
                    <div key={label} data-testid={`text-match-clue-${label.replace(/\s+/g, "-").toLowerCase()}`}>
                      <span className="text-muted-foreground">{label}: </span>
                      <span className="font-medium">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Match suggestions */}
            {suggestionsLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : hasSuggestion && top ? (
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2" data-testid="panel-match-summary">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-primary" data-testid="text-match-summary">Suggested match found</p>
                  <Badge variant="outline" className="text-xs">{Math.round(top.score * 100)}% match</Badge>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  {top.claimNumber && <div><span className="text-muted-foreground">Claim #: </span><span className="font-medium" data-testid="text-suggested-claim-number">{top.claimNumber}</span></div>}
                  {top.carrier && <div><span className="text-muted-foreground">Carrier: </span><span className="font-medium">{top.carrier}</span></div>}
                  {top.homeownerName && <div><span className="text-muted-foreground">Homeowner: </span><span className="font-medium">{top.homeownerName}</span></div>}
                  {top.propertyLocation && <div><span className="text-muted-foreground">Location: </span><span className="font-medium">{top.propertyLocation}</span></div>}
                  {top.status && <div><span className="text-muted-foreground">Status: </span><span className="capitalize">{top.status.replace(/_/g, " ")}</span></div>}
                  {top.dateOfLoss && <div><span className="text-muted-foreground">DOL: </span><span>{fmtDate(top.dateOfLoss)}</span></div>}
                </div>
                {!!top.reasons?.length && (
                  <p className="text-xs text-muted-foreground/80">Why: {top.reasons.join(" · ")}</p>
                )}
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setSelectedClaimId(top.claimId)}
                  data-testid="button-use-suggested"
                >
                  Use this match
                </Button>
              </div>
            ) : noMatchFound ? (
              <div className="rounded-md border border-border bg-muted/30 p-3" data-testid="panel-no-match">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-muted-foreground">
                    No matching claim found from extracted data. Create a new claim, save as unmatched evidence, or manually search existing claims below.
                  </p>
                </div>
              </div>
            ) : null}

            {/* Quick action buttons when no match or to override */}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={createClaimMutation.isPending || !matchingFileId}
                onClick={() => matchingFileId && createClaimMutation.mutate(matchingFileId)}
                data-testid="button-match-create-claim"
              >
                {createClaimMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <PlusCircle className="w-3 h-3" />}
                Create New Claim From Extraction
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={unmatchMutation.isPending || !matchingFileId}
                onClick={() => matchingFileId && unmatchMutation.mutate(matchingFileId)}
                data-testid="button-match-save-unmatched"
              >
                {unmatchMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Archive className="w-3 h-3" />}
                Save as Unmatched Evidence
              </Button>
            </div>

            {/* Manual search */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Search Existing Claims</p>
              <Input
                placeholder="Search by claim #, carrier, homeowner, location…"
                value={claimSearch}
                onChange={e => setClaimSearch(e.target.value)}
                data-testid="input-claim-search"
              />
              <div className="max-h-52 overflow-y-auto rounded-md border border-border divide-y divide-border">
                {(() => {
                  const q = claimSearch.trim().toLowerCase();
                  const filtered = (claims || []).filter(c => {
                    if (!q) return true;
                    return [c.claimNumber, c.carrier, c.homeownerName, c.insuredName, c.propertyAddress, c.city, c.state, c.status]
                      .filter(Boolean).some(v => String(v).toLowerCase().includes(q));
                  });
                  if (!filtered.length) {
                    return <p className="text-sm text-muted-foreground py-6 text-center">No claims match your search.</p>;
                  }
                  return filtered.map(c => {
                    const loc = [c.city, c.state].filter(Boolean).join(", ");
                    return (
                      <button
                        key={c.id}
                        className={`w-full text-left px-3 py-2.5 text-sm hover:bg-muted/50 transition-colors ${
                          selectedClaimId === c.id ? "bg-primary/10 border-l-2 border-primary" : ""
                        }`}
                        onClick={() => setSelectedClaimId(c.id)}
                        data-testid={`button-select-claim-${c.id}`}
                      >
                        <div className="font-medium">{c.claimNumber || "—"}</div>
                        <div className="text-xs text-muted-foreground">
                          {[c.carrier, c.homeownerName || c.insuredName, loc].filter(Boolean).join(" · ")}
                        </div>
                      </button>
                    );
                  });
                })()}
              </div>
            </div>

            <div className="flex justify-between gap-2 pt-2 border-t border-border">
              <Button
                variant="ghost"
                onClick={() => { setMatchDialogOpen(false); setMatchingFileId(null); setMatchingFileExtraction(null); }}
                data-testid="button-match-cancel"
              >
                Cancel
              </Button>
              <Button
                disabled={!selectedClaimId || matchMutation.isPending}
                onClick={() => matchingFileId && matchMutation.mutate({ fileId: matchingFileId, claimId: selectedClaimId })}
                data-testid="button-match-confirm"
              >
                {matchMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Confirm Match
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Extraction Review Dialog ─────────────────────────────────────── */}
      <ExtractionReviewDialog
        fileId={extractionReviewFileId}
        claimId={extractionReviewClaimId}
        open={extractionReviewOpen}
        onClose={() => { setExtractionReviewOpen(false); setExtractionReviewFileId(null); setExtractionReviewClaimId(null); }}
      />
    </div>
  );
}

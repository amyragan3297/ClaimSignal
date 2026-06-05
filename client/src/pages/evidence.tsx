import { useState, useCallback, useRef, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient, getAccessToken } from "@/lib/queryClient";
import type { EvidenceFile, ExtractedEntity, Claim } from "@shared/schema";
import {
  Upload,
  FileUp,
  FileText,
  FileImage,
  File,
  CheckCircle,
  AlertTriangle,
  X,
  Loader2,
  Link as LinkIcon,
  Brain,
  Sparkles,
  CheckCheck,
  Copy,
  PlusCircle,
  AlertCircle,
  Search,
  Filter,
} from "lucide-react";

const ACCEPTED_TYPES = ".pdf,.jpg,.jpeg,.png,.gif,.bmp,.tiff,.docx,.txt,.eml";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

const categoryColors: Record<string, BadgeVariant> = {
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

function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString();
}

function fmtFileSize(bytes: number | null | undefined): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getExtraction(file: EvidenceFile): ExtractionData | null {
  return (file.extractedJson as { extraction?: ExtractionData } | null)?.extraction ?? null;
}

function FileTypeIcon({ fileType }: { fileType: string | null | undefined }) {
  if (fileType === "image") return <FileImage className="w-5 h-5 text-blue-400 flex-shrink-0" />;
  if (fileType === "pdf") return <FileText className="w-5 h-5 text-red-400 flex-shrink-0" />;
  return <File className="w-5 h-5 text-muted-foreground flex-shrink-0" />;
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
  extractionError?: string | null;
  matchedClaimId: string | null;
  autoMatched?: boolean;
  matchConfidence?: number;
  matchConfidenceLabel?: string;
  matchReasons?: string[];
  createdClaim?: { id: string; claimNumber: string } | null;
  autoAppliedFields?: string[];
  adjusterAutoLinked?: boolean;
  adjusterName?: string | null;
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

interface ApplyExtractionResult {
  fieldsApplied: string[];
}

interface QueueItem {
  queueId: string;
  fileName: string;
  status: "queued" | "uploading" | "matched" | "needs-review" | "duplicate" | "created-claim" | "error";
  result?: UploadResult;
  duplicate?: DuplicateResult;
  errorMsg?: string;
}

// ─── Simplified Extraction Review Dialog ──────────────────────────────────────
const KEY_INFO_FIELDS = [
  { key: "claimNumber", label: "Claim Number" },
  { key: "policyNumber", label: "Policy Number" },
  { key: "homeownerName", label: "Homeowner Name" },
  { key: "carrier", label: "Carrier" },
  { key: "adjusterName", label: "Adjuster Name" },
  { key: "propertyAddress", label: "Property Address" },
  { key: "dateOfLoss", label: "Date of Loss" },
];

const FINANCIALS_FIELDS = [
  { key: "rcv", label: "RCV" },
  { key: "acv", label: "ACV" },
  { key: "deductible", label: "Deductible" },
  { key: "supplementRequested", label: "Supplement Requested" },
  { key: "supplementApproved", label: "Supplement Approved" },
];

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
  const [checkedFields, setCheckedFields] = useState<Set<string>>(new Set());
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});
  const [initialized, setInitialized] = useState(false);

  const { data: file, isLoading: fileLoading } = useQuery<EvidenceFile>({
    queryKey: ["/api/evidence/files", fileId],
    queryFn: async () => {
      const token = getAccessToken();
      const res = await fetch(`/api/evidence/files/${fileId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load file");
      return res.json();
    },
    enabled: !!fileId && open,
  });

  const extraction: ExtractionData | null = file ? getExtraction(file) : null;

  if (extraction && !initialized) {
    const allFields = [...KEY_INFO_FIELDS, ...FINANCIALS_FIELDS];
    const initChecked = new Set<string>();
    const initEdited: Record<string, string> = {};
    for (const f of allFields) {
      const v = extraction[f.key as keyof ExtractionData];
      if (v != null && typeof v !== "boolean" && !Array.isArray(v)) {
        initChecked.add(f.key);
        initEdited[f.key] = String(v);
      }
    }
    setCheckedFields(initChecked);
    setEditedValues(initEdited);
    setInitialized(true);
  }

  const applyMutation = useMutation({
    mutationFn: async (acceptedFields: Record<string, string>): Promise<ApplyExtractionResult> => {
      const res = await apiRequest("POST", `/api/evidence/files/${fileId}/apply-extraction`, { fields: acceptedFields });
      return res.json();
    },
    onSuccess: (data: ApplyExtractionResult) => {
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

  const handleClose = () => {
    setInitialized(false);
    setCheckedFields(new Set());
    setEditedValues({});
    onClose();
  };

  const handleApply = () => {
    const toApply: Record<string, string> = {};
    Array.from(checkedFields).forEach(key => {
      const v = editedValues[key];
      if (v && v.trim()) toApply[key] = v.trim();
    });
    applyMutation.mutate(toApply);
  };

  const toggleField = (key: string) => {
    setCheckedFields(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const confidence = extraction?.confidence ?? 0;
  const confColor = confidence >= 0.8 ? "text-green-400" : confidence >= 0.5 ? "text-amber-400" : "text-red-400";
  const confLabel = confidence >= 0.8 ? "High" : confidence >= 0.5 ? "Medium" : "Low";

  const renderSection = (title: string, fields: typeof KEY_INFO_FIELDS) => {
    if (!extraction) return null;
    const visible = fields.filter(f => {
      const v = extraction[f.key as keyof ExtractionData];
      return v != null && typeof v !== "boolean" && !Array.isArray(v);
    });
    if (!visible.length) return null;

    return (
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{title}</p>
        <div className="space-y-2">
          {visible.map(f => {
            const isChecked = checkedFields.has(f.key);
            return (
              <div key={f.key} className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleField(f.key)}
                  className="w-4 h-4 rounded border-border accent-primary cursor-pointer flex-shrink-0"
                  data-testid={`checkbox-extraction-${f.key}`}
                />
                <div className="flex-1 min-w-0 grid grid-cols-[120px_1fr] gap-2 items-center">
                  <span className="text-xs text-muted-foreground truncate">{f.label}</span>
                  <Input
                    value={editedValues[f.key] ?? ""}
                    onChange={e => setEditedValues(p => ({ ...p, [f.key]: e.target.value }))}
                    disabled={!isChecked}
                    className="h-7 text-xs disabled:opacity-40"
                    data-testid={`input-extraction-${f.key}`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const checkedCount = checkedFields.size;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-lg max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" data-testid="text-extraction-dialog-title">
            <Brain className="w-5 h-5 text-primary" />
            AI Extraction Review
          </DialogTitle>
          <DialogDescription>
            Check the fields you want to apply. Uncheck any you want to skip.
          </DialogDescription>
        </DialogHeader>

        {fileLoading ? (
          <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
        ) : !extraction ? (
          <div className="py-8 text-center space-y-2">
            <Brain className="w-8 h-8 text-muted-foreground/30 mx-auto" />
            <p className="text-sm text-muted-foreground">No AI extraction data available for this file.</p>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="text-sm">Confidence: <span className={confColor}>{(confidence * 100).toFixed(0)}% — {confLabel}</span></span>
              </div>
              <span className="text-xs text-muted-foreground">{checkedCount} field{checkedCount !== 1 ? "s" : ""} selected</span>
            </div>

            {renderSection("Key Info", KEY_INFO_FIELDS)}
            {renderSection("Financials", FINANCIALS_FIELDS)}

            {!claimId && (
              <p className="text-xs text-amber-400 text-center">Match this file to a claim first before applying fields.</p>
            )}
          </div>
        )}

        <div className="flex justify-between gap-2 pt-4 border-t border-border">
          <Button variant="ghost" size="sm" onClick={handleClose} data-testid="button-extraction-skip">Skip</Button>
          <Button
            disabled={!extraction || !claimId || checkedCount === 0 || applyMutation.isPending || fileLoading}
            onClick={handleApply}
            data-testid="button-extraction-apply"
          >
            {applyMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCheck className="w-4 h-4" />}
            Apply {checkedCount > 0 ? checkedCount : ""} Field{checkedCount !== 1 ? "s" : ""}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Upload Queue Strip ────────────────────────────────────────────────────────
function QueueItemRow({
  item,
  claimsById,
  onMatch,
  onViewDuplicate,
  onReviewExtraction,
  onCreateClaim,
}: {
  item: QueueItem;
  claimsById: Map<string, Claim>;
  onMatch: (fileId: string, extraction?: ExtractionData | null) => void;
  onViewDuplicate: (fileId: string) => void;
  onReviewExtraction: (fileId: string, claimId?: string | null) => void;
  onCreateClaim: (fileId: string) => void;
}) {
  const r = item.result;
  const matchedClaim = r?.matchedClaimId ? claimsById.get(r.matchedClaimId) : undefined;
  const claimLabel = matchedClaim?.claimNumber || (r?.matchedClaimId ? r.matchedClaimId.slice(0, 8) + "…" : "");

  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-md bg-muted/30 border border-border/50" data-testid={`queue-item-${item.queueId}`}>
      {item.status === "queued" && <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/30 flex-shrink-0" />}
      {item.status === "uploading" && <Loader2 className="w-4 h-4 animate-spin text-primary flex-shrink-0" />}
      {item.status === "matched" && <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />}
      {item.status === "created-claim" && <CheckCircle className="w-4 h-4 text-blue-500 flex-shrink-0" />}
      {item.status === "needs-review" && <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />}
      {item.status === "duplicate" && <Copy className="w-4 h-4 text-amber-500 flex-shrink-0" />}
      {item.status === "error" && <X className="w-4 h-4 text-destructive flex-shrink-0" />}

      <span className="text-sm truncate flex-1 min-w-0" data-testid={`queue-filename-${item.queueId}`}>{item.fileName}</span>

      <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
        {item.status === "uploading" && (
          <span className="text-xs text-muted-foreground">Analyzing…</span>
        )}
        {item.status === "matched" && (
          <span className="text-xs text-green-400">
            Matched to{" "}
            {r?.matchedClaimId ? (
              <Link href={`/claims/${r.matchedClaimId}`} className="font-medium hover:underline" data-testid={`queue-claim-link-${item.queueId}`}>
                {claimLabel}
              </Link>
            ) : "claim"}
          </span>
        )}
        {item.status === "created-claim" && r?.createdClaim && (
          <span className="text-xs text-blue-400">
            Claim created:{" "}
            <Link href={`/claims/${r.createdClaim.id}`} className="font-medium hover:underline">
              {r.createdClaim.claimNumber}
            </Link>
          </span>
        )}
        {item.status === "needs-review" && r && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-amber-400">No match found</span>
            <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={() => onMatch(r.file.id, r.extraction)} data-testid={`queue-match-btn-${item.queueId}`}>
              <LinkIcon className="w-3 h-3" />
              Match
            </Button>
            <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => onCreateClaim(r.file.id)} data-testid={`queue-create-btn-${item.queueId}`}>
              Create Claim
            </Button>
          </div>
        )}
        {item.status === "duplicate" && item.duplicate && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-amber-400">Already uploaded</span>
            <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => onViewDuplicate(item.duplicate!.existingFile.id)} data-testid={`queue-dup-view-${item.queueId}`}>
              View file
            </Button>
          </div>
        )}
        {item.status === "error" && (
          <span className="text-xs text-destructive">{item.errorMsg || "Upload failed"}</span>
        )}
        {(item.status === "matched" || item.status === "created-claim") && r?.extraction && !r.autoAppliedFields?.length && (
          <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => onReviewExtraction(r.file.id, r.matchedClaimId ?? r.createdClaim?.id)} data-testid={`queue-review-btn-${item.queueId}`}>
            <Brain className="w-3 h-3" />
            Review AI
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── File Card ────────────────────────────────────────────────────────────────
function FileCard({
  file,
  claimsById,
  onMatch,
  onReviewExtraction,
  onCreateClaim,
}: {
  file: EvidenceFile;
  claimsById: Map<string, Claim>;
  onMatch: (fileId: string, extraction?: ExtractionData | null) => void;
  onReviewExtraction: (fileId: string, claimId?: string | null) => void;
  onCreateClaim: (fileId: string) => void;
}) {
  const extraction = getExtraction(file);
  const matchedClaim = file.claimId ? claimsById.get(file.claimId) : undefined;

  const inlineFields: { label: string; value: string }[] = [];
  if (extraction) {
    if (extraction.claimNumber) inlineFields.push({ label: "Claim #", value: extraction.claimNumber });
    if (extraction.carrier) inlineFields.push({ label: "Carrier", value: extraction.carrier });
    if (extraction.adjusterName) inlineFields.push({ label: "Adjuster", value: extraction.adjusterName });
  }

  return (
    <Card className="flex flex-col hover:border-border/80 transition-colors" data-testid={`card-file-${file.id}`}>
      <CardContent className="p-4 flex flex-col gap-3 flex-1">
        <div className="flex items-start gap-3">
          <FileTypeIcon fileType={file.fileType} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium leading-snug truncate" data-testid={`text-filename-${file.id}`} title={file.fileName}>
              {file.fileName}
            </p>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <Badge variant={categoryColors[file.docCategory || "unknown"] || "outline"} className="text-xs" data-testid={`badge-category-${file.id}`}>
                {fmt(file.docCategory || "unknown")}
              </Badge>
              <span className="text-xs text-muted-foreground/60">·</span>
              <span className="text-xs text-muted-foreground">{fmtDate(file.uploadedAt)}</span>
              {file.fileSize && (
                <>
                  <span className="text-xs text-muted-foreground/60">·</span>
                  <span className="text-xs text-muted-foreground">{fmtFileSize(file.fileSize)}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {inlineFields.length > 0 && (
          <div className="rounded-md bg-muted/30 px-3 py-2 grid grid-cols-1 gap-1" data-testid={`panel-extraction-${file.id}`}>
            {inlineFields.map(({ label, value }) => (
              <div key={label} className="flex items-center gap-2 min-w-0">
                <span className="text-xs text-muted-foreground flex-shrink-0">{label}:</span>
                <span className="text-xs font-medium truncate">{value}</span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-auto pt-1 flex items-center justify-between gap-2 flex-wrap">
          {file.claimId ? (
            <Link href={`/claims/${file.claimId}`} className="inline-flex items-center gap-1 text-xs text-green-400 hover:underline font-medium" data-testid={`link-claim-${file.id}`}>
              <CheckCircle className="w-3 h-3" />
              {matchedClaim?.claimNumber || file.claimId.slice(0, 8) + "…"}
            </Link>
          ) : (
            <Badge variant="outline" className="text-xs text-amber-400 border-amber-400/30" data-testid={`badge-unmatched-${file.id}`}>
              Unmatched
            </Badge>
          )}

          <div className="flex items-center gap-1.5">
            {extraction && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs px-2"
                onClick={() => onReviewExtraction(file.id, file.claimId)}
                data-testid={`button-review-${file.id}`}
              >
                <Brain className="w-3 h-3" />
                AI
              </Button>
            )}
            {!file.claimId && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs px-2"
                  onClick={() => onMatch(file.id, extraction)}
                  data-testid={`button-match-${file.id}`}
                >
                  <LinkIcon className="w-3 h-3" />
                  Match
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs px-2"
                  onClick={() => onCreateClaim(file.id)}
                  data-testid={`button-create-${file.id}`}
                >
                  <PlusCircle className="w-3 h-3" />
                  Create
                </Button>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function EvidencePage() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<QueueItem[]>([]);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);

  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "unmatched" | "extracted" | string>("all");

  const [matchDialogOpen, setMatchDialogOpen] = useState(false);
  const [matchingFileId, setMatchingFileId] = useState<string | null>(null);
  const [matchingFileExtraction, setMatchingFileExtraction] = useState<ExtractionData | null>(null);
  const [selectedClaimId, setSelectedClaimId] = useState<string>("");
  const [claimSearch, setClaimSearch] = useState("");

  const [extractionReviewFileId, setExtractionReviewFileId] = useState<string | null>(null);
  const [extractionReviewClaimId, setExtractionReviewClaimId] = useState<string | null>(null);
  const [extractionReviewOpen, setExtractionReviewOpen] = useState(false);

  const { data: evidenceFiles, isLoading: filesLoading } = useQuery<EvidenceFile[]>({
    queryKey: ["/api/evidence/files"],
  });

  const { data: claims } = useQuery<Claim[]>({ queryKey: ["/api/claims"] });

  const { data: matchSuggestions, isLoading: suggestionsLoading } = useQuery<MatchSuggestionsResponse>({
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

  const claimsById = useMemo(() => new Map(claims?.map(c => [c.id, c]) ?? []), [claims]);

  const matchMutation = useMutation({
    mutationFn: async ({ fileId, claimId }: { fileId: string; claimId: string }) => {
      await apiRequest("POST", `/api/evidence/files/${fileId}/match`, { claimId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/evidence/files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/claims"] });
      toast({ title: "File matched to claim" });
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
      queryClient.invalidateQueries({ queryKey: ["/api/claims"] });
      toast({ title: "Claim created from extracted data" });
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
      queryClient.invalidateQueries({ queryKey: ["/api/claims"] });
      toast({ title: "Saved as unmatched evidence" });
      setMatchDialogOpen(false);
    },
  });

  const uploadSingleFile = useCallback(async (file: File, queueId: string): Promise<void> => {
    setUploadQueue(prev => prev.map(item =>
      item.queueId === queueId ? { ...item, status: "uploading" } : item
    ));

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
          setUploadQueue(prev => prev.map(item =>
            item.queueId === queueId
              ? { ...item, status: "duplicate", duplicate: { message: body.message, existingFile: body.existingFile } }
              : item
          ));
          queryClient.invalidateQueries({ queryKey: ["/api/evidence/files"] });
          return;
        }
      }

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || res.statusText);
      }

      const result: UploadResult = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/evidence/files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/claims"] });
      queryClient.invalidateQueries({ queryKey: ["/api/adjusters"] });

      let status: QueueItem["status"] = "needs-review";
      if (result.matchedClaimId) status = "matched";
      else if (result.createdClaim) status = "created-claim";

      setUploadQueue(prev => prev.map(item =>
        item.queueId === queueId ? { ...item, status, result } : item
      ));

      if (result.adjusterAutoLinked && result.adjusterName) {
        toast({ title: `${file.name} uploaded`, description: `Adjuster ${result.adjusterName} auto-linked` });
      }
    } catch (err: unknown) {
      setUploadQueue(prev => prev.map(item =>
        item.queueId === queueId ? { ...item, status: "error", errorMsg: (err as Error).message } : item
      ));
      toast({ title: "Upload failed", description: (err as Error).message, variant: "destructive" });
    }
  }, [toast]);

  const processFiles = useCallback(async (files: File[]) => {
    if (!files.length) return;

    const newItems: QueueItem[] = files.map(f => ({
      queueId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      fileName: f.name,
      status: "queued",
    }));

    setUploadQueue(prev => [...prev, ...newItems]);
    setIsProcessingQueue(true);

    for (let i = 0; i < files.length; i++) {
      await uploadSingleFile(files[i], newItems[i].queueId);
    }

    setIsProcessingQueue(false);
  }, [uploadSingleFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) processFiles(files);
  }, [processFiles]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) processFiles(files);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [processFiles]);

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

  const scrollToFile = useCallback((fileId: string) => {
    const el = document.querySelector(`[data-testid="card-file-${fileId}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const top = matchSuggestions?.candidates?.[0];
  const bestScore = matchSuggestions?.bestScore ?? 0;
  const hasSuggestion = bestScore >= 0.4 && !!top;
  const noMatchFound = !suggestionsLoading && bestScore < 0.4;

  const extractionClues: Array<{ label: string; value: string }> = [];
  if (matchingFileExtraction) {
    const e = matchingFileExtraction;
    if (e.claimNumber) extractionClues.push({ label: "Claim #", value: e.claimNumber });
    if (e.homeownerName || e.insuredName) extractionClues.push({ label: "Homeowner", value: (e.homeownerName || e.insuredName)! });
    if (e.carrier) extractionClues.push({ label: "Carrier", value: e.carrier });
    if (e.propertyAddress) extractionClues.push({ label: "Address", value: e.propertyAddress });
    if (e.dateOfLoss) extractionClues.push({ label: "Date of Loss", value: e.dateOfLoss });
    if (e.adjusterName) extractionClues.push({ label: "Adjuster", value: e.adjusterName });
  }

  const filteredClaims = useMemo(() =>
    (claims ?? []).filter(c =>
      !claimSearch ||
      c.claimNumber?.toLowerCase().includes(claimSearch.toLowerCase()) ||
      c.homeownerName?.toLowerCase().includes(claimSearch.toLowerCase()) ||
      c.carrier?.toLowerCase().includes(claimSearch.toLowerCase())
    ),
    [claims, claimSearch]
  );

  const unmatchedCount = useMemo(() => evidenceFiles?.filter(f => !f.claimId).length ?? 0, [evidenceFiles]);
  const extractedCount = useMemo(() => evidenceFiles?.filter(f => f.extractionStatus === "complete").length ?? 0, [evidenceFiles]);

  const allCategories = useMemo(() => {
    const cats = new Set<string>();
    evidenceFiles?.forEach(f => { if (f.docCategory && f.docCategory !== "unknown") cats.add(f.docCategory); });
    return Array.from(cats);
  }, [evidenceFiles]);

  const filteredFiles = useMemo(() => {
    let files = evidenceFiles ?? [];

    if (activeFilter === "unmatched") files = files.filter(f => !f.claimId);
    else if (activeFilter === "extracted") files = files.filter(f => f.extractionStatus === "complete");
    else if (activeFilter !== "all") files = files.filter(f => f.docCategory === activeFilter);

    if (search.trim()) {
      const q = search.toLowerCase();
      files = files.filter(f => {
        if (f.fileName?.toLowerCase().includes(q)) return true;
        if (f.docCategory?.toLowerCase().includes(q)) return true;
        const ext = getExtraction(f);
        if (ext?.claimNumber?.toLowerCase().includes(q)) return true;
        if (ext?.carrier?.toLowerCase().includes(q)) return true;
        if (ext?.adjusterName?.toLowerCase().includes(q)) return true;
        return false;
      });
    }

    return files;
  }, [evidenceFiles, activeFilter, search]);

  const queueHasItems = uploadQueue.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-evidence-title">Evidence Files</h1>
        <p className="text-sm text-muted-foreground">Upload and manage source documents for your claims.</p>
      </div>

      {/* ── Drop Zone ─────────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-4">
          <div
            className={`border-2 border-dashed rounded-md p-8 text-center transition-colors ${
              isDragOver ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/40"
            }`}
            onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            data-testid="dropzone-upload"
          >
            <div className="flex flex-col items-center gap-3">
              {isProcessingQueue ? (
                <>
                  <div className="relative">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    <Brain className="w-3.5 h-3.5 text-primary absolute -bottom-1 -right-1" />
                  </div>
                  <p className="text-sm font-medium">Analyzing documents…</p>
                </>
              ) : (
                <>
                  <FileUp className="w-8 h-8 text-muted-foreground/50" />
                  <div>
                    <p className="text-sm font-medium">Drag & drop files here</p>
                    <p className="text-xs text-muted-foreground mt-0.5">PDF, Images, DOCX, TXT, EML — multiple files at once</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} data-testid="button-browse-files">
                    <Upload className="w-3.5 h-3.5" />
                    Browse Files
                  </Button>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_TYPES}
                multiple
                onChange={handleFileSelect}
                className="hidden"
                data-testid="input-file-upload"
              />
            </div>
          </div>

          {/* Upload Queue Strip */}
          {queueHasItems && (
            <div className="mt-3 space-y-1.5" data-testid="upload-queue">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Upload Queue</p>
                {!isProcessingQueue && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 text-xs px-1 text-muted-foreground"
                    onClick={() => setUploadQueue([])}
                    data-testid="button-clear-queue"
                  >
                    Clear
                  </Button>
                )}
              </div>
              {uploadQueue.map(item => (
                <QueueItemRow
                  key={item.queueId}
                  item={item}
                  claimsById={claimsById}
                  onMatch={openMatchDialog}
                  onViewDuplicate={scrollToFile}
                  onReviewExtraction={openExtractionReview}
                  onCreateClaim={id => createClaimMutation.mutate(id)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Search + Filter ───────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by filename, claim #, carrier, adjuster…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-files"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap" data-testid="filter-chips">
        {([
          { id: "all", label: "All", count: evidenceFiles?.length ?? 0 },
          { id: "unmatched", label: "Needs Matching", count: unmatchedCount },
          { id: "extracted", label: "Has Extraction", count: extractedCount },
        ] as const).map(chip => (
          <button
            key={chip.id}
            onClick={() => setActiveFilter(chip.id)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
              activeFilter === chip.id
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground/50"
            }`}
            data-testid={`chip-filter-${chip.id}`}
          >
            {chip.label}
            {chip.count > 0 && (
              <span className={`rounded-full px-1.5 py-0 text-[10px] ${
                activeFilter === chip.id ? "bg-primary-foreground/20" : "bg-muted"
              }`}>{chip.count}</span>
            )}
          </button>
        ))}
        {allCategories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveFilter(activeFilter === cat ? "all" : cat)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
              activeFilter === cat
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground/50"
            }`}
            data-testid={`chip-filter-${cat}`}
          >
            {fmt(cat)}
          </button>
        ))}
      </div>

      {/* ── File Card Grid ───────────────────────────────────────────────── */}
      {filesLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-36 w-full rounded-xl" />)}
        </div>
      ) : !filteredFiles.length ? (
        <div className="py-16 text-center">
          {evidenceFiles?.length ? (
            <>
              <Filter className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground font-medium">No files match this filter</p>
              <Button variant="ghost" size="sm" className="mt-2" onClick={() => { setActiveFilter("all"); setSearch(""); }}>
                Clear filters
              </Button>
            </>
          ) : (
            <>
              <FileText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground font-medium">No evidence files yet</p>
              <p className="text-sm text-muted-foreground/70 mt-1">Drop files in the upload zone above to get started</p>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="file-grid">
          {filteredFiles.map(file => (
            <FileCard
              key={file.id}
              file={file}
              claimsById={claimsById}
              onMatch={openMatchDialog}
              onReviewExtraction={openExtractionReview}
              onCreateClaim={id => createClaimMutation.mutate(id)}
            />
          ))}
        </div>
      )}

      {/* ── Match to Claim Dialog ─────────────────────────────────────────── */}
      <Dialog open={matchDialogOpen} onOpenChange={v => { if (!v) { setMatchDialogOpen(false); setMatchingFileId(null); setMatchingFileExtraction(null); } }}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Match to Claim</DialogTitle>
            <DialogDescription>Link this file to an existing claim.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
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

            {suggestionsLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : hasSuggestion && top ? (
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2" data-testid="panel-match-summary">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-primary" data-testid="text-match-summary">Suggested match</p>
                  <Badge variant="outline" className="text-xs">{Math.round(top.score * 100)}% match</Badge>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  {top.claimNumber && <div><span className="text-muted-foreground">Claim #: </span><span className="font-medium" data-testid="text-suggested-claim-number">{top.claimNumber}</span></div>}
                  {top.carrier && <div><span className="text-muted-foreground">Carrier: </span><span className="font-medium">{top.carrier}</span></div>}
                  {top.homeownerName && <div><span className="text-muted-foreground">Homeowner: </span><span className="font-medium">{top.homeownerName}</span></div>}
                  {top.dateOfLoss && <div><span className="text-muted-foreground">DOL: </span><span>{fmtDate(top.dateOfLoss)}</span></div>}
                </div>
                {!!top.reasons?.length && (
                  <p className="text-xs text-muted-foreground/80">Why: {top.reasons.join(" · ")}</p>
                )}
                <Button
                  size="sm"
                  onClick={() => matchingFileId && matchMutation.mutate({ fileId: matchingFileId, claimId: top.claimId })}
                  disabled={matchMutation.isPending}
                  data-testid="button-use-suggested"
                >
                  {matchMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                  Confirm Match
                </Button>
              </div>
            ) : noMatchFound ? (
              <div className="rounded-md border border-border bg-muted/30 p-3" data-testid="panel-no-match">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-muted-foreground">No match found from extracted data. Search claims below or create a new one.</p>
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={createClaimMutation.isPending || !matchingFileId}
                onClick={() => matchingFileId && createClaimMutation.mutate(matchingFileId)}
                data-testid="button-match-create-claim"
              >
                {createClaimMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <PlusCircle className="w-3 h-3" />}
                Create New Claim
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={unmatchMutation.isPending || !matchingFileId}
                onClick={() => matchingFileId && unmatchMutation.mutate(matchingFileId)}
                data-testid="button-save-unmatched"
              >
                Save as Unmatched
              </Button>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Or search and select manually</p>
              <Input
                placeholder="Search by claim #, homeowner, carrier…"
                value={claimSearch}
                onChange={e => setClaimSearch(e.target.value)}
                data-testid="input-claim-search"
              />
              <div className="max-h-48 overflow-y-auto space-y-1.5">
                {filteredClaims.slice(0, 30).map(c => (
                  <button
                    key={c.id}
                    className={`w-full text-left rounded-md border px-3 py-2 text-sm transition-colors ${
                      selectedClaimId === c.id
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-muted-foreground/40 hover:bg-muted/30"
                    }`}
                    onClick={() => setSelectedClaimId(c.id)}
                    data-testid={`row-claim-${c.id}`}
                  >
                    <span className="font-medium">{c.claimNumber}</span>
                    {c.carrier && <span className="text-muted-foreground ml-2">· {c.carrier}</span>}
                    {c.homeownerName && <span className="text-muted-foreground ml-2">· {c.homeownerName}</span>}
                  </button>
                ))}
                {!filteredClaims.length && (
                  <p className="text-sm text-muted-foreground text-center py-4">No claims found</p>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button variant="ghost" onClick={() => setMatchDialogOpen(false)} data-testid="button-match-cancel">Cancel</Button>
            <Button
              disabled={!selectedClaimId || matchMutation.isPending || !matchingFileId}
              onClick={() => matchingFileId && matchMutation.mutate({ fileId: matchingFileId, claimId: selectedClaimId })}
              data-testid="button-match-confirm"
            >
              {matchMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <LinkIcon className="w-4 h-4" />}
              Match to Selected Claim
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Extraction Review Dialog ──────────────────────────────────────── */}
      <ExtractionReviewDialog
        fileId={extractionReviewFileId}
        claimId={extractionReviewClaimId}
        open={extractionReviewOpen}
        onClose={() => { setExtractionReviewOpen(false); setExtractionReviewFileId(null); setExtractionReviewClaimId(null); }}
      />
    </div>
  );
}

import { useState, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
  Search,
  X,
  Loader2,
  ChevronDown,
  Link as LinkIcon,
  Brain,
  Sparkles,
  CheckCheck,
} from "lucide-react";

const ACCEPTED_TYPES =
  ".pdf,.jpg,.jpeg,.png,.gif,.bmp,.tiff,.docx,.txt,.eml";
const ACCEPTED_MIME =
  "application/pdf,image/*,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,message/rfc822";

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

function formatEntityType(type: string): string {
  return type
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function formatCategory(cat: string): string {
  return cat
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface ExtractionResultData {
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
  extraction?: ExtractionResultData | null;
  matchedClaimId: string | null;
  autoMatched?: boolean;
  matchConfidence?: number;
  matchConfidenceLabel?: string;
  matchReasons?: string[];
  draft: ClaimDraft | null;
}

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

  const extraction: ExtractionResultData | null =
    (file?.extractedJson as any)?.extraction ?? null;

  const setFieldValue = (key: string, value: string) =>
    setFields((prev) => ({ ...prev, [key]: value }));

  // Pre-fill editable fields from extraction on first load
  useState(() => {
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
  });

  // Also initialize when extraction arrives asynchronously
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
      const res = await apiRequest(
        "POST",
        `/api/evidence/files/${fileId}/apply-extraction`,
        { fields: acceptedFields }
      );
      return res;
    },
    onSuccess: (data: any) => {
      const count = data?.fieldsApplied?.length ?? 0;
      toast({
        title: "AI extraction applied",
        description: `${count} field${count !== 1 ? "s" : ""} updated on the claim`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/claims"] });
      queryClient.invalidateQueries({ queryKey: ["/api/evidence/files"] });
      onClose();
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to apply extraction",
        description: err.message,
        variant: "destructive",
      });
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
  const confLabel =
    confidence >= 0.8 ? "High" : confidence >= 0.5 ? "Medium" : "Low";
  const confColor =
    confidence >= 0.8
      ? "text-green-400"
      : confidence >= 0.5
      ? "text-amber-400"
      : "text-red-400";

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setInitialized(false);
          setFields({});
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle
            className="flex items-center gap-2"
            data-testid="text-extraction-dialog-title"
          >
            <Brain className="w-5 h-5 text-primary" />
            AI Extraction Review
          </DialogTitle>
          <DialogDescription>
            Review and edit fields extracted by AI from your document. Clear
            any field you don't want applied, then click Apply to Claim.
          </DialogDescription>
        </DialogHeader>

        {fileLoading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !extraction ? (
          <div className="py-10 text-center space-y-2">
            <Brain className="w-10 h-10 text-muted-foreground/30 mx-auto" />
            <p className="text-muted-foreground">
              No AI extraction data available for this file.
            </p>
            <p className="text-xs text-muted-foreground/70">
              AI extraction works for PDF, TXT, and EML documents with
              readable text content.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center gap-3 rounded-md border border-border bg-muted/40 p-3">
              <Sparkles className="w-4 h-4 text-primary flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">
                  AI Confidence:{" "}
                  <span className={confColor}>
                    {(confidence * 100).toFixed(0)}% — {confLabel}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Edit any field before applying. Clear a field to exclude it.
                </p>
              </div>
              <div className="w-24 h-2 rounded-full bg-muted overflow-hidden flex-shrink-0">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${confidence * 100}%` }}
                />
              </div>
            </div>

            {EXTRACTION_SECTIONS.map((section) => {
              const visibleFields = section.fields.filter(
                (f) => (extraction as any)[f.key] != null
              );
              if (!visibleFields.length) return null;
              return (
                <div key={section.title}>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                    {section.title}
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {visibleFields.map((f) => (
                      <div key={f.key} className="space-y-1">
                        <label className="text-xs text-muted-foreground">
                          {f.label}
                        </label>
                        <Input
                          value={fields[f.key] ?? ""}
                          onChange={(e) =>
                            setFieldValue(f.key, e.target.value)
                          }
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
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Missing Scope Items (informational)
                </h4>
                <ul className="space-y-1">
                  {extraction.missingScopeItems.map((item, i) => (
                    <li
                      key={i}
                      className="text-sm flex items-start gap-2 text-muted-foreground"
                      data-testid={`text-scope-item-${i}`}
                    >
                      <span className="text-primary mt-0.5">•</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!!extraction.escalationReferences?.length && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Escalation References (informational)
                </h4>
                <ul className="space-y-1">
                  {extraction.escalationReferences.map((item, i) => (
                    <li
                      key={i}
                      className="text-sm flex items-start gap-2 text-amber-400/80"
                      data-testid={`text-escalation-ref-${i}`}
                    >
                      <span className="mt-0.5">⚠</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!!extraction.timelineEvents?.length && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Timeline Events Detected
                </h4>
                <div className="space-y-1">
                  {extraction.timelineEvents.map((evt, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 text-sm"
                      data-testid={`row-timeline-event-${i}`}
                    >
                      <span className="font-mono text-xs text-muted-foreground min-w-[90px]">
                        {evt.date}
                      </span>
                      <span className="text-muted-foreground">
                        {evt.description}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-between gap-2 pt-4 border-t border-border">
          <Button
            variant="ghost"
            onClick={onClose}
            data-testid="button-extraction-skip"
          >
            Skip
          </Button>
          <Button
            disabled={
              !extraction ||
              !claimId ||
              applyMutation.isPending ||
              fileLoading
            }
            onClick={handleApply}
            data-testid="button-extraction-apply"
          >
            {applyMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCheck className="w-4 h-4" />
            )}
            Apply to Claim
          </Button>
        </div>
        {!claimId && extraction && (
          <p className="text-xs text-amber-400 text-center">
            Match this file to a claim first before applying extraction fields.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
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

export default function EvidencePage() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [matchDialogOpen, setMatchDialogOpen] = useState(false);
  const [selectedClaimId, setSelectedClaimId] = useState<string>("");
  const [matchingFileId, setMatchingFileId] = useState<string | null>(null);
  const [draftsOpen, setDraftsOpen] = useState(false);
  const [unmatchedOpen, setUnmatchedOpen] = useState(true);
  const [preSelectClaimId, setPreSelectClaimId] = useState<string>("");
  const [claimSearch, setClaimSearch] = useState("");
  const [extractionReviewFileId, setExtractionReviewFileId] = useState<string | null>(null);
  const [extractionReviewClaimId, setExtractionReviewClaimId] = useState<string | null>(null);
  const [extractionReviewOpen, setExtractionReviewOpen] = useState(false);

  const { data: evidenceFiles, isLoading: filesLoading } = useQuery<
    (EvidenceFile & { entities?: ExtractedEntity[] })[]
  >({
    queryKey: ["/api/evidence/files"],
  });

  const { data: claims } = useQuery<Claim[]>({
    queryKey: ["/api/claims"],
  });

  const { data: drafts, isLoading: draftsLoading } = useQuery<ClaimDraft[]>({
    queryKey: ["/api/evidence/drafts"],
  });

  const { data: unmatchedFiles, isLoading: unmatchedLoading } = useQuery<
    EvidenceFile[]
  >({
    queryKey: ["/api/evidence/files-unmatched"],
  });

  const { data: matchSuggestions, isLoading: suggestionsLoading } =
    useQuery<MatchSuggestionsResponse>({
      queryKey: ["/api/evidence/files", matchingFileId, "match-suggestions"],
      queryFn: async () => {
        const res = await fetch(
          `/api/evidence/files/${matchingFileId}/match-suggestions`,
          {
            headers: getAccessToken()
              ? { Authorization: `Bearer ${getAccessToken()}` }
              : {},
            credentials: "include",
          }
        );
        if (!res.ok) throw new Error("Failed to load match suggestions");
        return res.json();
      },
      enabled: !!matchingFileId && matchDialogOpen,
    });

  const selectedFile = evidenceFiles?.find((f) => f.id === selectedFileId);

  const handleUpload = useCallback(
    async (file: File) => {
      setIsUploading(true);
      setUploadResult(null);
      try {
        const formData = new FormData();
        formData.append("file", file);
        if (preSelectClaimId)
          formData.append("claimId", preSelectClaimId);

        const token = getAccessToken();
        const res = await fetch("/api/evidence/upload", {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
          credentials: "include",
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || res.statusText);
        }

        const result: UploadResult = await res.json();
        setUploadResult(result);
        queryClient.invalidateQueries({ queryKey: ["/api/evidence/files"] });
        queryClient.invalidateQueries({ queryKey: ["/api/evidence/drafts"] });
        toast({ title: "File uploaded successfully" });
      } catch (err: any) {
        toast({
          title: "Upload failed",
          description: err.message,
          variant: "destructive",
        });
      } finally {
        setIsUploading(false);
      }
    },
    [preSelectClaimId, toast]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) handleUpload(files[0]);
    },
    [handleUpload]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) handleUpload(files[0]);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [handleUpload]
  );

  const matchMutation = useMutation({
    mutationFn: async ({
      fileId,
      claimId,
    }: {
      fileId: string;
      claimId: string;
    }) => {
      await apiRequest("POST", `/api/evidence/files/${fileId}/match`, {
        claimId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/evidence/files"] });
      toast({ title: "Claim matched successfully" });
      setMatchDialogOpen(false);
      setSelectedClaimId("");
      setMatchingFileId(null);
    },
    onError: (err: Error) => {
      toast({
        title: "Match failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const createClaimMutation = useMutation({
    mutationFn: async (fileId: string) => {
      return apiRequest("POST", `/api/evidence/files/${fileId}/create-claim`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/evidence/files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/evidence/files-unmatched"] });
      queryClient.invalidateQueries({ queryKey: ["/api/evidence/drafts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/claims"] });
      toast({ title: "Claim created from file" });
    },
    onError: (err: Error) => {
      toast({ title: "Create claim failed", description: err.message, variant: "destructive" });
    },
  });

  const unmatchMutation = useMutation({
    mutationFn: async (fileId: string) => {
      return apiRequest("POST", `/api/evidence/files/${fileId}/unmatch`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/evidence/files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/evidence/files-unmatched"] });
      queryClient.invalidateQueries({ queryKey: ["/api/evidence/drafts"] });
      toast({ title: "Saved as unmatched evidence for review" });
    },
    onError: (err: Error) => {
      toast({ title: "Action failed", description: err.message, variant: "destructive" });
    },
  });

  const openMatchDialog = useCallback((fileId: string) => {
    setMatchingFileId(fileId);
    setSelectedClaimId("");
    setClaimSearch("");
    setMatchDialogOpen(true);
  }, []);

  const openExtractionReview = useCallback((fileId: string, claimId?: string | null) => {
    setExtractionReviewFileId(fileId);
    setExtractionReviewClaimId(claimId ?? null);
    setExtractionReviewOpen(true);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1
          className="text-2xl font-bold tracking-tight"
          data-testid="text-evidence-title"
        >
          Evidence Upload
        </h1>
        <p className="text-sm text-muted-foreground">
          Upload documents to the ClaimSignal™ intelligence pipeline
        </p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">
            Pre-select claim:
          </label>
          <Select
            value={preSelectClaimId}
            onValueChange={setPreSelectClaimId}
          >
            <SelectTrigger
              className="w-[200px]"
              data-testid="select-preselect-claim"
            >
              <SelectValue placeholder="None (auto-match)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None (auto-match)</SelectItem>
              {claims?.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.claimNumber}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardContent className="p-6">
          <div
            className={`border-2 border-dashed rounded-md p-12 text-center transition-colors ${
              isDragOver
                ? "border-primary bg-primary/5"
                : "border-border hover:border-muted-foreground/50"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
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
                <p className="text-xs text-muted-foreground">
                  Extracting claim fields, classifying document, matching claims
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <FileUp className="w-10 h-10 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">
                    Drag & drop files here
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    PDF, Images, DOCX, TXT, EML
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  data-testid="button-browse-files"
                >
                  <Upload className="w-4 h-4" />
                  Browse Files
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_TYPES}
                  onChange={handleFileSelect}
                  className="hidden"
                  data-testid="input-file-upload"
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {uploadResult && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              Upload Results
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">
                  Classification
                </p>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      (categoryColors[
                        uploadResult.file.docCategory || "unknown"
                      ] as any) || "outline"
                    }
                    data-testid="badge-upload-category"
                  >
                    {formatCategory(
                      uploadResult.file.docCategory || "unknown"
                    )}
                  </Badge>
                  {uploadResult.file.confidence != null && (
                    <span
                      className="text-xs text-muted-foreground"
                      data-testid="text-upload-confidence"
                    >
                      {(uploadResult.file.confidence * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">
                  Claim Match
                </p>
                {uploadResult.matchedClaimId ? (
                  <div className="space-y-1">
                    <span
                      className="text-sm font-mono block"
                      data-testid="text-upload-claim-match"
                    >
                      {uploadResult.matchedClaimId}
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
                      {(uploadResult.matchConfidence ?? 0) >= 0.4
                        ? "Match needs review"
                        : "No matching claim found"}
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openMatchDialog(uploadResult.file.id)}
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
                  Entities Extracted
                </p>
                <span
                  className="text-sm"
                  data-testid="text-upload-entity-count"
                >
                  {uploadResult.entities?.length || 0} found
                </span>
              </div>
            </div>

            {uploadResult.extraction && (
              <div className="flex items-center gap-3 rounded-md border border-primary/30 bg-primary/5 p-3">
                <Sparkles className="w-4 h-4 text-primary flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">
                    AI extracted {Object.keys(uploadResult.extraction).filter(
                      (k) => !["confidence", "extractionMethod", "documentType", "missingScopeItems", "codeItems", "reinspectionReferences", "escalationReferences", "timelineEvents", "denialOverturned"].includes(k) &&
                        (uploadResult.extraction as any)[k] != null
                    ).length} claim fields
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Confidence: {((uploadResult.extraction.confidence || 0) * 100).toFixed(0)}% — review before applying
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() =>
                    openExtractionReview(
                      uploadResult.file.id,
                      uploadResult.matchedClaimId
                    )
                  }
                  data-testid="button-review-extraction-upload"
                >
                  <Brain className="w-4 h-4" />
                  Review & Apply
                </Button>
              </div>
            )}

            {uploadResult.entities && uploadResult.entities.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">
                  Extracted Entities
                </p>
                <div className="space-y-1">
                  {uploadResult.entities.map((entity, i) => (
                    <div
                      key={entity.id || i}
                      className="flex items-center justify-between text-sm py-1 border-b border-border/30 last:border-0"
                      data-testid={`row-upload-entity-${i}`}
                    >
                      <span className="text-muted-foreground">
                        {formatEntityType(entity.entityType)}
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs">
                          {entity.rawValue}
                        </span>
                        {entity.confidence != null && (
                          <span className="text-xs text-muted-foreground">
                            {(entity.confidence * 100).toFixed(0)}%
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Evidence Files</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {filesLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !evidenceFiles?.length ? (
            <div className="p-12 text-center">
              <FileText className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground font-medium">
                No evidence files yet
              </p>
              <p className="text-sm text-muted-foreground/70">
                Upload your first document above
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Claim Match</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Uploaded</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {evidenceFiles.map((file) => (
                    <TableRow
                      key={file.id}
                      className="hover-elevate cursor-pointer"
                      onClick={() =>
                        setSelectedFileId(
                          selectedFileId === file.id ? null : file.id
                        )
                      }
                      data-testid={`row-evidence-${file.id}`}
                    >
                      <TableCell className="font-medium text-sm max-w-[200px] truncate" data-testid={`text-filename-${file.id}`}>
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                          {file.fileName}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground uppercase" data-testid={`text-filetype-${file.id}`}>
                        {file.fileType || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            (categoryColors[
                              file.docCategory || "unknown"
                            ] as any) || "outline"
                          }
                          className="text-xs"
                          data-testid={`badge-category-${file.id}`}
                        >
                          {formatCategory(file.docCategory || "unknown")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm" data-testid={`text-claim-match-${file.id}`}>
                        {file.claimId ? (
                          <span className="font-mono text-xs">
                            {file.claimId.slice(0, 8)}...
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            file.extractionStatus === "complete"
                              ? "default"
                              : file.extractionStatus === "failed"
                              ? "destructive"
                              : "outline"
                          }
                          className="text-xs capitalize"
                          data-testid={`badge-status-${file.id}`}
                        >
                          {file.extractionStatus || "pending"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground" data-testid={`text-uploaded-${file.id}`}>
                        {file.uploadedAt
                          ? new Date(file.uploadedAt).toLocaleDateString()
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedFile && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">File Details</CardTitle>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setSelectedFileId(null)}
              data-testid="button-close-detail"
            >
              <X className="w-4 h-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Name</p>
                <p className="text-sm font-medium truncate" data-testid="text-detail-name">
                  {selectedFile.fileName}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Type</p>
                <p className="text-sm uppercase" data-testid="text-detail-type">
                  {selectedFile.fileType || "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Size</p>
                <p className="text-sm" data-testid="text-detail-size">
                  {formatFileSize(selectedFile.fileSize)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">SHA-256</p>
                <p
                  className="text-xs font-mono truncate"
                  title={selectedFile.sha256 || ""}
                  data-testid="text-detail-sha256"
                >
                  {selectedFile.sha256
                    ? selectedFile.sha256.slice(0, 16) + "..."
                    : "—"}
                </p>
              </div>
            </div>

            <div>
              <p className="text-xs text-muted-foreground mb-1">
                Classification
              </p>
              <div className="flex items-center gap-3">
                <Badge
                  variant={
                    (categoryColors[
                      selectedFile.docCategory || "unknown"
                    ] as any) || "outline"
                  }
                  data-testid="badge-detail-category"
                >
                  {formatCategory(selectedFile.docCategory || "unknown")}
                </Badge>
                {selectedFile.confidence != null && (
                  <div className="flex items-center gap-2 flex-1 max-w-[200px]">
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{
                          width: `${(selectedFile.confidence * 100).toFixed(0)}%`,
                        }}
                      />
                    </div>
                    <span
                      className="text-xs text-muted-foreground"
                      data-testid="text-detail-confidence"
                    >
                      {(selectedFile.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                )}
              </div>
            </div>

            {(selectedFile as any).entities &&
              (selectedFile as any).entities.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">
                    Extracted Entities
                  </p>
                  <div className="space-y-2">
                    {((selectedFile as any).entities as ExtractedEntity[]).map(
                      (entity, i) => (
                        <div
                          key={entity.id || i}
                          className="flex items-center gap-3 text-sm"
                          data-testid={`row-detail-entity-${i}`}
                        >
                          <span className="text-muted-foreground min-w-[140px]">
                            {formatEntityType(entity.entityType)}
                          </span>
                          <span className="font-mono text-xs flex-1 truncate">
                            {entity.rawValue}
                          </span>
                          {entity.confidence != null && (
                            <div className="flex items-center gap-1 min-w-[80px]">
                              <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                                <div
                                  className="h-full bg-primary rounded-full"
                                  style={{
                                    width: `${(entity.confidence * 100).toFixed(0)}%`,
                                  }}
                                />
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {(entity.confidence * 100).toFixed(0)}%
                              </span>
                            </div>
                          )}
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}

            {(() => {
              const fileExtraction = (selectedFile.extractedJson as any)?.extraction as ExtractionResultData | null;
              return fileExtraction ? (
                <div className="flex items-center gap-3 rounded-md border border-primary/30 bg-primary/5 p-3">
                  <Brain className="w-4 h-4 text-primary flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">AI extraction available</p>
                    <p className="text-xs text-muted-foreground">
                      {(fileExtraction.confidence * 100).toFixed(0)}% confidence
                      {selectedFile.claimId ? " · Click to review and apply to claim" : " · Match to a claim first"}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => openExtractionReview(selectedFile.id, selectedFile.claimId)}
                    data-testid="button-review-extraction-detail"
                  >
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
                  onClick={() => openMatchDialog(selectedFile.id)}
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
                  {createClaimMutation.isPending && (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  )}
                  Create Claim from File
                </Button>
                <Button
                  variant="ghost"
                  disabled={unmatchMutation.isPending}
                  onClick={() => unmatchMutation.mutate(selectedFile.id)}
                  data-testid="button-leave-unmatched"
                >
                  {unmatchMutation.isPending && (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  )}
                  Leave Unmatched
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Collapsible open={unmatchedOpen} onOpenChange={setUnmatchedOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer flex flex-row items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">Unmatched Evidence</CardTitle>
                {!!unmatchedFiles?.length && (
                  <Badge variant="outline" className="text-xs" data-testid="badge-unmatched-count">
                    {unmatchedFiles.length}
                  </Badge>
                )}
              </div>
              <ChevronDown
                className={`w-4 h-4 text-muted-foreground transition-transform ${
                  unmatchedOpen ? "rotate-180" : ""
                }`}
              />
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0">
              {unmatchedLoading ? (
                <div className="space-y-2">
                  {[...Array(2)].map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              ) : !unmatchedFiles?.length ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No unmatched files. Every uploaded document is linked to a claim.
                </p>
              ) : (
                <div className="space-y-2">
                  {unmatchedFiles.map((f) => (
                    <div
                      key={f.id}
                      className="border border-border rounded-md p-3 flex items-center justify-between gap-3 flex-wrap"
                      data-testid={`card-unmatched-${f.id}`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate" data-testid={`text-unmatched-name-${f.id}`}>
                          {f.fileName}
                        </p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {(f.docCategory || "unknown").replace(/_/g, " ")}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openMatchDialog(f.id)}
                        data-testid={`button-match-unmatched-${f.id}`}
                      >
                        <LinkIcon className="w-4 h-4" />
                        Match
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <Collapsible open={draftsOpen} onOpenChange={setDraftsOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">Claim Drafts</CardTitle>
              <ChevronDown
                className={`w-4 h-4 text-muted-foreground transition-transform ${
                  draftsOpen ? "rotate-180" : ""
                }`}
              />
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0">
              {draftsLoading ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : !drafts?.length ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No drafts needing review
                </p>
              ) : (
                <div className="space-y-3">
                  {drafts.map((draft) => (
                    <div
                      key={draft.id}
                      className="border border-border rounded-md p-3 space-y-2"
                      data-testid={`card-draft-${draft.id}`}
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-sm font-medium" data-testid={`text-draft-claim-number-${draft.id}`}>
                          {draft.extractedClaimNumber || "No claim number"}
                        </span>
                        <Badge
                          variant="outline"
                          className="text-xs capitalize"
                          data-testid={`badge-draft-status-${draft.id}`}
                        >
                          {draft.status?.replace("_", " ") || "Needs Review"}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                        {draft.extractedInsured && (
                          <div>
                            <span className="block text-muted-foreground/70">
                              Insured
                            </span>
                            <span data-testid={`text-draft-insured-${draft.id}`}>{draft.extractedInsured}</span>
                          </div>
                        )}
                        {draft.extractedCarrier && (
                          <div>
                            <span className="block text-muted-foreground/70">
                              Carrier
                            </span>
                            <span data-testid={`text-draft-carrier-${draft.id}`}>{draft.extractedCarrier}</span>
                          </div>
                        )}
                        {draft.extractedAddress && (
                          <div>
                            <span className="block text-muted-foreground/70">
                              Address
                            </span>
                            <span data-testid={`text-draft-address-${draft.id}`}>{draft.extractedAddress}</span>
                          </div>
                        )}
                        {draft.extractedDateOfLoss && (
                          <div>
                            <span className="block text-muted-foreground/70">
                              Date of Loss
                            </span>
                            <span data-testid={`text-draft-dol-${draft.id}`}>
                              {new Date(
                                draft.extractedDateOfLoss
                              ).toLocaleDateString()}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <Dialog open={matchDialogOpen} onOpenChange={setMatchDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Match to Claim</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {suggestionsLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : (
              (() => {
                const top = matchSuggestions?.candidates?.[0];
                const best = matchSuggestions?.bestScore ?? 0;
                const summary =
                  matchSuggestions?.confidenceLabel ||
                  "No matching claim found. Pick a claim manually or create a new one.";
                const hasSuggestion = best >= 0.4 && !!top;
                return (
                  <div
                    className="rounded-md border border-border bg-muted/40 p-3 space-y-2"
                    data-testid="panel-match-summary"
                  >
                    <p className="text-sm font-medium" data-testid="text-match-summary">
                      {summary}
                    </p>
                    {hasSuggestion && top && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-sm" data-testid="text-suggested-claim-number">
                            {top.claimNumber || "No claim number"}
                            {top.carrier ? ` · ${top.carrier}` : ""}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {Math.round(top.score * 100)}% match
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          {top.homeownerName && <span>Homeowner: {top.homeownerName}</span>}
                          {top.propertyLocation && <span>Location: {top.propertyLocation}</span>}
                          {top.status && <span className="capitalize">Status: {top.status.replace(/_/g, " ")}</span>}
                          {top.dateOfLoss && (
                            <span>DOL: {new Date(top.dateOfLoss).toLocaleDateString()}</span>
                          )}
                        </div>
                        {!!top.reasons?.length && (
                          <p className="text-xs text-muted-foreground/80">
                            Why: {top.reasons.join(", ")}
                          </p>
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
                    )}
                  </div>
                );
              })()
            )}

            <div className="space-y-2">
              <Input
                placeholder="Search claims by number, carrier, homeowner, location..."
                value={claimSearch}
                onChange={(e) => setClaimSearch(e.target.value)}
                data-testid="input-claim-search"
              />
              <div className="max-h-56 overflow-y-auto rounded-md border border-border divide-y divide-border">
                {(() => {
                  const q = claimSearch.trim().toLowerCase();
                  const filtered = (claims || []).filter((c) => {
                    if (!q) return true;
                    return [
                      c.claimNumber,
                      c.carrier,
                      c.homeownerName,
                      c.insuredName,
                      c.propertyAddress,
                      c.city,
                      c.state,
                      c.status,
                    ]
                      .filter(Boolean)
                      .some((v) => String(v).toLowerCase().includes(q));
                  });
                  if (!filtered.length) {
                    return (
                      <p className="text-sm text-muted-foreground py-6 text-center">
                        No claims match your search.
                      </p>
                    );
                  }
                  return filtered.map((c) => {
                    const loc = [c.city, c.state].filter(Boolean).join(", ");
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setSelectedClaimId(c.id)}
                        className={`w-full text-left p-2.5 hover-elevate transition-colors ${
                          selectedClaimId === c.id ? "bg-accent" : ""
                        }`}
                        data-testid={`row-claim-${c.id}`}
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-sm font-medium">
                            {c.claimNumber || "No claim number"}
                          </span>
                          {c.status && (
                            <Badge variant="outline" className="text-xs capitalize">
                              {c.status.replace(/_/g, " ")}
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-2">
                          {c.carrier && <span>{c.carrier}</span>}
                          {c.homeownerName && <span>· {c.homeownerName}</span>}
                          {loc && <span>· {loc}</span>}
                          {c.dateOfLoss && (
                            <span>· DOL {new Date(c.dateOfLoss).toLocaleDateString()}</span>
                          )}
                        </div>
                      </button>
                    );
                  });
                })()}
              </div>
            </div>

            <div className="flex justify-between gap-2 flex-wrap">
              <Button
                variant="ghost"
                disabled={unmatchMutation.isPending || !matchingFileId}
                onClick={() => {
                  if (matchingFileId) {
                    unmatchMutation.mutate(matchingFileId);
                    setMatchDialogOpen(false);
                  }
                }}
                data-testid="button-dialog-leave-unmatched"
              >
                Leave Unmatched
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setMatchDialogOpen(false)}
                  data-testid="button-cancel-match"
                >
                  Cancel
                </Button>
                <Button
                  disabled={!selectedClaimId || matchMutation.isPending}
                  onClick={() => {
                    if (matchingFileId && selectedClaimId) {
                      matchMutation.mutate({
                        fileId: matchingFileId,
                        claimId: selectedClaimId,
                      });
                    }
                  }}
                  data-testid="button-confirm-match"
                >
                  {matchMutation.isPending && (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  )}
                  Confirm Match
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ExtractionReviewDialog
        fileId={extractionReviewFileId}
        claimId={extractionReviewClaimId}
        open={extractionReviewOpen}
        onClose={() => {
          setExtractionReviewOpen(false);
          setExtractionReviewFileId(null);
          setExtractionReviewClaimId(null);
        }}
      />
    </div>
  );
}

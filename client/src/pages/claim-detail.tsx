import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient, getAccessToken } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import type { Claim, Supplement, TimelineEvent, EvidenceFile } from "@shared/schema";
import {
  ArrowLeft,
  FileText,
  MapPin,
  DollarSign,
  Clock,
  Trash2,
  AlertTriangle,
  Loader2,
  Shield,
  Download,
  Plus,
  FileUp,
  XCircle,
  FilePlus,
  Search,
  RotateCcw,
  CheckCircle,
  Activity,
  Brain,
  Calendar,
  Eye,
  Wrench,
  ShieldCheck,
  ListChecks,
  Sparkles,
  Cloud,
  Wind,
  Droplets,
  Snowflake,
  Thermometer,
  BookOpen,
  ArrowRight,
  Pencil,
  Upload,
  Paperclip,
  Code,
  Image as ImageIcon,
  Mail,
  AudioLines,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useLocation } from "wouter";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { computeDefensibility, type AiAnalysis } from "@/lib/claim-intelligence";
import { ClaimAdjustersCard } from "@/components/claim-adjusters-card";

const LIFECYCLE_PHASES = [
  { key: "pre_claim", label: "Pre-Claim" },
  { key: "filed", label: "Filed" },
  { key: "inspected", label: "Inspected" },
  { key: "initial_determination", label: "Initial Determination" },
  { key: "supplement_submitted", label: "Supplement Submitted" },
  { key: "reinspection_requested", label: "Reinspection Requested" },
  { key: "escalated", label: "Escalated" },
  { key: "resolved", label: "Resolved" },
  { key: "closed", label: "Closed" },
] as const;

const EVENT_TYPE_CONFIG: Record<string, { icon: typeof FileUp; color: string }> = {
  doc_uploaded: { icon: FileUp, color: "text-muted-foreground" },
  denial: { icon: XCircle, color: "text-red-500" },
  payment_issued: { icon: DollarSign, color: "text-green-500" },
  supplement_submitted: { icon: FilePlus, color: "text-muted-foreground" },
  inspection: { icon: Search, color: "text-muted-foreground" },
  escalation: { icon: AlertTriangle, color: "text-orange-500" },
  reinspection: { icon: RotateCcw, color: "text-muted-foreground" },
  determination: { icon: CheckCircle, color: "text-muted-foreground" },
};

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return "\u2014";
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getScoreColor(value: number, thresholds: { good: number; warn: number }, lowerIsBetter = false): string {
  if (lowerIsBetter) {
    if (value <= thresholds.good) return "text-green-500";
    if (value <= thresholds.warn) return "text-yellow-500";
    return "text-red-500";
  }
  if (value >= thresholds.good) return "text-green-500";
  if (value >= thresholds.warn) return "text-yellow-500";
  return "text-red-500";
}

const supplementLineItemSchema = z.object({
  description: z.string().min(1, "Description required"),
  quantity: z.coerce.number().min(0),
  unitCost: z.coerce.number().min(0),
});

const createSupplementSchema = z.object({
  amountRequested: z.coerce.number().min(0, "Amount required"),
  category: z.string().optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
  lineItems: z.array(supplementLineItemSchema).optional(),
});

export default function ClaimDetailPage() {
  const [, params] = useRoute("/claims/:id");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: authData } = useAuth();
  const userRole = authData?.user?.role || "standard";
  const isMaster = userRole === "super_admin";

  const claimId = params?.id;

  const { data: claim, isLoading } = useQuery<Claim>({
    queryKey: ["/api/claims", claimId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/claims/${claimId}`);
      return res.json();
    },
    enabled: !!claimId,
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/claims/${claimId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/claims"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "Claim deleted" });
      setLocation("/claims");
    },
    onError: (err: Error) => {
      toast({ title: "Failed to delete", description: err.message, variant: "destructive" });
    },
  });

  const { data: supplementsList } = useQuery<Supplement[]>({
    queryKey: ["/api/claims", claimId, "supplements"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/claims/${claimId}/supplements`);
      return res.json();
    },
    enabled: !!claimId,
  });

  const { data: evidenceFiles, isLoading: evidenceLoading } = useQuery<EvidenceFile[]>({
    queryKey: ["/api/evidence/files", claimId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/evidence/files?claimId=${claimId}`);
      return res.json();
    },
    enabled: !!claimId,
  });

  const { data: timelineEvents, isLoading: timelineLoading } = useQuery<TimelineEvent[]>({
    queryKey: ["/api/evidence/timeline", claimId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/evidence/timeline/${claimId}`);
      return res.json();
    },
    enabled: !!claimId,
  });

  const [suppDialogOpen, setSuppDialogOpen] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [expandedFileIds, setExpandedFileIds] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: ircScreening } = useQuery({
    queryKey: ["/api/claims", claimId, "irc-screening"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/claims/${claimId}/irc-screening`);
      return res.json();
    },
    enabled: !!claimId,
  });

  const suppForm = useForm<z.infer<typeof createSupplementSchema>>({
    resolver: zodResolver(createSupplementSchema),
    defaultValues: { amountRequested: 0, category: "materials", description: "", notes: "", lineItems: [] },
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("claimId", claimId!);
      const token = getAccessToken();
      const res = await fetch("/api/evidence/upload", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Upload failed" }));
        throw new Error(err.message || "Upload failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/evidence/files", claimId] });
      queryClient.invalidateQueries({ queryKey: ["/api/evidence/timeline", claimId] });
      toast({ title: "Document uploaded" });
      setUploadingFiles(false);
    },
    onError: (err: Error) => {
      const msg = err.message || "";
      if (msg.includes("already exists")) {
        toast({ title: "Document already uploaded", description: "This file was previously uploaded. Try a different file.", variant: "destructive" });
      } else {
        toast({ title: "Upload failed", description: msg, variant: "destructive" });
      }
      setUploadingFiles(false);
    },
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadingFiles(true);
    for (const file of Array.from(files)) {
      await uploadMutation.mutateAsync(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const createSuppMutation = useMutation({
    mutationFn: async (data: z.infer<typeof createSupplementSchema>) => {
      await apiRequest("POST", `/api/claims/${claimId}/supplements`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/claims", claimId, "supplements"] });
      toast({ title: "Supplement added" });
      setSuppDialogOpen(false);
      suppForm.reset();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to add supplement", description: err.message, variant: "destructive" });
    },
  });

  const { data: candidates } = useQuery<TimelineEvent[]>({
    queryKey: ["/api/timeline/candidates", claimId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/timeline/candidates?claimId=${claimId}`);
      return res.json();
    },
    enabled: !!claimId,
  });

  const applyExtractionMutation = useMutation({
    mutationFn: async (fileId: string) => {
      const res = await apiRequest("POST", `/api/evidence/files/${fileId}/apply-extraction`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/claims", claimId] });
      toast({ title: "Extraction applied to claim" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to apply extraction", description: err.message, variant: "destructive" });
    },
  });

  const _renameFileMutation = useMutation({
    mutationFn: async ({ fileId, fileName }: { fileId: string; fileName: string }) => {
      const res = await apiRequest("PATCH", `/api/evidence/files/${fileId}`, { fileName });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/evidence/files", claimId] });
      toast({ title: "File renamed" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to rename file", description: err.message, variant: "destructive" });
    },
  });

  const _deleteFileMutation = useMutation({
    mutationFn: async (fileId: string) => {
      await apiRequest("DELETE", `/api/evidence/files/${fileId}/permanent`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/evidence/files", claimId] });
      toast({ title: "File deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to delete file", description: err.message, variant: "destructive" });
    },
  });

  interface PlaybookRecommendation {
    playbook: { id: string; title: string; recommendedNextStep?: string | null; source?: string };
    matchScore: number;
    matchReasons?: string[];
  }

  const { data: playbookRecs } = useQuery<{
    method: string;
    recommendations: PlaybookRecommendation[];
    aiStrategy?: {
      summary: string;
      prioritizedSteps: Array<{ step: string; rationale: string; priority: "critical" | "high" | "medium" }>;
      keyLeveragePoints: string[];
      warningFlags: string[];
    } | null;
  }>({
    queryKey: ["/api/claims", claimId, "playbook-recommendations"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/claims/${claimId}/playbook-recommendations`);
      return res.json();
    },
    enabled: !!claimId,
  });

  const extractMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/claims/${claimId}/extract-timeline`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timeline/candidates", claimId] });
      queryClient.invalidateQueries({ queryKey: ["/api/evidence/timeline", claimId] });
      toast({ title: "Date extraction complete", description: "Review the suggested timeline entries below." });
    },
    onError: (err: Error) => toast({ title: "Extraction failed", description: err.message, variant: "destructive" }),
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: string }) => {
      await apiRequest("PATCH", `/api/timeline/${id}/review`, { action });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timeline/candidates", claimId] });
      queryClient.invalidateQueries({ queryKey: ["/api/evidence/timeline", claimId] });
    },
    onError: (err: Error) => toast({ title: "Review failed", description: err.message, variant: "destructive" }),
  });

  // ── AI claim analysis ──
  const [aiResult, setAiResult] = useState<AiAnalysis | null>(null);
  const aiMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/claims/${claimId}/ai-analysis`, {});
      return res.json() as Promise<{ analysis: AiAnalysis }>;
    },
    onSuccess: (data) => {
      setAiResult(data.analysis);
      queryClient.invalidateQueries({ queryKey: ["/api/claims", claimId] });
      toast({ title: "AI analysis generated" });
    },
    onError: (err: Error) => toast({ title: "Analysis failed", description: err.message, variant: "destructive" }),
  });

  // ── Denial-to-approval pattern detection ──
  const { data: denialPatterns } = useQuery<{
    available: boolean;
    caseCount: number;
    summary: string;
    patterns: Array<{ name: string; description: string; frequency: number }>;
    topStrategies: string[];
    commonDocumentation: string[];
    typicalTimeline: string;
    confidence: number;
  }>({
    queryKey: ["/api/claims", claimId, "denial-patterns"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/claims/${claimId}/denial-patterns`);
      return res.json();
    },
    enabled: !!claimId && (claim?.initialOutcome?.toLowerCase().includes("deni") || claim?.denialOverturned === false),
  });

  // ── Weather ──
  interface WeatherSnapshot {
    summary: string;
    location: string;
    date: string;
    tempMinC: number | null;
    tempMaxC: number | null;
    tempMinF: number | null;
    tempMaxF: number | null;
    windGustMaxKmh: number | null;
    windGustMaxMph: number | null;
    precipitationMm: number | null;
    precipitationIn: number | null;
    snowfallCm: number | null;
    snowfallIn: number | null;
    isHail: boolean;
  }

  const { data: weatherData, isLoading: weatherLoading } = useQuery<{ available: boolean; weather?: WeatherSnapshot; reason?: string }>({
    queryKey: ["/api/claims", claimId, "weather"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/claims/${claimId}/weather`);
      return res.json();
    },
    enabled: !!claimId,
  });

  // ── Vendor tracking edit ──
  const [vendorDialogOpen, setVendorDialogOpen] = useState(false);
  const vendorForm = useForm<Record<string, string>>({ defaultValues: {} });
  const vendorMutation = useMutation({
    mutationFn: async (data: Record<string, string>) => {
      await apiRequest("PATCH", `/api/claims/${claimId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/claims", claimId] });
      toast({ title: "Vendor details updated" });
      setVendorDialogOpen(false);
    },
    onError: (err: Error) => toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });

  // ── Move claim to a different lifecycle phase ──
  const phaseMutation = useMutation({
    mutationFn: async (newPhase: string) => {
      await apiRequest("PATCH", `/api/claims/${claimId}`, { currentPhase: newPhase });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/claims", claimId] });
      toast({ title: "Lifecycle phase updated" });
    },
    onError: (err: Error) => toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });

  // ── Capture outcome as playbook (Master only) ──
  const [playbookDialogOpen, setPlaybookDialogOpen] = useState(false);
  const [useMetric, setUseMetric] = useState(false);
  const playbookForm = useForm<{ title: string; actionTaken: string; whatWorked: string; outcome: string; recommendedNextStep: string }>({
    defaultValues: { title: "", actionTaken: "", whatWorked: "", outcome: "", recommendedNextStep: "" },
  });
  type PlaybookFormData = { title: string; actionTaken: string; whatWorked: string; outcome: string; recommendedNextStep: string };

  const playbookMutation = useMutation({
    mutationFn: async (data: PlaybookFormData) => {
      await apiRequest("POST", `/api/playbooks`, {
        ...data,
        sourceClaimId: claimId,
        carrier: claim?.carrier || undefined,
        claimType: claim?.claimType || claim?.lossType || undefined,
        denialReason: claim?.denialReason || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/playbooks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/claims", claimId, "playbook-recommendations"] });
      toast({ title: "Outcome captured as playbook" });
      setPlaybookDialogOpen(false);
      playbookForm.reset();
    },
    onError: (err: Error) => toast({ title: "Failed to capture playbook", description: err.message, variant: "destructive" }),
  });

  const handleExport = async (type: string, format: string) => {
    try {
      const res = await apiRequest("GET", `/api/exports/claims/${claimId}?type=${type}&format=${format}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `claim_${claimId}_${type}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Export downloaded" });
    } catch (err) {
      toast({ title: "Export failed", description: err instanceof Error ? err.message : "An error occurred", variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-16 w-full" />
        <div className="grid md:grid-cols-2 gap-4">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!claim) {
    return (
      <div className="text-center py-24">
        <FileText className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
        <p className="text-muted-foreground font-medium">Claim not found</p>
        <Link href="/claims">
          <Button variant="outline" className="mt-4">Back to Claims</Button>
        </Link>
      </div>
    );
  }

  const statusColor: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    open: "default",
    in_progress: "secondary",
    approved: "default",
    denied: "destructive",
    closed: "outline",
  };

  const currentPhaseIndex = LIFECYCLE_PHASES.findIndex(p => p.key === claim.currentPhase);

  const sortedTimeline = timelineEvents
    ? [...timelineEvents].sort((a, b) => {
        const dateA = a.eventDate ? new Date(a.eventDate).getTime() : 0;
        const dateB = b.eventDate ? new Date(b.eventDate).getTime() : 0;
        return dateA - dateB;
      })
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/claims">
            <Button variant="ghost" size="icon" data-testid="button-back-claims">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight" data-testid="text-claim-title">
              {claim.claimNumber}
            </h1>
            <p className="text-sm text-muted-foreground">{claim.insuredName || "\u2014"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant={statusColor[claim.status] ?? "outline"}
            className="capitalize"
            data-testid="badge-claim-status"
          >
            {claim.status.replace("_", " ")}
          </Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" data-testid="button-export-claim">
                <Download className="w-4 h-4" />
                Download
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleExport("intelligence_summary", "pdf")} data-testid="export-intel-pdf">
                Intelligence Summary (PDF)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport("claim_packet_masked", "pdf")} data-testid="export-masked-pdf">
                Claim Packet - Masked (PDF)
              </DropdownMenuItem>
              {isMaster && (
                <DropdownMenuItem onClick={() => handleExport("claim_packet_unmasked", "pdf")} data-testid="export-unmasked-pdf">
                  Full Claim Packet - Unmasked (PDF)
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => handleExport("intelligence_summary", "csv")} data-testid="export-intel-csv">
                Intelligence Summary (CSV)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport("claim_packet_masked", "csv")} data-testid="export-masked-csv">
                Claim Packet - Masked (CSV)
              </DropdownMenuItem>
              {isMaster && (
                <DropdownMenuItem onClick={() => handleExport("claim_packet_unmasked", "csv")} data-testid="export-unmasked-csv">
                  Full Claim Packet - Unmasked (CSV)
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (confirm("Delete this claim?")) deleteMutation.mutate();
            }}
            disabled={deleteMutation.isPending}
            data-testid="button-delete-claim"
          >
            {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4 text-destructive" />}
          </Button>
        </div>
      </div>

      {claim.currentPhase && (
        <Card data-testid="card-lifecycle-phase">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3 mb-4">
              <Activity className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold">Lifecycle Phase</span>
              <Badge variant="default" data-testid="badge-current-phase" className="capitalize">
                {claim.currentPhase.replace(/_/g, " ")}
              </Badge>
            </div>
            <div className="flex items-center gap-1 overflow-x-auto pb-1" data-testid="phase-progression">
              {LIFECYCLE_PHASES.map((phase, idx) => {
                const isCompleted = idx < currentPhaseIndex;
                const isCurrent = idx === currentPhaseIndex;
                const isLoading = phaseMutation.isPending && phaseMutation.variables === phase.key;
                return (
                  <div key={phase.key} className="flex items-center">
                    <button
                      type="button"
                      disabled={isCurrent || phaseMutation.isPending}
                      onClick={() => phaseMutation.mutate(phase.key)}
                      className={`flex items-center justify-center rounded-md px-2 py-1 text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary ${
                        isCurrent
                          ? "bg-primary text-primary-foreground cursor-default"
                          : isCompleted
                          ? "bg-primary/20 text-primary hover:bg-primary/35 cursor-pointer"
                          : "bg-muted text-muted-foreground hover:bg-muted/70 cursor-pointer"
                      } disabled:opacity-60`}
                      data-testid={`phase-step-${phase.key}`}
                      title={isCurrent ? "Current phase" : `Move to ${phase.label}`}
                    >
                      {isLoading ? "…" : phase.label}
                    </button>
                    {idx < LIFECYCLE_PHASES.length - 1 && (
                      <div
                        className={`w-4 h-0.5 flex-shrink-0 ${
                          idx < currentPhaseIndex ? "bg-primary" : "bg-muted"
                        }`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {isMaster && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-card/50 px-3 py-2">
          <Eye className="w-4 h-4 text-amber-500" />
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-amber-500">Master view</span> — all PII visible and unmasked. Access is audited.
          </p>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              Claim Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <InfoRow label="Claim Number" value={claim.claimNumber} testId="detail-claim-number" />
            <InfoRow label="Insured Name" value={claim.insuredName || "\u2014"} testId="detail-insured-name" />
            <InfoRow label="Loss Type" value={claim.lossType || "\u2014"} testId="detail-loss-type" />
            <InfoRow label="Status" value={claim.status.replace("_", " ")} testId="detail-status" />
            {claim.frictionScore !== null && claim.frictionScore !== undefined && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Friction Score</span>
                <div className="flex items-center gap-2">
                  <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{ width: `${Math.min(claim.frictionScore, 100)}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium" data-testid="detail-friction-score">{claim.frictionScore}/100</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" />
              Location
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <InfoRow label="Address" value={claim.address || "\u2014"} testId="detail-address" />
            <InfoRow label="City" value={claim.city || "\u2014"} testId="detail-city" />
            <InfoRow label="State" value={claim.state || "\u2014"} testId="detail-state" />
            <InfoRow label="ZIP Code" value={claim.zipCode || "\u2014"} testId="detail-zip" />
          </CardContent>
        </Card>

        <Card data-testid="card-financial-summary">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-primary" />
              Financial Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <InfoRow label="Claim Amount" value={formatCurrency(claim.claimAmount)} testId="detail-claim-amount" />
            <InfoRow label="Approved Amount" value={formatCurrency(claim.approvedAmount)} testId="detail-approved-amount" />
            <InfoRow label="RCV Amount" value={formatCurrency(claim.rcvAmount)} testId="detail-rcv-amount" />
            <InfoRow label="ACV Amount" value={formatCurrency(claim.acvAmount)} testId="detail-acv-amount" />
            <InfoRow label="Deductible" value={formatCurrency(claim.deductible)} testId="detail-deductible" />
            <InfoRow label="Supplement Total" value={formatCurrency(claim.supplementAmountTotal)} testId="detail-supplement-total" />
            <InfoRow label="Final Paid" value={formatCurrency(claim.finalPaidAmount)} testId="detail-final-paid" />
          </CardContent>
        </Card>

        <Card data-testid="card-intelligence-scores">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Brain className="w-4 h-4 text-primary" />
              Intelligence Scores
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {claim.lifecycleVelocityScore !== null && claim.lifecycleVelocityScore !== undefined && (
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-col">
                  <span className="text-sm text-muted-foreground">Lifecycle Velocity</span>
                  <span className="text-[10px] text-muted-foreground/60">Higher = slower progression</span>
                </div>
                <span
                  className={`text-sm font-medium shrink-0 ${getScoreColor(claim.lifecycleVelocityScore, { good: 50, warn: 80 }, true)}`}
                  data-testid="detail-velocity-score"
                  title={`Lifecycle Velocity Score: ${claim.lifecycleVelocityScore.toFixed(1)} — measures time elapsed across lifecycle phases. Higher values indicate slower or stalled claim progression.`}
                >
                  {claim.lifecycleVelocityScore.toFixed(1)}
                </span>
              </div>
            )}
            {claim.scopeDeltaScore !== null && claim.scopeDeltaScore !== undefined && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Scope Delta</span>
                <span
                  className={`text-sm font-medium ${getScoreColor(claim.scopeDeltaScore, { good: 30, warn: 60 }, true)}`}
                  data-testid="detail-scope-delta"
                >
                  {claim.scopeDeltaScore.toFixed(1)}
                </span>
              </div>
            )}
            {claim.escalationLevel !== null && claim.escalationLevel !== undefined && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Escalation Level</span>
                <span
                  className={`text-sm font-medium ${getScoreColor(claim.escalationLevel, { good: 1, warn: 3 }, true)}`}
                  data-testid="detail-escalation-level"
                >
                  {claim.escalationLevel} / 5
                </span>
              </div>
            )}
            {claim.outcomeMigrationDelta !== null && claim.outcomeMigrationDelta !== undefined && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Outcome Migration Delta</span>
                <span
                  className={`text-sm font-medium ${getScoreColor(Math.abs(claim.outcomeMigrationDelta), { good: 10, warn: 30 }, true)}`}
                  data-testid="detail-outcome-migration"
                >
                  {claim.outcomeMigrationDelta > 0 ? "+" : ""}{claim.outcomeMigrationDelta.toFixed(1)}
                </span>
              </div>
            )}
            {claim.frictionScore !== null && claim.frictionScore !== undefined && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Friction Score</span>
                <span
                  className={`text-sm font-medium ${getScoreColor(claim.frictionScore, { good: 30, warn: 60 }, true)}`}
                  data-testid="detail-intel-friction"
                >
                  {claim.frictionScore}
                </span>
              </div>
            )}
            {claim.approvalProbability !== null && claim.approvalProbability !== undefined && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Approval Probability</span>
                <span
                  className={`text-sm font-medium ${getScoreColor(claim.approvalProbability * 100, { good: 70, warn: 40 })}`}
                  data-testid="detail-approval-probability"
                >
                  {(claim.approvalProbability * 100).toFixed(0)}%
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" />
              Key Dates
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <InfoRow
              label="Date of Loss"
              value={claim.dateOfLoss ? new Date(claim.dateOfLoss).toLocaleDateString() : (claim.lossDate ? new Date(claim.lossDate).toLocaleDateString() : "\u2014")}
              testId="detail-date-of-loss"
            />
            <InfoRow
              label="Inspection Date"
              value={claim.inspectionDate ? new Date(claim.inspectionDate).toLocaleDateString() : "\u2014"}
              testId="detail-inspection-date"
            />
            <InfoRow
              label="Determination Date"
              value={claim.determinationDate ? new Date(claim.determinationDate).toLocaleDateString() : "\u2014"}
              testId="detail-determination-date"
            />
            <InfoRow
              label="Reinspection Date"
              value={claim.reinspectionDate ? new Date(claim.reinspectionDate).toLocaleDateString() : "\u2014"}
              testId="detail-reinspection-date"
            />
            <InfoRow
              label="Resolution Date"
              value={claim.resolutionDate ? new Date(claim.resolutionDate).toLocaleDateString() : "\u2014"}
              testId="detail-resolution-date"
            />
            <InfoRow
              label="Created"
              value={claim.createdAt ? new Date(claim.createdAt).toLocaleDateString() : "\u2014"}
              testId="detail-created"
            />
            {claim.notes && (
              <div>
                <span className="text-sm text-muted-foreground block mb-1">Notes</span>
                <p className="text-sm bg-muted/50 rounded-md p-3" data-testid="detail-notes">{claim.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" />
              Homeowner Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <InfoRow label="Homeowner Name" value={claim.homeownerName || "\u2014"} testId="detail-homeowner-name" />
            <InfoRow label="Phone" value={claim.homeownerPhone || "\u2014"} testId="detail-homeowner-phone" />
            <InfoRow label="Email" value={claim.homeownerEmail || "\u2014"} testId="detail-homeowner-email" />
            <InfoRow label="Policy Number" value={claim.policyNumber || "\u2014"} testId="detail-policy-number" />
          </CardContent>
        </Card>

        <Card data-testid="card-weather">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Cloud className="w-4 h-4 text-primary" />
              Weather at Loss
            </CardTitle>
            {weatherData?.weather && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[10px] text-muted-foreground"
                onClick={() => setUseMetric((m) => !m)}
                data-testid="button-weather-unit-toggle"
              >
                {useMetric ? "Switch to °F" : "Switch to °C"}
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {weatherLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ) : !weatherData?.available ? (
              <p className="text-sm text-muted-foreground py-2" data-testid="weather-unavailable">
                {weatherData?.reason || "Weather data not available for this claim."}
              </p>
            ) : weatherData.weather ? (
              <div className="space-y-3" data-testid="weather-content">
                <p className="text-sm" data-testid="weather-summary">{weatherData.weather.summary}</p>
                {weatherData.weather.isHail && (
                  <div className="flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5" data-testid="weather-hail-flag">
                    <span className="text-xs font-semibold text-amber-400">⚠ HAIL RECORDED</span>
                    <span className="text-xs text-muted-foreground">— WMO hail weather code on date of loss</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span data-testid="weather-location">{weatherData.weather.location}</span>
                  <span data-testid="weather-date">{weatherData.weather.date}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(useMetric ? weatherData.weather.tempMaxC : weatherData.weather.tempMaxF) != null && (
                    <div className="flex items-center gap-2 rounded-md bg-muted/50 p-2" data-testid="weather-temp">
                      <Thermometer className="w-4 h-4 text-orange-400" />
                      {useMetric
                        ? <span className="text-sm">{Math.round(weatherData.weather.tempMinC ?? 0)}° / {Math.round(weatherData.weather.tempMaxC!)}°C</span>
                        : <span className="text-sm">{weatherData.weather.tempMinF ?? "—"}° / {weatherData.weather.tempMaxF}°F</span>
                      }
                    </div>
                  )}
                  {(useMetric ? weatherData.weather.windGustMaxKmh : weatherData.weather.windGustMaxMph) != null && (
                    <div className="flex items-center gap-2 rounded-md bg-muted/50 p-2" data-testid="weather-wind">
                      <Wind className="w-4 h-4 text-sky-400" />
                      {useMetric
                        ? <span className="text-sm">{Math.round(weatherData.weather.windGustMaxKmh!)} km/h gust</span>
                        : <span className="text-sm">{weatherData.weather.windGustMaxMph} mph gust</span>
                      }
                    </div>
                  )}
                  {(useMetric
                    ? (weatherData.weather.precipitationMm != null && weatherData.weather.precipitationMm > 0)
                    : (weatherData.weather.precipitationIn != null && weatherData.weather.precipitationIn > 0)) && (
                    <div className="flex items-center gap-2 rounded-md bg-muted/50 p-2" data-testid="weather-precip">
                      <Droplets className="w-4 h-4 text-blue-400" />
                      {useMetric
                        ? <span className="text-sm">{weatherData.weather.precipitationMm!.toFixed(1)} mm</span>
                        : <span className="text-sm">{weatherData.weather.precipitationIn!.toFixed(2)} in</span>
                      }
                    </div>
                  )}
                  {(useMetric
                    ? (weatherData.weather.snowfallCm != null && weatherData.weather.snowfallCm > 0)
                    : (weatherData.weather.snowfallIn != null && weatherData.weather.snowfallIn > 0)) && (
                    <div className="flex items-center gap-2 rounded-md bg-muted/50 p-2" data-testid="weather-snow">
                      <Snowflake className="w-4 h-4 text-cyan-300" />
                      {useMetric
                        ? <span className="text-sm">{weatherData.weather.snowfallCm!.toFixed(1)} cm</span>
                        : <span className="text-sm">{weatherData.weather.snowfallIn!.toFixed(1)} in</span>
                      }
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground/70">Historical data via Open-Meteo · {useMetric ? "Metric units" : "US customary units"}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card data-testid="card-vendor-tracking">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Wrench className="w-4 h-4 text-primary" />
              Vendor Tracking
            </CardTitle>
            <Dialog open={vendorDialogOpen} onOpenChange={(open) => {
              setVendorDialogOpen(open);
              if (open) {
                vendorForm.reset({
                  vendorName: claim.vendorName || "",
                  inspectionVendor: claim.inspectionVendor || "",
                  ladderAssistVendor: claim.ladderAssistVendor || "",
                  engineeringFirm: claim.engineeringFirm || "",
                  itelVendor: claim.itelVendor || "",
                  photoInspectionVendor: claim.photoInspectionVendor || "",
                  vendorFinding: claim.vendorFinding || "",
                  vendorImpact: claim.vendorImpact || "",
                  vendorNotes: claim.vendorNotes || "",
                });
              }
            }}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" data-testid="button-edit-vendor">
                  <Pencil className="w-3 h-3" />
                  Edit
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Edit Vendor Tracking</DialogTitle>
                </DialogHeader>
                <form onSubmit={vendorForm.handleSubmit((d) => vendorMutation.mutate(d))} className="space-y-3">
                  {[
                    { name: "vendorName", label: "Primary Vendor" },
                    { name: "inspectionVendor", label: "Inspection Vendor" },
                    { name: "ladderAssistVendor", label: "Ladder Assist Vendor" },
                    { name: "engineeringFirm", label: "Engineering Firm" },
                    { name: "itelVendor", label: "ITEL Vendor" },
                    { name: "photoInspectionVendor", label: "Photo Inspection Vendor" },
                  ].map((f) => (
                    <div className="space-y-1.5" key={f.name}>
                      <Label>{f.label}</Label>
                      <Input data-testid={`input-${f.name}`} {...vendorForm.register(f.name)} />
                    </div>
                  ))}
                  <div className="space-y-1.5">
                    <Label>Vendor Finding</Label>
                    <Textarea rows={2} data-testid="input-vendorFinding" {...vendorForm.register("vendorFinding")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Vendor Impact</Label>
                    <Textarea rows={2} data-testid="input-vendorImpact" {...vendorForm.register("vendorImpact")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Vendor Notes</Label>
                    <Textarea rows={2} data-testid="input-vendorNotes" {...vendorForm.register("vendorNotes")} />
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={vendorMutation.isPending} data-testid="button-save-vendor">
                      {vendorMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent className="space-y-4">
            <InfoRow label="Primary Vendor" value={claim.vendorName || "\u2014"} testId="detail-vendor-name" />
            <InfoRow label="Inspection Vendor" value={claim.inspectionVendor || "\u2014"} testId="detail-inspection-vendor" />
            <InfoRow label="Ladder Assist" value={claim.ladderAssistVendor || "\u2014"} testId="detail-ladder-vendor" />
            <InfoRow label="Engineering Firm" value={claim.engineeringFirm || "\u2014"} testId="detail-engineering-firm" />
            <InfoRow label="ITEL Vendor" value={claim.itelVendor || "\u2014"} testId="detail-itel-vendor" />
            <InfoRow label="Photo Inspection" value={claim.photoInspectionVendor || "\u2014"} testId="detail-photo-vendor" />
            {claim.vendorFinding && (
              <div>
                <span className="text-sm text-muted-foreground block mb-1">Finding</span>
                <p className="text-sm bg-muted/50 rounded-md p-3" data-testid="detail-vendor-finding">{claim.vendorFinding}</p>
              </div>
            )}
            {claim.vendorImpact && (
              <div>
                <span className="text-sm text-muted-foreground block mb-1">Impact</span>
                <p className="text-sm bg-muted/50 rounded-md p-3" data-testid="detail-vendor-impact">{claim.vendorImpact}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <ClaimAdjustersCard claimId={claim.id} canEdit={userRole !== "carrier_analyst"} />

      {/* ── Documents & Evidence ── */}
      <Card data-testid="card-evidence">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Paperclip className="w-4 h-4 text-primary" />
            Documents & Evidence
            {evidenceFiles && evidenceFiles.length > 0 && (
              <Badge variant="secondary" className="text-[10px]">{evidenceFiles.length}</Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileUpload}
              className="hidden"
              id="evidence-upload"
              data-testid="input-evidence-file"
            />
            <Button
              size="sm"
              variant="outline"
              data-testid="button-upload-evidence"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingFiles}
            >
              {uploadingFiles ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Upload className="w-3 h-3" />
              )}
              Upload
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {evidenceLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : !evidenceFiles?.length ? (
            <div className="text-center py-6 space-y-2">
              <FileText className="w-8 h-8 mx-auto text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No documents attached yet</p>
              <p className="text-xs text-muted-foreground/70">Upload denial letters, estimates, photos, or email threads to build your claim file.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {evidenceFiles.map((file) => {
                const categoryLabel = file.docCategory?.replace(/_/g, " ") || "unknown";
                const categoryColors: Record<string, string> = {
                  denial_letter: "text-red-400 border-red-500/40",
                  estimate: "text-blue-400 border-blue-500/40",
                  scope: "text-emerald-400 border-emerald-500/40",
                  payment_letter: "text-green-400 border-green-500/40",
                  supplement: "text-amber-400 border-amber-500/40",
                  invoice: "text-purple-400 border-purple-500/40",
                  photo_report: "text-pink-400 border-pink-500/40",
                  policy: "text-sky-400 border-sky-500/40",
                  email_thread: "text-orange-400 border-orange-500/40",
                  unknown: "text-muted-foreground border-muted",
                };
                const iconFor = (cat: string) => {
                  if (cat === "email_thread") return Mail;
                  if (cat === "photo_report") return ImageIcon;
                  if (cat === "audio") return AudioLines;
                  return FileText;
                };
                const FileIconComp = iconFor(file.docCategory || "unknown");
                const isExpanded = expandedFileIds.has(file.id);
                const extracted = (file.extractedJson as { extraction?: Record<string, unknown> } | null)?.extraction;
                const hasExtraction = !!extracted && Object.keys(extracted).length > 0;
                return (
                  <div key={file.id} className="rounded-md border border-border" data-testid={`evidence-file-${file.id}`}>
                    <div className="flex items-center gap-3 p-3">
                      <div className="flex items-center justify-center w-9 h-9 rounded-md bg-muted shrink-0">
                        <FileIconComp className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate" data-testid={`evidence-name-${file.id}`}>{file.fileName}</p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className={`text-[10px] capitalize ${categoryColors[file.docCategory || "unknown"] || categoryColors.unknown}`}>
                            {categoryLabel}
                          </Badge>
                          {file.confidence && file.confidence > 0 && (
                            <span className="text-[10px] text-muted-foreground">AI confidence {Math.round(file.confidence * 100)}%</span>
                          )}
                          {file.extractionStatus === "complete" && (
                            <span className="text-[10px] text-emerald-400">Extracted</span>
                          )}
                          {file.fileSize && (
                            <span className="text-[10px] text-muted-foreground">{(file.fileSize / 1024).toFixed(0)} KB</span>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 flex items-center gap-1">
                        {file.storageUrl && (
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" asChild>
                            <a href={file.storageUrl} target="_blank" rel="noreferrer" data-testid={`evidence-download-${file.id}`}>
                              <Download className="w-3.5 h-3.5" />
                            </a>
                          </Button>
                        )}
                        {hasExtraction && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            onClick={() => {
                              setExpandedFileIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(file.id)) next.delete(file.id);
                                else next.add(file.id);
                                return next;
                              });
                            }}
                            data-testid={`evidence-toggle-${file.id}`}
                          >
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </Button>
                        )}
                      </div>
                    </div>
                    {isExpanded && hasExtraction && (
                      <div className="px-3 pb-3 border-t border-border/50">
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-3">
                          {Object.entries(extracted).map(([key, value]) => {
                            if (value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) return null;
                            return (
                              <div key={key} className="rounded bg-muted px-2 py-1.5">
                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{key.replace(/([A-Z])/g, " $1").trim()}</p>
                                <p className="text-xs font-medium truncate">{Array.isArray(value) ? value.join(", ") : String(value)}</p>
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex items-center gap-2 mt-3">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => applyExtractionMutation.mutate(file.id)}
                            disabled={applyExtractionMutation.isPending}
                            data-testid={`evidence-apply-${file.id}`}
                          >
                            <Sparkles className="w-3 h-3 mr-1" />
                            {applyExtractionMutation.isPending ? "Applying..." : "Apply to Claim"}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {(claim.initialOutcome || claim.finalOutcome || claim.denialOverturned) && (
        <Card data-testid="card-outcome-path">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <ArrowRight className="w-4 h-4 text-primary" />
              Outcome Path
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <span className="text-xs text-muted-foreground">Initial Outcome</span>
                <p className="text-sm font-medium capitalize" data-testid="text-initial-outcome">
                  {claim.initialOutcome ? claim.initialOutcome.replace(/_/g, " ") : "\u2014"}
                </p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Final Outcome</span>
                <p className="text-sm font-medium capitalize" data-testid="text-final-outcome">
                  {claim.denialOverturned
                    ? "Denial Overturned to Approval"
                    : claim.finalOutcome
                    ? claim.finalOutcome.replace(/_/g, " ")
                    : "\u2014"}
                </p>
              </div>
            </div>
            {claim.denialOverturned && (
              <div className="flex items-center gap-2 flex-wrap rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2" data-testid="text-outcome-path-overturned">
                <Badge variant="outline" className="text-red-400 border-red-500/40">Denied</Badge>
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                <Badge variant="outline" className="text-amber-400 border-amber-500/40">Disputed / Reworked</Badge>
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                <Badge variant="outline" className="text-emerald-400 border-emerald-500/40">Overturned to Approval</Badge>
              </div>
            )}
            {claim.denialOverturned && !claim.notes && (
              <p className="text-xs text-muted-foreground">Outcome overturned. Reversal reason pending evidence.</p>
            )}
          </CardContent>
        </Card>
      )}

      <Card data-testid="card-code-permit">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Code className="w-4 h-4 text-primary" />
            Code & Permit Screening
          </CardTitle>
        </CardHeader>
        <CardContent>
          {ircScreening === undefined ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ) : !ircScreening?.available ? (
            <p className="text-sm text-muted-foreground" data-testid="irc-empty">No IRC codes matched for this claim type. Screening data will appear when applicable.</p>
          ) : (
            <div className="space-y-3" data-testid="irc-content">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline">{ircScreening.state || "—"}</Badge>
                <Badge variant="outline">{ircScreening.claimType || "—"}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{ircScreening.permitNote}</p>
              <div className="space-y-2">
                {ircScreening.codes?.map((code: { id: string; codeReference: string; title: string; description: string; severityWeight: number; supplementTriggerKeywords: string[] }) => (
                  <div key={code.id} className="rounded-md border border-muted p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">{code.codeReference}</span>
                      <Badge variant="outline" className="text-[10px]">Severity: {code.severityWeight}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{code.title}</p>
                    <p className="text-xs text-muted-foreground">{code.description}</p>
                    {code.supplementTriggerKeywords && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {code.supplementTriggerKeywords.map((k, i) => (
                          <Badge key={i} variant="secondary" className="text-[10px]">{k}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {(() => {
        const def = computeDefensibility(claim);
        const levelColor = def.level === "strong" ? "text-emerald-400" : def.level === "moderate" ? "text-amber-400" : "text-red-400";
        const barColor = def.level === "strong" ? "bg-emerald-500" : def.level === "moderate" ? "bg-amber-500" : "bg-red-500";
        return (
          <Card data-testid="card-defensibility">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-primary" />
                Defensibility Score
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <div className="flex items-end justify-between mb-1.5">
                  <span className={`text-3xl font-bold ${levelColor}`} data-testid="defensibility-score">{def.score}<span className="text-base text-muted-foreground">/100</span></span>
                  <Badge variant="outline" className={`capitalize ${levelColor}`} data-testid="defensibility-level">{def.level}</Badge>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div className={`h-full ${barColor}`} style={{ width: `${def.score}%` }} />
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">{def.completed} of {def.total} documentation items present</p>
              </div>

              <div className="grid md:grid-cols-2 gap-x-6 gap-y-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                    <ListChecks className="w-3.5 h-3.5" /> Documentation Checklist
                  </p>
                  <ul className="space-y-1.5">
                    {def.checklist.map((item) => (
                      <li key={item.key} className="flex items-center gap-2 text-sm" data-testid={`checklist-${item.key}`}>
                        {item.done ? <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" /> : <XCircle className="w-4 h-4 text-muted-foreground/50 shrink-0" />}
                        <span className={item.done ? "" : "text-muted-foreground"}>{item.label}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" /> Gaps to Address
                  </p>
                  {def.gaps.length === 0 ? (
                    <p className="text-sm text-emerald-400" data-testid="gaps-none">No documentation gaps — claim is fully supported.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {def.gaps.map((g, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground" data-testid={`gap-${i}`}>
                          <ArrowRight className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-400" />
                          <span>{g}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {denialPatterns && denialPatterns.available && denialPatterns.patterns.length > 0 && (
        <Card data-testid="card-denial-patterns">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <ArrowRight className="w-4 h-4 text-primary" />
              Denial-to-Approval Patterns
              <Badge variant="outline" className="text-[10px]">
                {denialPatterns.caseCount} historical cases
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground" data-testid="denial-pattern-summary">
              {denialPatterns.summary}
            </p>
            {denialPatterns.patterns.length > 0 && (
              <div className="space-y-2">
                {denialPatterns.patterns.map((p, i) => (
                  <div key={i} className="rounded-md border border-border p-3" data-testid={`denial-pattern-${i}`}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{p.name}</p>
                      <span className="text-[10px] text-muted-foreground">{Math.round(p.frequency * 100)}% of cases</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{p.description}</p>
                  </div>
                ))}
              </div>
            )}
            {denialPatterns.topStrategies.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Top Strategies</p>
                <ul className="space-y-1">
                  {denialPatterns.topStrategies.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground" data-testid={`strategy-${i}`}>
                      <CheckCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-400" />
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {denialPatterns.commonDocumentation.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Common Documentation</p>
                <div className="flex flex-wrap gap-1.5">
                  {denialPatterns.commonDocumentation.map((d, i) => (
                    <Badge key={i} variant="secondary" className="text-[10px] capitalize" data-testid={`doc-${i}`}>
                      {d}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {denialPatterns.typicalTimeline && (
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary mb-1">Typical Path</p>
                <p className="text-sm" data-testid="typical-timeline">{denialPatterns.typicalTimeline}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card data-testid="card-ai-intelligence">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            AI Claim Intelligence
          </CardTitle>
          <Button size="sm" variant="outline" disabled={aiMutation.isPending} onClick={() => aiMutation.mutate()} data-testid="button-generate-ai">
            {aiMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {claim.aiAnalysisAt || aiResult ? "Regenerate" : "Generate Analysis"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {(() => {
            const analysis: AiAnalysis | null = aiResult || (claim.aiAnalysisJson as AiAnalysis | null) || null;
            if (aiMutation.isPending) {
              return (
                <div className="space-y-3">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              );
            }
            if (!analysis) {
              return <p className="text-sm text-muted-foreground py-2" data-testid="ai-empty">No AI analysis yet. Generate a narrative, risk breakdown, and recommended actions from this claim's data.</p>;
            }
            return (
              <div className="space-y-4" data-testid="ai-content">
                {analysis.narrative && (
                  <p className="text-sm leading-relaxed" data-testid="ai-narrative">{analysis.narrative}</p>
                )}
                {analysis.riskExplanation && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Risk Assessment</p>
                    <p className="text-sm" data-testid="ai-risk">{analysis.riskExplanation}</p>
                  </div>
                )}
                {analysis.codeCompliance && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Code Compliance</p>
                    <p className="text-sm" data-testid="ai-code">{analysis.codeCompliance}</p>
                  </div>
                )}
                {analysis.topMissingScope?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Top Missing Scope</p>
                    <div className="flex flex-wrap gap-1.5">
                      {analysis.topMissingScope.map((s, i) => (
                        <Badge key={i} variant="secondary" data-testid={`ai-scope-${i}`}>{s}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {analysis.suggestedAction && (
                  <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary mb-1">Suggested Next Move</p>
                    <p className="text-sm" data-testid="ai-suggested">{analysis.suggestedAction}</p>
                  </div>
                )}
                {claim.aiAnalysisAt && !aiResult && (
                  <p className="text-[10px] text-muted-foreground/70">Generated {new Date(claim.aiAnalysisAt).toLocaleString()}</p>
                )}
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {(() => {
        const analysis: AiAnalysis | null = aiResult || (claim.aiAnalysisJson as AiAnalysis | null) || null;
        if (!analysis?.recommendedActions?.length) return null;
        const prioColor = (p: string) => p === "high" ? "text-red-400 border-red-400/40" : p === "medium" ? "text-amber-400 border-amber-400/40" : "text-emerald-400 border-emerald-400/40";
        return (
          <Card data-testid="card-recommended-actions">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-primary" />
                Recommended Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {analysis.recommendedActions.map((a, i) => (
                <div key={i} className="rounded-md border border-border p-3" data-testid={`recommended-action-${i}`}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">{a.title}</p>
                    <Badge variant="outline" className={`shrink-0 capitalize ${prioColor(a.priority)}`}>{a.priority}</Badge>
                  </div>
                  {a.detail && <p className="text-xs text-muted-foreground mt-1">{a.detail}</p>}
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })()}

      {isMaster && (
        <Card data-testid="card-capture-outcome">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-primary" />
              Capture Outcome as Playbook
            </CardTitle>
            <Dialog open={playbookDialogOpen} onOpenChange={setPlaybookDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" data-testid="button-capture-outcome">
                  <Plus className="w-3 h-3" />
                  Capture
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Capture Outcome as Playbook</DialogTitle>
                </DialogHeader>
                <form onSubmit={playbookForm.handleSubmit((d) => playbookMutation.mutate(d))} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>Title *</Label>
                    <Input data-testid="input-playbook-title" {...playbookForm.register("title", { required: true })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Action Taken</Label>
                    <Textarea rows={2} data-testid="input-playbook-action" {...playbookForm.register("actionTaken")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>What Worked</Label>
                    <Textarea rows={2} data-testid="input-playbook-worked" {...playbookForm.register("whatWorked")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Outcome</Label>
                    <Input data-testid="input-playbook-outcome" {...playbookForm.register("outcome")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Recommended Next Step</Label>
                    <Textarea rows={2} data-testid="input-playbook-next" {...playbookForm.register("recommendedNextStep")} />
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={playbookMutation.isPending} data-testid="button-save-playbook">
                      {playbookMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save Playbook"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Turn this claim's resolution into a reusable playbook entry that powers recommendations on similar future claims.</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="text-base font-semibold">Supplements</CardTitle>
          <Dialog open={suppDialogOpen} onOpenChange={setSuppDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" data-testid="button-add-supplement">
                <Plus className="w-3 h-3" />
                Add
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add Supplement</DialogTitle>
              </DialogHeader>
              <form onSubmit={suppForm.handleSubmit((d) => createSuppMutation.mutate(d))} className="space-y-4">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={suppForm.watch("category") || "materials"} onValueChange={(v) => suppForm.setValue("category", v)}>
                    <SelectTrigger data-testid="select-supp-category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="materials">Materials</SelectItem>
                      <SelectItem value="labor">Labor</SelectItem>
                      <SelectItem value="overhead">Overhead & Profit</SelectItem>
                      <SelectItem value="code_upgrade">Code Upgrade</SelectItem>
                      <SelectItem value="permit">Permit / Fees</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea data-testid="input-supp-description" placeholder="Brief description of the supplement" {...suppForm.register("description")} />
                </div>
                <div className="space-y-2">
                  <Label>Amount Requested ($)</Label>
                  <Input type="number" step="0.01" data-testid="input-supp-amount" {...suppForm.register("amountRequested")} />
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea data-testid="input-supp-notes" placeholder="Additional notes" {...suppForm.register("notes")} />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center justify-between">
                    Line Items
                    <Button type="button" size="sm" variant="ghost" onClick={() => {
                      const current = suppForm.getValues("lineItems") || [];
                      suppForm.setValue("lineItems", [...current, { description: "", quantity: 1, unitCost: 0 }]);
                    }} data-testid="button-add-line-item">
                      <Plus className="w-3 h-3" /> Add Line
                    </Button>
                  </Label>
                  <div className="space-y-2">
                    {(suppForm.watch("lineItems") || []).map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <Input placeholder="Description" className="flex-1" data-testid={`input-line-desc-${idx}`} value={item.description} onChange={(e) => {
                          const current = suppForm.getValues("lineItems") || [];
                          current[idx] = { ...current[idx], description: e.target.value };
                          suppForm.setValue("lineItems", current);
                        }} />
                        <Input type="number" placeholder="Qty" className="w-20" data-testid={`input-line-qty-${idx}`} value={item.quantity} onChange={(e) => {
                          const current = suppForm.getValues("lineItems") || [];
                          current[idx] = { ...current[idx], quantity: Number(e.target.value) };
                          suppForm.setValue("lineItems", current);
                        }} />
                        <Input type="number" step="0.01" placeholder="Cost" className="w-24" data-testid={`input-line-cost-${idx}`} value={item.unitCost} onChange={(e) => {
                          const current = suppForm.getValues("lineItems") || [];
                          current[idx] = { ...current[idx], unitCost: Number(e.target.value) };
                          suppForm.setValue("lineItems", current);
                        }} />
                        <Button type="button" size="sm" variant="ghost" onClick={() => {
                          const current = suppForm.getValues("lineItems") || [];
                          suppForm.setValue("lineItems", current.filter((_, i) => i !== idx));
                        }} data-testid={`button-remove-line-${idx}`}>
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={createSuppMutation.isPending} data-testid="button-submit-supplement">
                  {createSuppMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Submit Supplement"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {!supplementsList?.length ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No supplements filed</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead>Approved</TableHead>
                  <TableHead>Denied</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Submitted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {supplementsList.map((s) => (
                  <TableRow key={s.id} data-testid={`row-supplement-${s.id}`}>
                    <TableCell>
                      <Badge variant="outline" className="capitalize text-[10px]">{s.category || "\u2014"}</Badge>
                    </TableCell>
                    <TableCell className="text-sm max-w-[200px] truncate" title={s.description || ""}>{s.description || "\u2014"}</TableCell>
                    <TableCell>${s.amountRequested?.toLocaleString() ?? "0"}</TableCell>
                    <TableCell>${s.amountApproved?.toLocaleString() ?? "0"}</TableCell>
                    <TableCell>${s.amountDenied?.toLocaleString() ?? "0"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">{s.status}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {s.dateSubmitted ? new Date(s.dateSubmitted).toLocaleDateString() : "\u2014"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {playbookRecs && (
        <Card data-testid="card-playbook-recs">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Brain className="w-4 h-4 text-primary" />
              Playbook Recommendations
              <Badge variant="outline" className="ml-1 text-[10px]">{playbookRecs.method}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {playbookRecs.aiStrategy && (
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-3" data-testid="card-ai-strategy">
                <div className="flex items-center gap-2 text-xs font-semibold text-primary uppercase tracking-wide">
                  <Brain className="w-3.5 h-3.5" /> AI Strategy
                </div>
                {playbookRecs.aiStrategy.summary && (
                  <p className="text-sm" data-testid="text-ai-strategy-summary">{playbookRecs.aiStrategy.summary}</p>
                )}
                {playbookRecs.aiStrategy.prioritizedSteps.length > 0 && (
                  <div className="space-y-1.5">
                    {playbookRecs.aiStrategy.prioritizedSteps.map((s, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs" data-testid={`text-ai-step-${i}`}>
                        <Badge
                          className={`shrink-0 text-[10px] mt-0.5 border-0 ${
                            s.priority === "critical"
                              ? "bg-red-600 text-white"
                              : s.priority === "high"
                              ? "bg-amber-500 text-black"
                              : "bg-secondary text-secondary-foreground"
                          }`}
                        >
                          {s.priority}
                        </Badge>
                        <div>
                          <span className="font-medium">{s.step}</span>
                          {s.rationale && <span className="text-muted-foreground"> — {s.rationale}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {playbookRecs.aiStrategy.keyLeveragePoints.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Key Leverage</p>
                    <div className="flex flex-wrap gap-1">
                      {playbookRecs.aiStrategy.keyLeveragePoints.map((p, i) => (
                        <Badge key={i} variant="outline" className="text-[10px]">{p}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {playbookRecs.aiStrategy.warningFlags.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Watch For</p>
                    <div className="flex flex-wrap gap-1">
                      {playbookRecs.aiStrategy.warningFlags.map((w, i) => (
                        <Badge key={i} variant="outline" className="text-[10px] border-yellow-500/50 text-yellow-400">{w}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            {playbookRecs.recommendations.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground" data-testid="playbook-recs-empty">
                <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No matching playbook entries yet.</p>
                <p className="text-xs mt-1 opacity-70">
                  Add carrier, loss type, and outcome data to this claim to unlock recommendations.
                  Entries grow as your playbook library is populated.
                </p>
              </div>
            ) : (
              playbookRecs.recommendations.map((rec) => {
                const isAi = rec.playbook.source === "ai_generated";
                return (
                  <div key={rec.playbook.id} className={`rounded-md border p-3 space-y-2 ${isAi ? "border-primary/30 bg-primary/5" : "border-border"}`} data-testid={`playbook-rec-${rec.playbook.id}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 min-w-0">
                        {isAi && (
                          <Badge className="shrink-0 text-[10px] bg-primary/20 text-primary border border-primary/30 mt-0.5" variant="outline" data-testid={`badge-ai-generated-${rec.playbook.id}`}>
                            AI
                          </Badge>
                        )}
                        <p className="text-sm font-medium">{rec.playbook.title}</p>
                      </div>
                      {!isAi && (
                        <div className="flex items-center gap-2 shrink-0" data-testid={`rec-match-score-${rec.playbook.id}`}>
                          <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full bg-primary transition-all"
                              style={{ width: `${Math.min(rec.matchScore, 100)}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground">{rec.matchScore}%</span>
                        </div>
                      )}
                    </div>
                    {rec.playbook.recommendedNextStep && (
                      <p className="text-xs text-muted-foreground">{rec.playbook.recommendedNextStep}</p>
                    )}
                    {(rec.matchReasons?.length ?? 0) > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {rec.matchReasons?.map((r: string, i: number) => (
                          <Badge key={i} variant="outline" className="text-[10px]">{r}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      )}

      {candidates && candidates.length > 0 && (
        <Card data-testid="card-timeline-review">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Calendar className="w-4 h-4 text-amber-500" />
              Suggested Dates — Needs Review
              <Badge variant="secondary" className="ml-1">{candidates.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {candidates.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 rounded-md border border-border p-3" data-testid={`candidate-${c.id}`}>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{c.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.extractedDate ? new Date(c.extractedDate).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "—"}
                    {c.dateSource ? ` · ${c.dateSource}` : ""}
                    {c.confidenceScore != null ? ` · ${Math.round(c.confidenceScore * 100)}% confidence` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button size="sm" variant="outline" disabled={reviewMutation.isPending} onClick={() => reviewMutation.mutate({ id: c.id, action: "accept" })} data-testid={`button-accept-candidate-${c.id}`}>
                    <CheckCircle className="w-3.5 h-3.5" /> Accept
                  </Button>
                  <Button size="sm" variant="ghost" disabled={reviewMutation.isPending} onClick={() => reviewMutation.mutate({ id: c.id, action: "reject" })} data-testid={`button-reject-candidate-${c.id}`}>
                    <XCircle className="w-3.5 h-3.5" /> Reject
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card data-testid="card-timeline">
        <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            Timeline
          </CardTitle>
          <Button size="sm" variant="outline" disabled={extractMutation.isPending} onClick={() => extractMutation.mutate()} data-testid="button-extract-dates">
            {extractMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Calendar className="w-3.5 h-3.5" />}
            Extract Dates (AI)
          </Button>
        </CardHeader>
        <CardContent>
          {timelineLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : !sortedTimeline.length ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No timeline events</p>
          ) : (
            <div className="relative" data-testid="timeline-events">
              {sortedTimeline.map((event, idx) => {
                const config = EVENT_TYPE_CONFIG[event.eventType] || { icon: FileText, color: "text-muted-foreground" };
                const EventIcon = config.icon;
                const isLast = idx === sortedTimeline.length - 1;

                return (
                  <div key={event.id} className="flex gap-3" data-testid={`timeline-event-${event.id}`}>
                    <div className="flex flex-col items-center">
                      <div className={`flex items-center justify-center w-8 h-8 rounded-full bg-muted shrink-0 ${config.color}`}>
                        <EventIcon className="w-4 h-4" />
                      </div>
                      {!isLast && (
                        <div className="w-0.5 bg-border flex-1 min-h-[24px]" />
                      )}
                    </div>
                    <div className={`pb-6 ${isLast ? "" : ""}`}>
                      <p className="text-sm font-medium" data-testid={`timeline-title-${event.id}`}>
                        {event.title}
                      </p>
                      {event.description && (
                        <p className="text-xs text-muted-foreground mt-0.5" data-testid={`timeline-desc-${event.id}`}>
                          {event.description}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground/70 mt-1" data-testid={`timeline-date-${event.id}`}>
                        {event.eventDate
                          ? new Date(event.eventDate).toLocaleDateString("en-US", {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "\u2014"}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function InfoRow({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="flex items-start justify-between gap-3 min-w-0">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <span
        className="text-sm font-medium text-right min-w-0 break-all"
        data-testid={testId}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

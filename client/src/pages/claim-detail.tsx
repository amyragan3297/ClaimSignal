import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import type { Claim, Supplement, TimelineEvent } from "@shared/schema";
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
} from "lucide-react";
import { useLocation } from "wouter";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

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

const createSupplementSchema = z.object({
  amountRequested: z.coerce.number().min(0, "Amount required"),
  notes: z.string().optional(),
});

export default function ClaimDetailPage() {
  const [, params] = useRoute("/claims/:id");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: authData } = useAuth();
  const userRole = authData?.user?.role || "standard";
  const canToggleUnmasked = userRole === "super_admin";
  const [showUnmasked, setShowUnmasked] = useState(false);

  const claimId = params?.id;

  const { data: claim, isLoading } = useQuery<Claim>({
    queryKey: ["/api/claims", claimId, { unmasked: showUnmasked && canToggleUnmasked }],
    queryFn: async () => {
      const url = showUnmasked && canToggleUnmasked
        ? `/api/claims/${claimId}?unmasked=true`
        : `/api/claims/${claimId}`;
      const res = await apiRequest("GET", url);
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

  const { data: timelineEvents, isLoading: timelineLoading } = useQuery<TimelineEvent[]>({
    queryKey: ["/api/evidence/timeline", claimId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/evidence/timeline/${claimId}`);
      return res.json();
    },
    enabled: !!claimId,
  });

  const [suppDialogOpen, setSuppDialogOpen] = useState(false);

  const suppForm = useForm<z.infer<typeof createSupplementSchema>>({
    resolver: zodResolver(createSupplementSchema),
    defaultValues: { amountRequested: 0, notes: "" },
  });

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
    } catch (err: any) {
      toast({ title: "Export failed", description: err.message, variant: "destructive" });
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

  const statusColor: Record<string, string> = {
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
            variant={(statusColor[claim.status] as any) || "outline"}
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
              {canToggleUnmasked && (
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
              {canToggleUnmasked && (
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
                return (
                  <div key={phase.key} className="flex items-center">
                    <div
                      className={`flex items-center justify-center rounded-md px-2 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                        isCurrent
                          ? "bg-primary text-primary-foreground"
                          : isCompleted
                          ? "bg-primary/20 text-primary"
                          : "bg-muted text-muted-foreground"
                      }`}
                      data-testid={`phase-step-${phase.key}`}
                    >
                      {phase.label}
                    </div>
                    {idx < LIFECYCLE_PHASES.length - 1 && (
                      <div
                        className={`w-4 h-0.5 ${
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

      {canToggleUnmasked && (
        <div className="flex items-center justify-between rounded-md border border-border bg-card p-3">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium" data-testid="text-privacy-label-detail">Data Privacy Mode</p>
              <p className="text-xs text-muted-foreground">PII is masked for non-privileged roles by default to protect homeowner privacy.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{showUnmasked ? "Showing full data" : "PII masked"}</span>
            <Switch
              checked={showUnmasked}
              onCheckedChange={setShowUnmasked}
              data-testid="switch-unmask-toggle-detail"
            />
          </div>
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
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Lifecycle Velocity</span>
                <span
                  className={`text-sm font-medium ${getScoreColor(claim.lifecycleVelocityScore, { good: 30, warn: 60 }, true)}`}
                  data-testid="detail-velocity-score"
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
      </div>

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
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Supplement</DialogTitle>
              </DialogHeader>
              <form onSubmit={suppForm.handleSubmit((d) => createSuppMutation.mutate(d))} className="space-y-4">
                <div className="space-y-2">
                  <Label>Amount Requested ($)</Label>
                  <Input type="number" step="0.01" data-testid="input-supp-amount" {...suppForm.register("amountRequested")} />
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Input data-testid="input-supp-notes" {...suppForm.register("notes")} />
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

      <Card data-testid="card-timeline">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            Timeline
          </CardTitle>
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
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium" data-testid={testId}>{value}</span>
    </div>
  );
}

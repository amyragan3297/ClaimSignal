import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import type { Claim } from "@shared/schema";
import { Plus, Search, FileText, Eye, Loader2, X, Globe, MoreHorizontal, Archive, Trash2, Sparkles } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { claimAnalysisStatus } from "@/lib/data-source";

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
  // ── Expanded intake (additive) ──
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

const statusColors: Record<string, string> = {
  draft: "outline",
  open: "default",
  active: "default",
  in_progress: "secondary",
  inspection_scheduled: "secondary",
  inspected: "secondary",
  supplement_pending: "secondary",
  carrier_review: "secondary",
  approved: "default",
  partially_approved: "secondary",
  denied: "destructive",
  escalated: "destructive",
  overturned: "default",
  closed: "outline",
  archived: "outline",
};

const phaseColors: Record<string, string> = {
  pre_claim: "outline",
  filed: "default",
  inspected: "secondary",
  initial_determination: "secondary",
  supplement_submitted: "secondary",
  reinspection_requested: "secondary",
  escalated: "destructive",
  resolved: "default",
  closed: "outline",
};

const escalationColors = (level: number | null | undefined) => {
  if (level === null || level === undefined) return "outline";
  if (level <= 1) return "secondary";
  if (level <= 3) return "secondary";
  return "destructive";
};

const formatPhase = (phase: string) => {
  return phase
    .split("_")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

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
    queryKey: ["/api/claims/shared"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/claims/shared");
      return res.json();
    },
  });

  const form = useForm<z.infer<typeof createClaimSchema>>({
    resolver: zodResolver(createClaimSchema),
    defaultValues: {
      claimNumber: "",
      carrier: "",
      propertyAddress: "",
      homeownerName: "",
      homeownerPhone: "",
      homeownerEmail: "",
      policyNumber: "",
      insuredName: "",
      lossType: "",
      status: "open",
      notes: "",
      currentPhase: "pre_claim",
      dateOfLoss: "",
      rcvAmount: "",
      acvAmount: "",
      deductible: "",
      claimType: "",
      propertyType: "",
      iaFirm: "",
      vendorName: "",
      vendorType: "",
      vendorFinding: "",
      recoverableDepreciation: "",
      nonRecoverableDepreciation: "",
      priorPayments: "",
      supplementRequested: "",
      supplementApproved: "",
      denialReason: "",
      initialOutcome: "",
      finalOutcome: "",
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
      setDialogOpen(false);
      form.reset();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create claim", description: err.message, variant: "destructive" });
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
    (c) =>
      (c.claimNumber || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.carrier || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.propertyAddress || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      ((c as any).homeownerName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      formatPhase(c.currentPhase || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-claims-title">Claims</h1>
          <p className="text-sm text-muted-foreground">Manage and track property claims</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-claim">
              <Plus className="w-4 h-4" />
              New Claim
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Claim</DialogTitle>
            </DialogHeader>
            <form onSubmit={form.handleSubmit((d) => createMutation.mutate(d))} className="space-y-4">
              <div className="space-y-2">
                <Label>Claim Number</Label>
                <Input placeholder="CLM-00001" data-testid="input-claim-number" {...form.register("claimNumber")} />
                {form.formState.errors.claimNumber && <p className="text-xs text-destructive">{form.formState.errors.claimNumber.message}</p>}
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
                <Select value={form.watch("currentPhase")} onValueChange={(value) => form.setValue("currentPhase", value)}>
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
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Financials & Outcome</p>
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
                        onCheckedChange={(v) => form.setValue("denialOverturned", v === true)}
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

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} data-testid="button-cancel-claim">
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-claim">
                  {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  Create Claim
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

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
                onChange={(e) => setSearchQuery(e.target.value)}
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
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Claim #</TableHead>
                        <TableHead>Carrier</TableHead>
                        <TableHead>Property</TableHead>
                        <TableHead>Homeowner</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Phase</TableHead>
                        <TableHead>Escalation</TableHead>
                        <TableHead>Risk Score</TableHead>
                        <TableHead>Analysis</TableHead>
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredClaims.map((claim) => (
                        <TableRow key={claim.id} className="hover-elevate cursor-pointer" data-testid={`row-claim-${claim.id}`}>
                          <TableCell className="font-mono text-sm" onClick={() => setLocation(`/claims/${claim.id}`)} data-testid={`text-claim-number-${claim.id}`}>{claim.claimNumber}</TableCell>
                          <TableCell onClick={() => setLocation(`/claims/${claim.id}`)} data-testid={`text-carrier-${claim.id}`}>{claim.carrier || "—"}</TableCell>
                          <TableCell className="text-muted-foreground max-w-[200px] truncate" onClick={() => setLocation(`/claims/${claim.id}`)} data-testid={`text-address-${claim.id}`}>
                            {claim.propertyAddress || "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground" onClick={() => setLocation(`/claims/${claim.id}`)} data-testid={`text-homeowner-${claim.id}`}>
                            {(claim as any).homeownerName || "—"}
                          </TableCell>
                          <TableCell onClick={() => setLocation(`/claims/${claim.id}`)}>
                            <Badge variant={(statusColors[claim.status] as any) || "outline"} className="text-xs capitalize">
                              {claim.status.replace("_", " ")}
                            </Badge>
                          </TableCell>
                          <TableCell onClick={() => setLocation(`/claims/${claim.id}`)}>
                            <Badge variant={(phaseColors[claim.currentPhase || ""] as any) || "outline"} className="text-xs" data-testid={`badge-phase-${claim.id}`}>
                              {formatPhase(claim.currentPhase || "")}
                            </Badge>
                          </TableCell>
                          <TableCell onClick={() => setLocation(`/claims/${claim.id}`)}>
                            <Badge variant={(escalationColors(claim.escalationLevel) as any) || "outline"} className="text-xs" data-testid={`badge-escalation-${claim.id}`}>
                              {claim.escalationLevel ?? "—"}
                            </Badge>
                          </TableCell>
                          <TableCell onClick={() => setLocation(`/claims/${claim.id}`)}>
                            {claim.riskScore !== null ? (
                              <Badge variant={claim.riskScore > 70 ? "destructive" : claim.riskScore > 40 ? "secondary" : "outline"} className="text-xs">
                                {claim.riskScore}
                              </Badge>
                            ) : "—"}
                          </TableCell>
                          <TableCell onClick={() => setLocation(`/claims/${claim.id}`)}>
                            {analyzingId === claim.id ? (
                              <Badge variant="outline" className="text-xs gap-1" data-testid={`badge-analysis-${claim.id}`}>
                                <Loader2 className="w-3 h-3 animate-spin" /> Analyzing
                              </Badge>
                            ) : (() => {
                              const s = claimAnalysisStatus(claim);
                              return <Badge variant={s.variant} className="text-xs" data-testid={`badge-analysis-${claim.id}`}>{s.label}</Badge>;
                            })()}
                          </TableCell>
                          <TableCell>
                            {canArchive && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button size="icon" variant="ghost" data-testid={`button-claim-menu-${claim.id}`} onClick={e => e.stopPropagation()}>
                                    <MoreHorizontal className="w-4 h-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    disabled={analyzingId === claim.id}
                                    onClick={(e) => { e.stopPropagation(); aiAnalysisMutation.mutate(claim.id); }}
                                    data-testid={`menu-analyze-claim-${claim.id}`}
                                  >
                                    <Sparkles className="w-4 h-4 mr-2" />
                                    {claim.aiAnalysisAt ? "Re-run AI Analysis" : "Run AI Analysis"}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={(e) => { e.stopPropagation(); setConfirmDialog({ type: "archive", claim }); }}
                                    data-testid={`menu-archive-claim-${claim.id}`}
                                  >
                                    <Archive className="w-4 h-4 mr-2" />
                                    Archive
                                  </DropdownMenuItem>
                                  {isMaster && (
                                    <DropdownMenuItem
                                      className="text-destructive focus:text-destructive"
                                      onClick={(e) => { e.stopPropagation(); setConfirmDialog({ type: "delete", claim }); }}
                                      data-testid={`menu-delete-claim-${claim.id}`}
                                    >
                                      <Trash2 className="w-4 h-4 mr-2" />
                                      Delete Permanently
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                            {!canArchive && <Eye className="w-4 h-4 text-muted-foreground" />}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
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
                onChange={(e) => setSharedSearch(e.target.value)}
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
          </div>

          <Card>
            <CardContent className="p-0">
              {sharedLoading ? (
                <div className="p-6 space-y-3">
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : !sharedClaims?.filter((c) =>
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
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Homeowner</TableHead>
                        <TableHead>Claim #</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Carrier</TableHead>
                        <TableHead>Loss Type</TableHead>
                        <TableHead>Date of Loss</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>RCV</TableHead>
                        <TableHead>Risk</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sharedClaims
                        ?.filter((c) =>
                          !sharedSearch ||
                          (c.carrier || "").toLowerCase().includes(sharedSearch.toLowerCase()) ||
                          (c.propertyAddress || "").toLowerCase().includes(sharedSearch.toLowerCase()) ||
                          (c.lossType || "").toLowerCase().includes(sharedSearch.toLowerCase()) ||
                          (c.status || "").toLowerCase().includes(sharedSearch.toLowerCase())
                        )
                        .map((claim, idx) => (
                          <TableRow key={claim.id || idx} className="hover-elevate" data-testid={`row-shared-${claim.id || idx}`}>
                            <TableCell className="font-mono text-sm text-muted-foreground">{(claim as any).homeownerName || "—"}</TableCell>
                            <TableCell className="font-mono text-sm text-muted-foreground">{claim.claimNumber || "—"}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{claim.propertyAddress || "—"}</TableCell>
                            <TableCell className="text-sm">{claim.carrier || "—"}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{claim.lossType || "—"}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {claim.dateOfLoss ? new Date(claim.dateOfLoss).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "—"}
                            </TableCell>
                            <TableCell>
                              <Badge variant={(statusColors[claim.status] as any) || "outline"} className="text-xs capitalize">
                                {claim.status.replace("_", " ")}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">
                              {claim.rcvAmount ? `$${Number(claim.rcvAmount).toLocaleString()}` : "—"}
                            </TableCell>
                            <TableCell>
                              {claim.riskScore !== null && claim.riskScore !== undefined ? (
                                <Badge variant={claim.riskScore > 70 ? "destructive" : claim.riskScore > 40 ? "secondary" : "outline"} className="text-xs">
                                  {claim.riskScore}
                                </Badge>
                              ) : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
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
          onOpenChange={(o) => { if (!o) setConfirmDialog(null); }}
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

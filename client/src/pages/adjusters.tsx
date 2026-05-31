import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import type { Adjuster } from "@shared/schema";
import { Plus, Users, Loader2, Search, X, ChevronLeft, Activity, BarChart3, Target, MoreHorizontal, Archive, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";

const createAdjusterSchema = z.object({
  carrierName: z.string().min(1, "Carrier name required"),
  adjusterName: z.string().min(1, "Adjuster name required"),
  adjusterEmail: z.string().email("Valid email required").or(z.literal("")).optional(),
  adjusterPhone: z.string().optional(),
  region: z.string().optional(),
  ladderAssistVendor: z.string().optional(),
  isFieldAdjuster: z.boolean().default(false),
  isDeskAdjuster: z.boolean().default(false),
});

function formatPercent(val: number | null | undefined): string {
  if (val == null) return "\u2014";
  return `${(val * 100).toFixed(1)}%`;
}

function formatScore(val: number | null | undefined): string {
  if (val == null) return "\u2014";
  return val.toFixed(1);
}

function ScoreCard({ label, value, max = 10 }: { label: string; value: number | null | undefined; max?: number }) {
  const score = value ?? 0;
  const pct = Math.min((score / max) * 100, 100);
  const color = score <= 3 ? "text-green-500" : score <= 6 ? "text-yellow-500" : "text-red-500";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className={`text-sm font-semibold ${color}`}>{formatScore(value)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted">
        <div className={`h-full rounded-full ${score <= 3 ? "bg-green-500" : score <= 6 ? "bg-yellow-500" : "bg-red-500"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

type LinkedClaim = {
  id: string;
  claimId: string;
  roleOnClaim: string;
  involvementType: string;
  sourceType: string;
  needsReview: boolean;
  claimNumber: string | null;
  carrier: string | null;
  status: string | null;
  initialOutcome: string | null;
  finalOutcome: string | null;
  denialOverturned: boolean | null;
};

const ROLE_LABELS: Record<string, string> = {
  primary_adjuster: "Primary Adjuster", field_adjuster: "Field Adjuster", desk_adjuster: "Desk Adjuster",
  catastrophe_adjuster: "Catastrophe Adjuster", supervisor: "Supervisor", team_lead: "Team Lead",
  reinspection_adjuster: "Reinspection Adjuster", supplement_adjuster: "Supplement Adjuster",
  appraisal_contact: "Appraisal Contact", carrier_representative: "Carrier Representative", unknown: "Role pending review",
};

function LinkedClaimsCard({ adjusterId }: { adjusterId: string }) {
  const { data, isLoading } = useQuery<{ linkedClaimCount: number; links: LinkedClaim[] }>({
    queryKey: ["/api/adjusters", adjusterId, "claims"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/adjusters/${adjusterId}/claims`);
      return res.json();
    },
  });

  const links = data?.links ?? [];
  const carriers = Array.from(new Set(links.map((l) => l.carrier).filter(Boolean))) as string[];
  const overturned = links.filter((l) => l.denialOverturned).length;
  const initialDenials = links.filter(
    (l) => (l.initialOutcome || "").toLowerCase().includes("deni") || l.involvementType === "denied",
  ).length;
  const finalApprovals = links.filter(
    (l) => l.denialOverturned || (l.finalOutcome || "").toLowerCase().includes("approv") || l.involvementType === "approved",
  ).length;
  const partials = links.filter(
    (l) => (l.finalOutcome || "").toLowerCase().includes("partial") || l.involvementType === "partially_approved",
  ).length;
  const reinspections = links.filter((l) => l.roleOnClaim === "reinspection_adjuster" || l.involvementType === "handled_reinspection").length;
  const escalations = links.filter((l) => l.involvementType === "escalated_review").length;

  return (
    <Card data-testid="card-linked-claims">
      <CardHeader className="flex flex-row items-center gap-2 pb-3">
        <Activity className="w-4 h-4 text-muted-foreground" />
        <CardTitle className="text-base">Linked Claims (cross-claim history)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading linked claims…</p>
        ) : links.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="text-no-linked-claims">
            Not enough linked claim evidence. Profile exists. Linked claim evidence pending.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
              <div className="text-center"><p className="text-2xl font-bold" data-testid="text-linked-count">{data?.linkedClaimCount ?? links.length}</p><p className="text-xs text-muted-foreground">Linked Claims</p></div>
              <div className="text-center"><p className="text-2xl font-bold">{initialDenials}</p><p className="text-xs text-muted-foreground">Initial Denials</p></div>
              <div className="text-center"><p className="text-2xl font-bold text-emerald-400" data-testid="text-overturned">{overturned}</p><p className="text-xs text-muted-foreground">Overturned</p></div>
              <div className="text-center"><p className="text-2xl font-bold">{finalApprovals}</p><p className="text-xs text-muted-foreground">Final Approvals</p></div>
              <div className="text-center"><p className="text-2xl font-bold">{partials}</p><p className="text-xs text-muted-foreground">Partial Approvals</p></div>
              <div className="text-center"><p className="text-2xl font-bold">{reinspections + escalations}</p><p className="text-xs text-muted-foreground">Reinsp. / Escal.</p></div>
            </div>

            {carriers.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground">Carriers:</span>
                {carriers.map((c) => <Badge key={c} variant="secondary" data-testid={`badge-carrier-${c}`}>{c}</Badge>)}
              </div>
            )}

            <div className="space-y-2">
              {links.map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-3 rounded-md border border-border bg-card/50 px-3 py-2" data-testid={`row-linked-claim-${l.id}`}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{l.claimNumber ?? "Claim"}</span>
                      <Badge variant={l.roleOnClaim === "unknown" ? "outline" : "secondary"} className={l.roleOnClaim === "unknown" ? "text-amber-500 border-amber-500/40" : ""}>
                        {ROLE_LABELS[l.roleOnClaim] ?? "Role pending review"}
                      </Badge>
                      {l.denialOverturned && <Badge variant="outline" className="text-emerald-400 border-emerald-500/40">Denial Overturned</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {l.carrier ?? "Carrier unknown"}
                      {l.denialOverturned
                        ? " · Denied \u2192 Overturned to Approval"
                        : l.finalOutcome
                        ? ` · ${l.finalOutcome.replace(/_/g, " ")}`
                        : l.initialOutcome
                        ? ` · ${l.initialOutcome.replace(/_/g, " ")}`
                        : ""}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">MVP rule-based aggregation from linked claim evidence; not yet a learned model.</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function AdjusterDetail({ adjuster, onBack }: { adjuster: Adjuster; onBack: () => void }) {
  const tracked = adjuster.totalClaimsTracked ?? 0;
  const basisNote =
    tracked === 0
      ? "No linked claim evidence yet — scores shown are seeded/directional, not yet derived from your claims."
      : tracked < 5
        ? `Based on ${tracked} tracked claim${tracked === 1 ? "" : "s"} — directional only.`
        : null;
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} data-testid="button-back-adjusters">
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-adjuster-detail-name">{adjuster.adjusterName}</h1>
          <p className="text-sm text-muted-foreground">{adjuster.carrierName}</p>
        </div>
        <div className="flex items-center gap-2 ml-auto flex-wrap">
          {adjuster.isFieldAdjuster && <Badge variant="secondary" data-testid="badge-field-adjuster">Field</Badge>}
          {adjuster.isDeskAdjuster && <Badge variant="secondary" data-testid="badge-desk-adjuster">Desk</Badge>}
        </div>
      </div>

      {basisNote && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-500" data-testid="text-adjuster-basis">
          <Activity className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>{basisNote}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4 space-y-1">
            <p className="text-xs text-muted-foreground">Email</p>
            <p className="text-sm font-medium" data-testid="text-adjuster-email">{adjuster.adjusterEmail || "\u2014"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 space-y-1">
            <p className="text-xs text-muted-foreground">Phone</p>
            <p className="text-sm font-medium" data-testid="text-adjuster-phone">{adjuster.adjusterPhone || "\u2014"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 space-y-1">
            <p className="text-xs text-muted-foreground">Region</p>
            <p className="text-sm font-medium" data-testid="text-adjuster-region">{adjuster.region || "\u2014"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 space-y-1">
            <p className="text-xs text-muted-foreground">Ladder Assist Vendor</p>
            <p className="text-sm font-medium" data-testid="text-adjuster-vendor">{adjuster.ladderAssistVendor || "\u2014"}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-3">
            <Target className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-base">Intelligence Scores</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ScoreCard label="Friction Score" value={adjuster.frictionScore} />
            <ScoreCard label="Integrity Score" value={adjuster.integrityScore} />
            <ScoreCard label="Escalation Score" value={adjuster.escalationScore} />
            <ScoreCard label="Outcome Migration Score" value={adjuster.outcomeMigrationScore} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-3">
            <Activity className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-base">Behavior Metrics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <div>
                <p className="text-xs text-muted-foreground">Avg Response Time</p>
                <p className="text-sm font-semibold" data-testid="text-avg-response">{adjuster.avgResponseTimeHours != null ? `${adjuster.avgResponseTimeHours}h` : "\u2014"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Avg Days to Determination</p>
                <p className="text-sm font-semibold" data-testid="text-avg-determination">{adjuster.avgDaysToInitialDetermination != null ? `${adjuster.avgDaysToInitialDetermination}d` : "\u2014"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Supplement Acceptance</p>
                <p className="text-sm font-semibold">{formatPercent(adjuster.supplementAcceptanceRate)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Reinspection Rate</p>
                <p className="text-sm font-semibold">{formatPercent(adjuster.reinspectionRate)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Denial Rate</p>
                <p className="text-sm font-semibold">{formatPercent(adjuster.denialRate)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Escalation Trigger</p>
                <p className="text-sm font-semibold">{formatPercent(adjuster.escalationTriggerRate)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2 pb-3">
          <BarChart3 className="w-4 h-4 text-muted-foreground" />
          <CardTitle className="text-base">Volume Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold" data-testid="text-total-claims">{adjuster.totalClaimsTracked ?? 0}</p>
              <p className="text-xs text-muted-foreground">Claims Tracked</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold">{adjuster.totalDenials ?? 0}</p>
              <p className="text-xs text-muted-foreground">Denials</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold">{adjuster.totalReinspections ?? 0}</p>
              <p className="text-xs text-muted-foreground">Reinspections</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold">{adjuster.totalSupplementsRequested ?? 0}</p>
              <p className="text-xs text-muted-foreground">Supps Requested</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold">{adjuster.totalSupplementsApproved ?? 0}</p>
              <p className="text-xs text-muted-foreground">Supps Approved</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <LinkedClaimsCard adjusterId={adjuster.id} />
    </div>
  );
}

export default function AdjustersPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedAdjuster, setSelectedAdjuster] = useState<Adjuster | null>(null);
  const { toast } = useToast();
  const { data: authData } = useAuth();
  const userRole = authData?.user?.role || "standard";
  const isMaster = userRole === "super_admin";
  const canArchive = !["carrier_analyst"].includes(userRole);
  const [confirmDialog, setConfirmDialog] = useState<{ type: "archive" | "delete"; adjuster: Adjuster } | null>(null);

  const { data: adjustersList, isLoading } = useQuery<Adjuster[]>({
    queryKey: ["/api/adjusters"],
  });

  const form = useForm<z.infer<typeof createAdjusterSchema>>({
    resolver: zodResolver(createAdjusterSchema),
    defaultValues: {
      carrierName: "",
      adjusterName: "",
      adjusterEmail: "",
      adjusterPhone: "",
      region: "",
      ladderAssistVendor: "",
      isFieldAdjuster: false,
      isDeskAdjuster: false,
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: z.infer<typeof createAdjusterSchema>) => {
      const payload = {
        ...data,
        adjusterEmail: data.adjusterEmail || undefined,
        adjusterPhone: data.adjusterPhone || undefined,
        region: data.region || undefined,
        ladderAssistVendor: data.ladderAssistVendor || undefined,
      };
      await apiRequest("POST", "/api/adjusters", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/adjusters"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "Adjuster added successfully" });
      setDialogOpen(false);
      form.reset();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to add adjuster", description: err.message, variant: "destructive" });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("PATCH", `/api/adjusters/${id}/archive`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/adjusters"] });
      toast({ title: "Adjuster archived" });
      setConfirmDialog(null);
    },
    onError: (err: Error) => {
      toast({ title: "Archive failed", description: err.message, variant: "destructive" });
    },
  });

  const permanentDeleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/adjusters/${id}/permanent`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/adjusters"] });
      toast({ title: "Adjuster permanently deleted" });
      setConfirmDialog(null);
    },
    onError: (err: Error) => {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    },
  });

  const filteredAdjusters = adjustersList?.filter(
    (a) =>
      (a.adjusterName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (a.carrierName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (a.region || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (selectedAdjuster) {
    const fresh = adjustersList?.find((a) => a.id === selectedAdjuster.id) || selectedAdjuster;
    return <AdjusterDetail adjuster={fresh} onBack={() => setSelectedAdjuster(null)} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-adjusters-title">Adjusters</h1>
          <p className="text-sm text-muted-foreground">Track and manage insurance adjusters</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-adjuster">
              <Plus className="w-4 h-4" />
              Add Adjuster
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Adjuster</DialogTitle>
              <DialogDescription>Enter the adjuster's details below.</DialogDescription>
            </DialogHeader>
            <form onSubmit={form.handleSubmit((d) => createMutation.mutate(d))} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Adjuster Name</Label>
                  <Input placeholder="John Smith" data-testid="input-adjuster-name" {...form.register("adjusterName")} />
                  {form.formState.errors.adjusterName && <p className="text-xs text-destructive">{form.formState.errors.adjusterName.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Carrier Name</Label>
                  <Input placeholder="State Farm" data-testid="input-adjuster-carrier" {...form.register("carrierName")} />
                  {form.formState.errors.carrierName && <p className="text-xs text-destructive">{form.formState.errors.carrierName.message}</p>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input placeholder="adjuster@carrier.com" data-testid="input-adjuster-email" {...form.register("adjusterEmail")} />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input placeholder="555-0100" data-testid="input-adjuster-phone" {...form.register("adjusterPhone")} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Region</Label>
                  <Input placeholder="Southeast, Texas..." data-testid="input-adjuster-region" {...form.register("region")} />
                </div>
                <div className="space-y-2">
                  <Label>Ladder Assist Vendor</Label>
                  <Input placeholder="Vendor name" data-testid="input-adjuster-vendor" {...form.register("ladderAssistVendor")} />
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={form.watch("isFieldAdjuster")}
                    onCheckedChange={(v) => form.setValue("isFieldAdjuster", v)}
                    data-testid="switch-field-adjuster"
                  />
                  <Label className="text-sm">Field Adjuster</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={form.watch("isDeskAdjuster")}
                    onCheckedChange={(v) => form.setValue("isDeskAdjuster", v)}
                    data-testid="switch-desk-adjuster"
                  />
                  <Label className="text-sm">Desk Adjuster</Label>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-adjuster">
                  {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  Add Adjuster
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search adjusters..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid="input-search-adjusters"
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
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !filteredAdjusters?.length ? (
            <div className="p-12 text-center">
              <Users className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground font-medium">No adjusters found</p>
              <p className="text-sm text-muted-foreground/70 mb-4">
                {searchQuery ? "Try adjusting your search" : "Add your first adjuster to start tracking"}
              </p>
              {!searchQuery && (
                <Button variant="outline" onClick={() => setDialogOpen(true)} data-testid="button-empty-new-adjuster">
                  <Plus className="w-4 h-4" />
                  Add Adjuster
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Adjuster</TableHead>
                    <TableHead>Carrier</TableHead>
                    <TableHead>Region</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Claims</TableHead>
                    <TableHead className="text-right">Friction</TableHead>
                    <TableHead className="text-right">Denial Rate</TableHead>
                    {canArchive && <TableHead className="w-10"></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAdjusters.map((adj) => (
                    <TableRow
                      key={adj.id}
                      className="cursor-pointer hover-elevate"
                      data-testid={`row-adjuster-${adj.id}`}
                    >
                      <TableCell className="font-medium" onClick={() => setSelectedAdjuster(adj)} data-testid={`text-adjuster-name-${adj.id}`}>{adj.adjusterName}</TableCell>
                      <TableCell onClick={() => setSelectedAdjuster(adj)} data-testid={`text-adjuster-carrier-${adj.id}`}>{adj.carrierName}</TableCell>
                      <TableCell onClick={() => setSelectedAdjuster(adj)}>{adj.region || "\u2014"}</TableCell>
                      <TableCell onClick={() => setSelectedAdjuster(adj)}>
                        <div className="flex items-center gap-1">
                          {adj.isFieldAdjuster && <Badge variant="secondary" className="text-xs">Field</Badge>}
                          {adj.isDeskAdjuster && <Badge variant="secondary" className="text-xs">Desk</Badge>}
                          {!adj.isFieldAdjuster && !adj.isDeskAdjuster && <span className="text-muted-foreground">{"\u2014"}</span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right" onClick={() => setSelectedAdjuster(adj)}>{adj.totalClaimsTracked ?? 0}</TableCell>
                      <TableCell className="text-right" onClick={() => setSelectedAdjuster(adj)}>
                        <span className={`font-medium ${(adj.frictionScore ?? 0) > 6 ? "text-red-500" : (adj.frictionScore ?? 0) > 3 ? "text-yellow-500" : "text-green-500"}`}>
                          {formatScore(adj.frictionScore)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right" onClick={() => setSelectedAdjuster(adj)}>{formatPercent(adj.denialRate)}</TableCell>
                      {canArchive && (
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon" variant="ghost" data-testid={`button-adjuster-menu-${adj.id}`} onClick={e => e.stopPropagation()}>
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setConfirmDialog({ type: "archive", adjuster: adj }); }} data-testid={`menu-archive-adjuster-${adj.id}`}>
                                <Archive className="w-4 h-4 mr-2" />
                                Archive
                              </DropdownMenuItem>
                              {isMaster && (
                                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={(e) => { e.stopPropagation(); setConfirmDialog({ type: "delete", adjuster: adj }); }} data-testid={`menu-delete-adjuster-${adj.id}`}>
                                  <Trash2 className="w-4 h-4 mr-2" />
                                  Delete Permanently
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {confirmDialog && (
        <ConfirmDialog
          open={!!confirmDialog}
          onOpenChange={(o) => { if (!o) setConfirmDialog(null); }}
          title={confirmDialog.type === "archive" ? "Archive Adjuster" : "Permanently Delete Adjuster"}
          description={
            confirmDialog.type === "archive"
              ? `Archive adjuster "${confirmDialog.adjuster.adjusterName}"? They will be hidden from normal views and can be restored from the Admin Governance Hub.`
              : `Permanently delete "${confirmDialog.adjuster.adjusterName}"? This cannot be undone.`
          }
          confirmLabel={confirmDialog.type === "archive" ? "Archive" : "Delete Permanently"}
          variant={confirmDialog.type === "delete" ? "destructive" : "default"}
          isPending={archiveMutation.isPending || permanentDeleteMutation.isPending}
          onConfirm={() => {
            if (!confirmDialog) return;
            if (confirmDialog.type === "archive") {
              archiveMutation.mutate(confirmDialog.adjuster.id);
            } else {
              permanentDeleteMutation.mutate(confirmDialog.adjuster.id);
            }
          }}
        />
      )}
    </div>
  );
}
